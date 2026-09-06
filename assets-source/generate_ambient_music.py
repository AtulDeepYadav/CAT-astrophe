"""
Generates a seamless, procedurally-synthesized ambient pad loop for background music — the game
had zero music anywhere before this (AudioSystem.ts was one-shot SFX only). No ffmpeg is available
in this environment and there's no real composer/licensed track to source, so this produces a
warm, calm chord pad entirely from sine waves via numpy, saved directly as a 16-bit mono WAV (no
external encoder needed) that every browser decodes natively.

The loop is mathematically seamless rather than crossfaded: every oscillator's frequency (and the
slow amplitude "breathing" envelope) is quantized to an exact integer multiple of 1/LOOP_SECONDS,
so each one completes a whole number of cycles across the loop and the waveform's value + slope at
t=0 exactly matches t=LOOP_SECONDS — no click, no phase jump, no fade needed at the seam.
"""
import wave
import numpy as np

LOOP_SECONDS = 16
SAMPLE_RATE = 22050
OUT_PATH = 'public/assets/audio/music/ambient-loop.wav'


def quantize(freq_hz: float) -> float:
    """Snaps a target frequency to the nearest exact multiple of 1/LOOP_SECONDS — the small nudge
    (well under a cent in every case used below) is inaudible as a pitch change but is what makes
    the loop boundary phase-continuous."""
    unit = 1 / LOOP_SECONDS
    return round(freq_hz / unit) * unit


# (frequency, peak amplitude) — a warm Cmaj9-ish pad: root, fifth, octave, third, fifth again an
# octave up, and a quiet major-7th for color. Kept to a static chord (no progression) since the
# whole point is to sit unobtrusively behind gameplay, not compete for attention.
VOICES = [
    (quantize(130.81), 0.16),  # C3 — root
    (quantize(196.00), 0.10),  # G3 — fifth
    (quantize(261.63), 0.14),  # C4 — octave
    (quantize(329.63), 0.10),  # E4 — third
    (quantize(392.00), 0.09),  # G4 — fifth, octave up
    (quantize(493.88), 0.05),  # B4 — major 7th, quiet color tone
]
# A faint high shimmer with its own slower swell — adds a little life without being a "melody".
SHIMMER_FREQ = quantize(784.00)  # G5
SHIMMER_LFO_FREQ = 2 / LOOP_SECONDS  # 2 full swells across the loop

# The pad's own overall volume breathes slowly in and out — one full cycle per loop, so it's
# perceptible without ever feeling like it's "restarting" at the seam.
BREATH_LFO_FREQ = 1 / LOOP_SECONDS


def render() -> np.ndarray:
    t = np.arange(int(LOOP_SECONDS * SAMPLE_RATE)) / SAMPLE_RATE
    mix = np.zeros_like(t)

    breath = 0.75 + 0.25 * np.sin(2 * np.pi * BREATH_LFO_FREQ * t - np.pi / 2)
    for freq, amp in VOICES:
        mix += amp * np.sin(2 * np.pi * freq * t)
    mix *= breath

    shimmer_swell = 0.5 + 0.5 * np.sin(2 * np.pi * SHIMMER_LFO_FREQ * t)
    mix += 0.035 * shimmer_swell * np.sin(2 * np.pi * SHIMMER_FREQ * t)

    peak = np.max(np.abs(mix))
    if peak > 0:
        mix = mix / peak * 0.6  # headroom so this sits under SFX rather than competing with it

    return (mix * 32767).astype(np.int16)


if __name__ == '__main__':
    import os
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    samples = render()
    with wave.open(OUT_PATH, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(samples.tobytes())
    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f'Wrote {OUT_PATH} ({size_kb:.0f} KB, {LOOP_SECONDS}s @ {SAMPLE_RATE}Hz mono)')
