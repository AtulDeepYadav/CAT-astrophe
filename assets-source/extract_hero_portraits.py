"""
Extracts a single large "hero portrait" cutout per cat level from the same Cat Photos/*.png
reference sheets extract_frames.py already draws the in-game idle/blink sprites from — this is
the big top illustration on each sheet, not the small pose-grid frames below it.

Reuses extract_frames.py's remove_bg (border-palette background classification + a flood fill
grown in from the four edges) since that's already been hand-tuned per level to cleanly clear
each sheet's own background style (checkerboard, cream+paw-print, starry sky, temple gradient)
without eating into cat fur.

Unlike extract_frames.py's pose crops, the hero illustration can't be isolated by automatic
band/connected-component detection alone: on every sheet except Kitten's, the label plate
("4. HOUSE CAT / A little bigger...") sits beside the hero, not below it, overlapping its row
band — and a stray heart/exclamation-mark decoration often bridges the two into one connected
blob, which pulled the label plate into the crop (with the cat's own head or body cut off to
compensate) when this first tried a fully automatic approach. HERO_ROI below is hand-verified
per level instead (the same approach rebuild_backgrounds.py's Y-boundaries used earlier), reading
pixel coordinates off a grid-annotated debug render of each cutout (see debug-grid/ — regenerate
by running this file's __main__ block with DEBUG_GRID=1) — cheap to redo since there are only 13.
Within each hand-picked box, the alpha bounding box still auto-tightens away pure margin.

Output: assets-source/hero-portraits/cat-N.webp — feeds the Menu and Game Over screens' large
portraits (see GameScene.ts/MenuScene.ts).
"""
import sys, os
from PIL import Image
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from extract_frames import remove_bg, TOL_OVERRIDE, QUANTIZE_OVERRIDE

SRC_DIR = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else 'hero-portraits'

FILES = {
    1: '1. Kitten.png',
    2: '2. Tabby Cat.png',
    3: '3. Fluffy Cat.png',
    4: '4. House Cat.png',
    5: '5. Wild Cat.png',
    6: '6. Lynx.png',
    7: '7. Cheetah.png',
    8: '8. Leopard.png',
    9: '9. Tiger.png',
    10: '10. Lion.png',
    11: '11. White Lion.png',
    12: '12. Golden L.png',
    13: '13. Celestial Cat.png',
}

# (x0, y0, x1, y1) — hand-verified against a 100px grid overlaid on each level's own cutout
# (see debug-grid/cat-N.png). Chosen to clear each sheet's label plate/rarity text/pose-thumbnail
# row entirely, occasionally trimming a sliver of mane/ear/tail where the label plate sits close
# enough to the hero that no rectangle gets both perfectly — always erring toward keeping the
# whole face and body rather than the trimmed edge.
HERO_ROI = {
    1: (305, 75, 1005, 705),
    2: (305, 0, 905, 580),
    3: (430, 0, 1105, 615),
    4: (470, 0, 1254, 625),
    5: (490, 0, 940, 615),
    6: (490, 0, 980, 615),
    7: (480, 0, 1040, 610),
    8: (485, 0, 1120, 610),
    9: (440, 0, 1170, 610),
    10: (500, 0, 1160, 610),
    11: (470, 0, 1160, 600),
    12: (505, 0, 1170, 630),
    13: (500, 0, 1254, 600),
}

MAX_DIM = 480
PAD = 16


def process(level, filename):
    path = os.path.join(SRC_DIR, filename)
    im = Image.open(path)

    if level == 1:
        cutout = im.convert('RGBA')
    else:
        quantize = QUANTIZE_OVERRIDE.get(level, 16)
        cutout = remove_bg(im, tol=TOL_OVERRIDE.get(level, 18), quantize=quantize)

    x0, y0, x1, y1 = HERO_ROI[level]
    region = cutout.crop((x0, y0, x1, y1))
    alpha = np.array(region)[:, :, 3]
    rows = np.where((alpha > 10).any(axis=1))[0]
    cols = np.where((alpha > 10).any(axis=0))[0]
    if len(rows) == 0 or len(cols) == 0:
        raise RuntimeError('empty ROI — no content found')

    t, b = rows[0], rows[-1] + 1
    l, r = cols[0], cols[-1] + 1
    W, H = region.size
    l = max(0, l - PAD)
    r = min(W, r + PAD)
    t = max(0, t - PAD)
    b = min(H, b + PAD)

    crop = region.crop((l, t, r, b))
    scale = MAX_DIM / max(crop.size)
    if scale < 1:
        crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f'cat-{level}.webp')
    crop.save(out_path, 'WEBP', quality=82)
    print(f'level {level}: OK size={crop.size} -> {out_path}')


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
        sys.exit(1)
