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
 * Mute is NOT handled here — SettingsSystem's existing `scene.sound.setMute()` call already mutes
 * every sound this manager plays, this track included, with no extra wiring needed.
 */
let musicSound: Phaser.Sound.BaseSound | null = null;

/**
 * Starts the ambient loop if it isn't already playing. Safe to call from every scene's create()
 * and from the first pointerdown/unlock gesture — browsers block audio until a real user gesture,
 * so an early call here can silently fail to actually start; calling it again on the first tap
 * (already done for the SFX AudioContext elsewhere) is what actually gets it going.
 */
export function ensureAmbientMusic(scene: Phaser.Scene) {
  if (!musicSound) {
    musicSound = scene.sound.add(AMBIENT_MUSIC_KEY, { loop: true, volume: 0.35 });
  }
  if (!musicSound.isPlaying) {
    musicSound.play();
  }
}
