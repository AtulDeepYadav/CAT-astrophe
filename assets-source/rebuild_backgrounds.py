"""
Re-derives all 5 world backgrounds directly from the original reference sheet
(assets-source/world-backgrounds.png) instead of patching the already-cropped PNGs in
public/assets/backgrounds/. Those PNGs had a "DANGER LINE" mockup band + two glass-tank corner
poles baked in — a much earlier processing pass tried to blur out just the text but smeared a much
wider area and destroyed the real (if lightly tinted) floor/wall detail that actually sits there in
the source, and never touched the corner poles at all. Cropping fresh from source gives real pixels
to reconstruct from instead of patching over already-destroyed ones.

Crop transform (verified by eye against the previously-shipped home.png, which matched exactly):
each of the 5 panels is 307.2px wide in the 1536-wide sheet; y=90..865 of a panel maps to the full
440x870 output. The mockup's "DANGER LINE" text/top-bar and corner poles land at the same pixel
range in every panel (same template), so one set of repair coordinates covers all 5.
"""
from PIL import Image
import numpy as np

PANEL_W = 1536 / 5
SRC_Y0, SRC_Y1 = 90, 865
OUT_W, OUT_H = 440, 870

POLE_LEFT = (12, 38)
POLE_RIGHT = (402, 430)

# The mockup's glass-tank box sits at a different height in each panel (matching that scene's own
# hero-illustration layout) — hand-measured per zone instead of one shared range.
ZONES = ['home', 'backyard', 'forest', 'jungle', 'savannah']
ZONE_BOUNDS = {
    # Hand-measured against a ruled overlay of the clean source (each panel's mockup box sits at
    # a different height, matching that scene's own hero-illustration layout).
    'home':     {'band': (465, 530), 'pole_y': (465, 755)},
    'backyard': {'band': (472, 535), 'pole_y': (472, 780)},
    'forest':   {'band': (452, 535), 'pole_y': (452, 860)},
    'jungle':   {'band': (476, 535), 'pole_y': (476, 790)},
    'savannah': {'band': (472, 538), 'pole_y': (472, 780)},
}


def repair_row_band(arr, y0, y1, sample=18, hblur_px=14):
    """Blends a blurred average of the rows just above/below into the band. A single sharp
    adjacent row streaks badly on vertical-textured content (grass blades, tree trunks) — each
    column keeps its own top/bottom colors, and a linear per-column gradient between very
    different values reads as stripes. Averaging + horizontally blurring the source rows first
    removes that per-column mismatch, so the fill is smooth low-frequency color instead."""
    from PIL import Image, ImageFilter
    def blurred_strip(y_lo, y_hi):
        strip = arr[max(0, y_lo):max(1, y_hi), :, :].mean(axis=0, keepdims=True)
        img = Image.fromarray(np.clip(strip, 0, 255).astype(np.uint8), 'RGB')
        img = img.filter(ImageFilter.GaussianBlur(radius=hblur_px))
        return np.array(img).astype(np.float32).reshape(1, -1, 3)

    top = blurred_strip(y0 - sample, y0)
    bot = blurred_strip(y1, y1 + sample)
    h = y1 - y0
    t = np.linspace(0, 1, h).reshape(-1, 1, 1)
    arr[y0:y1, :, :] = top * (1 - t) + bot * t


def repair_col_strip(arr, x0, x1, y0, y1, margin=3, sample=16, vblur_px=10):
    from PIL import Image, ImageFilter
    def blurred_strip(x_lo, x_hi):
        strip = arr[:, max(0, x_lo):max(1, x_hi), :].mean(axis=1, keepdims=True)
        img = Image.fromarray(np.clip(strip, 0, 255).astype(np.uint8), 'RGB')
        img = img.filter(ImageFilter.GaussianBlur(radius=vblur_px))
        return np.array(img).astype(np.float32).reshape(-1, 1, 3)

    left = blurred_strip(x0 - margin - sample, x0 - margin)
    right = blurred_strip(x1 + margin, x1 + margin + sample)
    w = x1 - x0
    t = np.linspace(0, 1, w).reshape(1, -1, 1)
    fill = left * (1 - t) + right * t
    arr[y0:y1, x0:x1, :] = fill[y0:y1, :, :]


def build(sheet, index, zone, out_path):
    x0 = round(index * PANEL_W)
    x1 = round((index + 1) * PANEL_W)
    panel = sheet.crop((x0, 0, x1, sheet.height))
    crop = panel.crop((0, SRC_Y0, panel.width, SRC_Y1)).resize((OUT_W, OUT_H), Image.LANCZOS)

    bounds = ZONE_BOUNDS[zone]
    arr = np.array(crop.convert('RGB')).astype(np.float32)
    repair_row_band(arr, *bounds['band'])
    repair_col_strip(arr, *POLE_LEFT, *bounds['pole_y'])
    repair_col_strip(arr, *POLE_RIGHT, *bounds['pole_y'])
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(out_path)


if __name__ == '__main__':
    import sys
    out_dir = sys.argv[1]
    sheet = Image.open('assets-source/world-backgrounds.png').convert('RGB')
    for i, zone in enumerate(ZONES):
        build(sheet, i, zone, f'{out_dir}/{zone}.png')
        print('built', zone)
