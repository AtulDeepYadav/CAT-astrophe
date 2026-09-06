"""
Strips embedded cover-art images and ID3 metadata from the merge-sound MP3s in
public/assets/audio/merge/ - lossless, not a re-encode (`-c:a copy`), verified bit-identical via
decoded-audio-stream MD5 before/after.

Each source MP3 (as delivered) had a full cover-art PNG baked into its ID3 tag - dead weight for
a game SFX the Web Audio API never displays - which was the large majority of every file's size
(e.g. cat-9.mp3: 14KB of cover art vs. 7KB of actual audio). Stripping it needs ffmpeg; this uses
the one bundled by the `imageio-ffmpeg` pip package rather than requiring a system install.

Run from the project root: python assets-source/strip_audio_metadata.py
"""
import os
import subprocess

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = 'ffmpeg'  # fall back to a system install if imageio-ffmpeg isn't available

AUDIO_DIR = 'public/assets/audio/merge'


def strip_all():
    total_before = 0
    total_after = 0
    for name in sorted(os.listdir(AUDIO_DIR)):
        if not name.endswith('.mp3'):
            continue
        path = os.path.join(AUDIO_DIR, name)
        # ffmpeg infers output format from the extension, so the temp file needs to end in
        # .mp3 (not just contain "mp3" mid-name) or it refuses to pick a muxer.
        tmp_path = os.path.join(AUDIO_DIR, name[:-4] + '.tmp.mp3')
        before = os.path.getsize(path)
        subprocess.run(
            [FFMPEG, '-y', '-i', path, '-map', '0:a', '-c:a', 'copy', '-map_metadata', '-1', tmp_path],
            check=True, capture_output=True,
        )
        after = os.path.getsize(tmp_path)
        os.replace(tmp_path, path)
        total_before += before
        total_after += after
        print(f'{name}: {before/1024:.1f}KB -> {after/1024:.1f}KB')
    print(f'TOTAL: {total_before/1024:.0f}KB -> {total_after/1024:.0f}KB '
          f'({100*(1-total_after/total_before):.1f}% reduction)')


if __name__ == '__main__':
    strip_all()
