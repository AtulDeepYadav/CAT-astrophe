/**
 * Placeholder cat audio, synthesized with the Web Audio API instead of sound files — matching
 * the placeholder-first approach used for sprites. Swap `playMergeTone`/`playIdlePurr` for real
 * meow/purr/roar clips later without changing any call sites.
 *
 * Merge tone scales with level (small cats = quick bright pop, big cats = deeper/longer growl).
 * Idle purr is a soft low-volume blip, meant to be played rarely and randomized per cat.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;

  /** Must be called from a real user gesture (e.g. the first tap) — autoplay policies block audio otherwise. */
  unlock() {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  playMergeTone(level: number) {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const startFreq = Math.max(140, 720 - level * 55);
    const duration = 0.22 + level * 0.015;

    osc.type = level >= 8 ? 'sawtooth' : level >= 4 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(50, startFreq * 0.55), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playIdlePurr() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.15);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  /** Short ascending chime for activating a power-up (Yarn Ball, etc). */
  playPowerUp() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.18);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Urgent two-note "meow-meow" alarm — played once when a cat first crosses the danger line. */
  playDangerWarning() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    [0, 0.14].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const start = now + delay;
      osc.type = 'square';
      osc.frequency.setValueAtTime(520, start);
      osc.frequency.exponentialRampToValueAtTime(380, start + 0.1);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);

      osc.start(start);
      osc.stop(start + 0.14);
    });
  }

  /** Bright relief chime for a "Clutch Save" — the board clearing the danger line just in time. */
  playClutchSave() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    [0, 0.09, 0.18].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const start = now + delay;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440 + i * 140, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

      osc.start(start);
      osc.stop(start + 0.2);
    });
  }

  /** Deep, rumbling roar for the Lion cinematic moment — a low sawtooth body with an LFO growl-wobble. */
  playLionRoar() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const duration = 1.3;

    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'sawtooth';
    body.frequency.setValueAtTime(70, now);
    body.frequency.linearRampToValueAtTime(110, now + 0.25);
    body.frequency.linearRampToValueAtTime(55, now + duration);
    body.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.35, now + 0.15);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // A slow LFO wobbling the body's own frequency is what reads as a "growl" texture.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(14, now);
    lfoGain.gain.setValueAtTime(10, now);
    lfo.connect(lfoGain);
    lfoGain.connect(body.frequency);

    const growl = ctx.createOscillator();
    const growlGain = ctx.createGain();
    growl.type = 'sawtooth';
    growl.frequency.setValueAtTime(180, now);
    growl.frequency.linearRampToValueAtTime(140, now + duration);
    growl.connect(growlGain);
    growlGain.connect(ctx.destination);
    growlGain.gain.setValueAtTime(0.0001, now);
    growlGain.gain.exponentialRampToValueAtTime(0.15, now + 0.2);
    growlGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const stopAt = now + duration + 0.05;
    body.start(now);
    body.stop(stopAt);
    lfo.start(now);
    lfo.stop(stopAt);
    growl.start(now);
    growl.stop(stopAt);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      return this.ctx;
    }
    try {
      const AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return null;
      }
      this.ctx = new AudioContextCtor();
      return this.ctx;
    } catch {
      return null;
    }
  }
}
