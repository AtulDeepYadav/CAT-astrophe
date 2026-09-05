import Phaser from 'phaser';
import { Cat } from '../entities/Cat';
import { AudioSystem } from './AudioSystem';

/** Matter body speed below which a cat counts as "resting" for idle purposes. */
const RESTING_SPEED_THRESHOLD = 0.4;
const FIRST_IDLE_DELAY_MS = 3000;
const REPEAT_IDLE_MIN_MS = 4000;
const REPEAT_IDLE_MAX_MS = 9000;

/**
 * Gives resting cats an occasional idle beat — a small ear-twitch squash/stretch tween paired
 * with a soft purr sound. Each cat has its own randomized schedule (`nextIdleAt`) so a full
 * board of resting cats doesn't all purr in unison; a cat that gets bumped resets its timer.
 */
export class IdleSystem {
  private scene: Phaser.Scene;
  private audio: AudioSystem;

  constructor(scene: Phaser.Scene, audio: AudioSystem) {
    this.scene = scene;
    this.audio = audio;
  }

  update(deltaMs: number, world: Phaser.Physics.Matter.World) {
    for (const body of world.getAllBodies()) {
      const cat = body.gameObject;
      if (!(cat instanceof Cat)) {
        continue;
      }

      const speed = (body as unknown as { speed: number }).speed;
      if (speed >= RESTING_SPEED_THRESHOLD) {
        cat.restTimeMs = 0;
        cat.nextIdleAt = FIRST_IDLE_DELAY_MS;
        continue;
      }

      cat.restTimeMs += deltaMs;
      if (cat.restTimeMs >= cat.nextIdleAt) {
        this.playIdleBeat(cat);
        cat.nextIdleAt = cat.restTimeMs + Phaser.Math.Between(REPEAT_IDLE_MIN_MS, REPEAT_IDLE_MAX_MS);
      }
    }
  }

  private playIdleBeat(cat: Cat) {
    this.audio.playIdlePurr();

    // A gentle uniform scale bounce rather than a squash/stretch — the real character art
    // reads as a little "boop" this way instead of visibly distorting the illustration.
    // (Golden Cats' sparkle tween lives on a separate glow GameObject, so this never conflicts.)
    this.scene.tweens.add({
      targets: cat,
      scale: cat.scale * 1.08,
      duration: 130,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }
}
