"""
Converts every cat sprite PNG under public/assets/sprites/ to WebP in place (same path, .webp
extension), then deletes the source PNG.

Quality 90 (vs. 88 for the opaque world backgrounds) - these are foreground character sprites
that get scaled up in cinematics and the Collection Book, so a slightly more conservative setting
was used. Verified by eye against a saturated teal test backdrop (the same technique used to catch
the House Cat transparency bug) at both 85 and 90: no edge fringing or fur-detail fuzziness at
either, 90 kept as the safer of the two with still-large (~75-80%) savings over PNG.

Run from the project root: python assets-source/convert_sprites_to_webp.py
"""
from PIL import Image
import os

SPRITES_DIR = 'public/assets/sprites'
QUALITY = 90


def convert_all():
    total_before = 0
    total_after = 0
    converted = 0
    for root, _dirs, files in os.walk(SPRITES_DIR):
        for name in files:
            if not name.endswith('.png'):
                continue
            src = os.path.join(root, name)
            dst = os.path.join(root, name[:-4] + '.webp')
            before = os.path.getsize(src)
            im = Image.open(src).convert('RGBA')
            im.save(dst, 'WEBP', quality=QUALITY, method=6)
            after = os.path.getsize(dst)
            os.remove(src)
            total_before += before
            total_after += after
            converted += 1
    print(f'Converted {converted} files: {total_before/1024:.0f}KB -> {total_after/1024:.0f}KB '
          f'({100*(1-total_after/total_before):.1f}% reduction)')


if __name__ == '__main__':
    convert_all()
