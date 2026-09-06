import Phaser from 'phaser';
import { hasMergeSound, mergeSoundKey } from '../config/catData';

/**
 * Cat audio: real recorded feline vocalizations (see public/assets/audio/merge/, preloaded by
 * BootScene) for the merge sound wherever a level has one, synthesized Web Audio tones for
 * everything else (levels with no real-world animal, plus every other effect in this class).
 *
 * Idle purr is a soft low-volume blip, meant to be played rarely and randomized per cat.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  /** Every synthesized oscillator routes through this one node instead of straight to
   * ctx.destination — muting is then one gain change here instead of touching each of the 9
   * play methods individually. */
  private masterGain: GainNode | null = null;
  private muted = false;
  /** Optional — lets playMergeTone play a real preloaded clip via Phaser's sound manager instead of synthesizing. */
  private scene: Phaser.Scene | null;

  constructor(scene: Phaser.Scene | null = null) {
    this.scene = scene;
  }

  /** Must be called from a real user gesture (e.g. the first tap) — autoplay policies block audio otherwise. */
  unlock() {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 1;
    }
    // The one real recorded clip path (playMergeTone's hasMergeSound branch) goes through
    // Phaser's own sound manager, not this class's AudioContext — needs its own mute switch.
    this.scene?.sound.setMute(muted);
  }

  playMergeTone(level: number) {
    if (this.scene && hasMergeSound(level)) {
      this.scene.sound.play(mergeSoundKey(level), { volume: 0.6 });
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain!);

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
    gain.connect(this.masterGain!);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.15);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  /** A slower, lower, quieter cousin of playIdlePurr — for a cat that's been resting so long it's dozed off. */
  playSleepyPurr() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(165, now + 0.5);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

    osc.start(now);
    osc.stop(now + 1.15);
  }

  /** Quick startled "mrp!" blip for a cat that just took a hard knock from a fast-dropped cat. */
  playStartled() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.type = 'square';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.11);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.start(now);
    osc.stop(now + 0.14);
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
    gain.connect(this.masterGain!);

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
      gain.connect(this.masterGain!);

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
      gain.connect(this.masterGain!);

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
    bodyGain.connect(this.masterGain!);
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
    growlGain.connect(this.masterGain!);
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

  /** Shimmering ascending arpeggio for the Celestial Cat cinematic — no real animal to record, so this stays synthesized. */
  playCelestialChime() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6 — a bright major arpeggio

    notes.forEach((freq, i) => {
      const start = now + i * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.connect(gain);
      gain.connect(this.masterGain!);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);

      // A fast shimmering tremolo layered on top reads as "sparkly" rather than a plain tone.
      const shimmer = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmer.frequency.setValueAtTime(28, start);
      shimmerGain.gain.setValueAtTime(freq * 0.01, start);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(osc.frequency);

      osc.start(start);
      osc.stop(start + 0.95);
      shimmer.start(start);
      shimmer.stop(start + 0.95);
    });
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
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }
}
