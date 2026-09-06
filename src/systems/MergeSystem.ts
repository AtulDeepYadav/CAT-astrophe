import Phaser from 'phaser';
import { Cat } from '../entities/Cat';
import { MAX_CAT_LEVEL } from '../config/catData';

export interface MergeResult {
  newLevel: number;
  x: number;
  y: number;
  /** True if either merging cat was golden — the doc's "skip a level" bonus. */
  isGolden: boolean;
}

/** Combined speed (bodyA.speed + bodyB.speed) above which two cats colliding counts as a "hard"
 * knock worth a startled reaction — well above the ~1-3 range normal drops/settling produce,
 * comfortably below the ~18+ a cat dropped from height actually lands at (measured directly). */
const HARD_IMPACT_SPEED = 9;

export interface MergeSystemOptions {
  /** Called once per successful merge, after the new cat has been spawned. */
  onMerge: (result: MergeResult) => void;
  /** Called for a hard collision between two cats that didn't result in a merge — a fast-dropped
   * cat landing on an already-resting one, say. Not called for pairs that merged instead (they're
   * destroyed immediately, and a merge already gets its own, bigger, celebratory feedback). */
  onHardImpact?: (catA: Cat, catB: Cat) => void;
}

/**
 * Listens for same-level cat collisions and merges them into the next level.
 * A newly merged cat can immediately collide into a third match, which fires this
 * same handler again — that natural chain IS the combo the doc describes; ComboSystem
 * (wired in GameScene) is what turns repeated calls to this within a short window into
 * an escalating score multiplier.
 *
 * A Golden Cat in the pair skips an extra level (doc: "Golden Cat + Big Cat -> Wildcat")
 * instead of the normal +1 — the merged result is never itself golden.
 */
export function registerMergeSystem(
  world: Phaser.Physics.Matter.World,
  options: MergeSystemOptions,
) {
  // Guards against processing the same cat twice if it collides with two matches
  // in the same physics tick (only the first pair should win; the rest resolve next tick).
  const consumed = new Set<Cat>();

  world.on('collisionstart', (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
    for (const pair of event.pairs) {
      const catA = pair.bodyA.gameObject;
      const catB = pair.bodyB.gameObject;

      if (!(catA instanceof Cat) || !(catB instanceof Cat)) {
        continue;
      }

      const willMerge =
        !consumed.has(catA) && !consumed.has(catB) && catA.level === catB.level && catA.level < MAX_CAT_LEVEL;
      if (!willMerge) {
        const speedA = (catA.body as unknown as { speed: number }).speed;
        const speedB = (catB.body as unknown as { speed: number }).speed;
        if (speedA + speedB >= HARD_IMPACT_SPEED) {
          options.onHardImpact?.(catA, catB);
        }
        continue;
      }

      consumed.add(catA);
      consumed.add(catB);

      const midX = (catA.x + catB.x) / 2;
      const midY = (catA.y + catB.y) / 2;
      const isGolden = catA.isGolden || catB.isGolden;
      const levelStep = isGolden ? 2 : 1;
      const newLevel = Math.min(catA.level + levelStep, MAX_CAT_LEVEL);

      catA.destroy();
      catB.destroy();

      const merged = new Cat(world, midX, midY, newLevel);
      merged.setVelocity(0, -1.5); // small pop so the merge reads as an event, not a swap
      merged.playBirthBounce();

      options.onMerge({ newLevel, x: midX, y: midY, isGolden });
    }

    consumed.clear();
  });
}
