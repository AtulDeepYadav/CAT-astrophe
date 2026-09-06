"""
Extracts the 4 looping animation frames for each world zone from the "Cat BGs" reference sheets
the user supplied (D:\\IIM Lucknow\\Project\\Game\\Cats\\Cat BGs\\*.png) into game-ready
440x870 WebP images at public/assets/backgrounds/<zone>-f{1..4}.webp (WebP q88, not PNG - these
are opaque photo-style backgrounds with no need for lossless/alpha, and PNG was ~85% bigger for
no visible quality gain).

Each source sheet is a documentation image: a header, 4 side-by-side "Frame N (X.Xs)" panels,
an "Animated Elements" thumbnail strip, and a footer. The 4 panels are NOT pixel-identical across
sheets (these are independent generations sharing a prompt template, not one shared template) —
panel X-position is consistent, but each sheet's panel bottom edge (where photo content ends and
the "Frame N (X.Xs)" caption begins) had to be hand-verified per source file via a dark-pixel-
density scan (see chat history) rather than assumed constant, to avoid cropping in caption text.

Per the go/no-go from the "keep current 5 zones, re-skin only" decision, source files map to
zones by visual theme, not by the sheets' own "World N" numbering — e.g. "5. BG.png" ("World 5:
Emerald Jungle / Tiger Realm") becomes the `jungle` zone because it matches the Tiger-themed
jungle-ruins backdrop already used there, not because it's numbered 5th.
"""
from PIL import Image
import os

SRC_DIR = 'Cat BGs'
OUT_DIR = 'public/assets/backgrounds'
OUT_W, OUT_H = 440, 870

# Every sheet uses this same 4-panel X layout — verified across all 7 files.
PANELS_X = [(9, 301), (310, 602), (611, 903), (912, 1204)]
Y0 = 112

# zone -> (source filename, hand-verified photo-bottom Y for that specific file)
ZONES = {
    'home': ('1. BG.png', 728),
    'backyard': ('2. BG.png', 728),
    'forest': ('3. BG.png', 700),
    'jungle': ('5. BG.png', 664),
    'savannah': ('4. BG 2.png', 663),
}


def build(zone, filename, y1):
    im = Image.open(os.path.join(SRC_DIR, filename)).convert('RGB')
    for i, (x0, x1) in enumerate(PANELS_X):
        crop = im.crop((x0, Y0, x1, y1)).resize((OUT_W, OUT_H), Image.LANCZOS)
        # WebP q88 instead of PNG: ~85% smaller with no visible loss on this kind of illustrated
        # art (verified by eye, including small sign-text legibility) - these are opaque photo-
        # style backgrounds with no need for lossless/alpha, so PNG was all cost, no benefit.
        crop.save(os.path.join(OUT_DIR, f'{zone}-f{i + 1}.webp'), 'WEBP', quality=88, method=6)
    print(f'{zone}: OK ({filename}, y0={Y0} y1={y1})')


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    for zone, (filename, y1) in ZONES.items():
        build(zone, filename, y1)
