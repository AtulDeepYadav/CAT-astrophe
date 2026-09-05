import sys, os, time
from collections import deque
from PIL import Image
import numpy as np

SRC_DIR = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else '.'

FILES = {
    2: '2. Tabby Cat.png',
    3: '3. Fluffy Cat.png',
    4: '4. House Cat.png',
    5: '5. Wild Cat.png',
    6: '6. Lynx.png',
    7: '7. Cheetah.png',
    8: '8. Leopard.png',
    9: '9. Tiger.png',
    10: '10. Lion.png',
}


def border_palette(arr, ring=3):
    pts = np.concatenate([
        arr[:ring, :, :].reshape(-1, 3),
        arr[-ring:, :, :].reshape(-1, 3),
        arr[:, :ring, :].reshape(-1, 3),
        arr[:, -ring:, :].reshape(-1, 3),
    ], axis=0).astype(np.int32)
    q = (pts // 4) * 4
    return np.unique(q, axis=0)


def bg_like_adaptive(arr, tol=18):
    """Per-image background classifier: matches pixels against a palette sampled from the
    image's own border (guaranteed background) rather than a fixed global color rule — the
    9 reference sheets mix a cool gray/white transparency checker with a warm cream+paw-print
    design, so no single hardcoded rule covers both."""
    palette = border_palette(arr)
    h, w, _ = arr.shape
    flat = arr.reshape(-1, 3).astype(np.int32)
    N = flat.shape[0]
    min_dist = np.full(N, 1e9, dtype=np.float32)
    chunk = 200000
    for i in range(0, N, chunk):
        block = flat[i:i + chunk][:, None, :]
        d = np.sqrt((((block - palette[None, :, :]).astype(np.float32)) ** 2).sum(axis=2)).min(axis=1)
        min_dist[i:i + chunk] = d
    return (min_dist < tol).reshape(h, w)


def remove_bg(im, tol=18):
    arr = np.array(im.convert('RGB'))
    bg_like = bg_like_adaptive(arr, tol=tol)
    h, w = bg_like.shape
    reachable = np.zeros((h, w), dtype=bool)
    reachable[0, :] = bg_like[0, :]
    reachable[-1, :] = bg_like[-1, :]
    reachable[:, 0] = bg_like[:, 0]
    reachable[:, -1] = bg_like[:, -1]
    for _ in range(2000):
        grown = reachable.copy()
        grown[1:, :] |= reachable[:-1, :]
        grown[:-1, :] |= reachable[1:, :]
        grown[:, 1:] |= reachable[:, :-1]
        grown[:, :-1] |= reachable[:, 1:]
        grown &= bg_like
        if np.array_equal(grown, reachable):
            break
        reachable = grown
    alpha = np.where(reachable, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([arr, alpha]), 'RGBA')


def find_bands(rowsum, min_height=20, gap_thresh=4):
    bands = []
    in_band = False
    start = 0
    for y, v in enumerate(rowsum):
        if v > gap_thresh and not in_band:
            in_band = True
            start = y
        elif v <= gap_thresh and in_band:
            in_band = False
            if y - start >= min_height:
                bands.append((start, y))
    if in_band and len(rowsum) - start >= min_height:
        bands.append((start, len(rowsum)))
    return bands


def connected_components(mask):
    H, W = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    comps = []
    for sy in range(H):
        row = mask[sy]
        if not row.any():
            continue
        for sx in range(W):
            if row[sx] and not visited[sy, sx]:
                q = deque([(sy, sx)])
                visited[sy, sx] = True
                minx = maxx = sx
                miny = maxy = sy
                count = 0
                while q:
                    y, x = q.popleft()
                    count += 1
                    if x < minx: minx = x
                    if x > maxx: maxx = x
                    if y < miny: miny = y
                    if y > maxy: maxy = y
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not visited[ny, nx]:
                                visited[ny, nx] = True
                                q.append((ny, nx))
                comps.append((count, minx, maxx + 1, miny, maxy + 1))
    return comps


LABEL_FRACTION = 0.18
# Tabby's row1 band is unusually short and its "Paw Up"-style poses sit closer to the label
# pill than other sheets — the default fraction cropped off a chunk of the cat's own lower body.
# The real gap there was hand-verified at ~99.5% of the band instead.
LABEL_FRACTION_OVERRIDE = {2: 0.005}


# The Lion's golden mane sits too close in color to its own warm cream+paw-print
# background for the default tolerance — a tighter match still fully clears that
# background (it's a flatter, lower-contrast pattern than the others) without eating fur.
TOL_OVERRIDE = {10: 3, 6: 4}

# The Lion sheet's hero image is unusually tall (that mane needs room), leaving no clean gap
# between the hero and row1 for the generic band/column detector to find — row1 there was
# hand-verified instead of auto-detected. (level, tol) -> explicit (y0, y1, idle_box, blink_box).
MANUAL_ROW1 = {
    10: (600, 835, (16, 257, 600, 835), (258, 513, 600, 835)),
}


def process(level, filename):
    t0 = time.time()
    path = os.path.join(SRC_DIR, filename)
    im = Image.open(path)
    # Band/column detection always runs against the default-tolerance cutout: a level's
    # TOL_OVERRIDE exists specifically because a *lower* tolerance is needed to stop that level's
    # own fur from being eaten, but that same lower tolerance clears less background overall and
    # can blur away the hero/row1 gap the detector relies on. Final crops use the override cutout.
    detect_cutout = remove_bg(im, tol=18) if level in TOL_OVERRIDE else None
    cutout = remove_bg(im, tol=TOL_OVERRIDE.get(level, 18))
    alpha = np.array(cutout)[:, :, 3]
    detect_alpha = np.array(detect_cutout)[:, :, 3] if detect_cutout is not None else alpha

    bands = None
    if level in MANUAL_ROW1:
        _, _, idle_box, blink_box = MANUAL_ROW1[level]
    else:
        rowsum = (detect_alpha > 10).sum(axis=1)
        for gap_thresh in (4, 8, 12, 20, 30):
            b = find_bands(rowsum, min_height=20, gap_thresh=gap_thresh)
            if len(b) >= 3:
                bands = b
                break
        if not bands:
            raise RuntimeError(f'level {level}: no clean band split found, last try: {find_bands(rowsum, 20, 30)}')

        hero_idx = max(range(len(bands)), key=lambda i: bands[i][1] - bands[i][0])
        # Ignore small fringe/noise bands (a stray paw or tail tip separated from the hero image)
        # — row1 is a substantial band, not the first band of any size after the hero.
        later = [b for b in bands if b[0] > bands[hero_idx][0] and (b[1] - b[0]) >= 100]
        if not later:
            raise RuntimeError(f'level {level}: no substantial band after hero: {bands}')
        row1_band = min(later, key=lambda b: b[0])
        y0, y1_full = row1_band
        y1 = y0 + round((y1_full - y0) * (1 - LABEL_FRACTION_OVERRIDE.get(level, LABEL_FRACTION)))

        mask = detect_alpha[y0:y1, :] > 10
        comps = [c for c in connected_components(mask) if c[0] > 200]
        comps = [(cnt, l, r, t + y0, b + y0) for cnt, l, r, t, b in comps]
        if len(comps) < 2:
            raise RuntimeError(f'level {level}: found only {len(comps)} raw components in row1: {comps}')

        # Some poses (e.g. a lynx's tufted fur) split into stacked fragments at 8-connectivity, so
        # a component isn't the same thing as a pose column. There are always exactly 5 pose
        # columns across row1 — sort every fragment by x-center and merge into 5 groups by cutting
        # at the 4 largest gaps between consecutive x-centers (real column gaps are always far
        # bigger than the tiny gaps between same-column fragments, regardless of each sheet's own
        # exact spacing).
        items = sorted(comps, key=lambda c: (c[1] + c[2]) / 2)
        centers = [(c[1] + c[2]) / 2 for c in items]
        gaps = [(centers[i + 1] - centers[i], i) for i in range(len(centers) - 1)]
        gaps.sort(reverse=True)
        n_cuts = min(4, len(gaps))
        cut_after = sorted(i for _, i in gaps[:n_cuts])

        clusters = []
        start = 0
        for cut in cut_after + [len(items) - 1]:
            group = items[start:cut + 1]
            l = min(c[1] for c in group)
            r = max(c[2] for c in group)
            t = min(c[3] for c in group)
            b = max(c[4] for c in group)
            clusters.append({'l': l, 'r': r, 't': t, 'b': b})
            start = cut + 1
        clusters.sort(key=lambda c: c['l'])
        if len(clusters) < 2:
            raise RuntimeError(f'level {level}: found only {len(clusters)} pose columns in row1: {clusters}')

        idle_box = (clusters[0]['l'], clusters[0]['r'], clusters[0]['t'], clusters[0]['b'])
        blink_box = (clusters[1]['l'], clusters[1]['r'], clusters[1]['t'], clusters[1]['b'])

    def crop_padded(box, other_box):
        l, r, t, b = box
        ol, orr, ot, ob = other_box
        gap_left = 99 if l <= ol else max(0, l - orr)
        gap_right = 99 if r >= orr else max(0, ol - r)
        pad_l = min(6, gap_left // 2)
        pad_r = min(6, gap_right // 2)
        return cutout.crop((l - pad_l, t - 4, r + pad_r, b + 4))

    idle_crop = crop_padded(idle_box, blink_box)
    blink_crop = crop_padded(blink_box, idle_box)

    cw = max(idle_crop.width, blink_crop.width)
    ch = max(idle_crop.height, blink_crop.height)

    out_dir = os.path.join(OUT_DIR, f'level-{level}')
    os.makedirs(out_dir, exist_ok=True)
    for name, crop in (('idle', idle_crop), ('blink', blink_crop)):
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        x = (cw - crop.width) // 2
        y = ch - crop.height
        canvas.paste(crop, (x, y), crop)
        canvas.save(os.path.join(out_dir, f'{name}.png'))

    print(f'level {level}: OK bands={bands} idle={idle_box} blink={blink_box} canvas=({cw},{ch}) [{time.time()-t0:.1f}s]')


if __name__ == '__main__':
    failures = []
    for level, filename in FILES.items():
        try:
            process(level, filename)
        except Exception as e:
            failures.append((level, str(e)))
            print(f'level {level}: FAILED - {e}')
    if failures:
        print('\nFAILURES:', failures)
