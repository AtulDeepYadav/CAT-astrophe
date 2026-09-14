import Phaser from 'phaser';

export const AMBIENT_MUSIC_KEY = 'ambient-loop';

/**
 * A background music track needs to survive scene transitions (Menu -> Game -> restart -> Menu)
 * without restarting or overlapping itself — but every scene's own `this.sound` is really the
 * same shared `Phaser.Sound.BaseSoundManager` underneath (it's a Game-level system, not a
 * per-Scene one), so a single Sound object created once here and remembered at module scope stays
 * valid and keeps playing across every scene change, as long as nothing calls `sound.stopAll()`
 * anywhere (nothing in this project does).
 *
 * Muted independently of AudioSystem's SFX mute, via this Sound instance's own `mute` property
 * rather than the shared manager's global `scene.sound.setMute()` — that call would silence SFX
 * too, defeating the whole point of a separate Music toggle.
 */
/** `Phaser.Sound.BaseSound` (what `scene.sound.add()` is typed to return) is the abstract base
 * and doesn't itself declare `mute` — only its concrete WebAudioSound/HTML5AudioSound subclasses
 * do, identically. Widening the type here (rather than casting at each call site) is honest about
 * that: this project only ever needs `mute`, `isPlaying`, and `play()`, all shared by both. */
let musicSound: (Phaser.Sound.BaseSound & { mute: boolean }) | null = null;

/**
 * Starts the ambient loop if it isn't already playing, and syncs it to the current Music setting
 * — safe to call from every scene's create() and from the first pointerdown/unlock gesture
 * (browsers block audio until a real user gesture, so an early call here can silently fail to
 * actually start; calling it again on the first tap, already done for the SFX AudioContext
 * elsewhere, is what actually gets it going). Passing `musicMuted` here as well as exposing
 * `setMusicMuted` below closes a real gap the single-instance design would otherwise have: without
 * it, a scene that never previously applied the setting (e.g. landing straight on Menu with music
 * muted from a past session) would play audibly until some other scene happened to apply it.
 */
export function ensureAmbientMusic(scene: Phaser.Scene, musicMuted: boolean) {
  if (!musicSound) {
    musicSound = scene.sound.add(AMBIENT_MUSIC_KEY, { loop: true, volume: 0.35 }) as Phaser.Sound.BaseSound & {
      mute: boolean;
    };
  }
  musicSound.mute = musicMuted;
  if (!musicSound.isPlaying) {
    musicSound.play();
  }
}

/** Applies a Music toggle immediately, without waiting for the next scene transition's
 * ensureAmbientMusic() call — a no-op if the track hasn't been created yet (ensureAmbientMusic's
 * own musicMuted param covers that case once it does get created). */
export function setMusicMuted(musicMuted: boolean) {
  if (musicSound) {
    musicSound.mute = musicMuted;
  }
}
