import Phaser from 'phaser';
import { Cat } from '../entities/Cat';
import { DANGER_LINE_Y } from '../config/gameConfig';

/** Matter body speed below which a cat counts as "resting" rather than mid-drop/mid-bounce. */
const RESTING_SPEED_THRESHOLD = 0.4;
/** How long a resting cat can poke above the danger line before it's game over. */
const DANGER_TIME_LIMIT_MS = 2500;

export interface DangerLineSystemOptions {
  /** Fires every frame while the countdown is running: seconds left, and progress 0 (just entered) -> 1 (out of time). */
  onDangerTick: (secondsRemaining: number, progress: number) => void;
  /** Fires once when the board drops back below the line before time runs out, with how long the danger lasted. */
  onSafe: (dangerDurationMs: number) => void;
  onGameOver: () => void;
}

/**
 * Classic Suika-style danger check: if any *resting* cat's top edge is above the
 * danger line for too long, it's game over. Checking "resting" (low physics speed)
 * rather than just position is what stops a cat merely passing through the zone
 * while falling from triggering it.
 */
export class DangerLineSystem {
  private dangerElapsedMs = 0;
  private inDanger = false;
  private gameOverFired = false;
  private options: DangerLineSystemOptions;

  constructor(options: DangerLineSystemOptions) {
    this.options = options;
  }

  update(deltaMs: number, world: Phaser.Physics.Matter.World) {
    if (this.gameOverFired) {
      return;
    }

    const anyCatInDanger = world.getAllBodies().some((body) => {
      const cat = body.gameObject;
      if (!(cat instanceof Cat)) {
        return false;
      }
      const top = cat.y - cat.radius;
      const speed = (body as unknown as { speed: number }).speed;
      return top < DANGER_LINE_Y && speed < RESTING_SPEED_THRESHOLD;
    });

    if (anyCatInDanger) {
      this.inDanger = true;
      this.dangerElapsedMs += deltaMs;

      const remaining = Math.max(0, (DANGER_TIME_LIMIT_MS - this.dangerElapsedMs) / 1000);
      const progress = Math.min(1, this.dangerElapsedMs / DANGER_TIME_LIMIT_MS);
      this.options.onDangerTick(remaining, progress);

      if (this.dangerElapsedMs >= DANGER_TIME_LIMIT_MS) {
        this.gameOverFired = true;
        this.options.onGameOver();
      }
    } else if (this.inDanger) {
      this.inDanger = false;
      const duration = this.dangerElapsedMs;
      this.dangerElapsedMs = 0;
      this.options.onSafe(duration);
    }
  }
}
