import Phaser from 'phaser';
import { GOLDEN_GLOW_TEXTURE, getCatData, textureKeyForLevel, widthCorrectionForLevel } from '../config/catData';
import type { AnimFrame } from '../config/catAnimations';
import { animFrameTextureKey, hasAnimationFrames, idleLoopForLevel, idleLoopTotalMs } from '../config/catAnimations';

const GOLDEN_TINT = 0xffd873;
/** Matter body speed below which a cat counts as "resting" — matches IdleSystem's own threshold. */
const RESTING_SPEED_THRESHOLD = 0.4;
/** How long a cat has to rest undisturbed before it's dozed off — see isDeepAsleep. */
const DEEP_SLEEP_MS = 25000;
/** Mostly eyes-closed (the 'blink' frame standing in for "asleep"), with just a brief eye-open
 * flash — the inverse proportions of the normal idle loop, using the same two frames every
 * animated level already has. No new art needed for a cat to visibly read as asleep. */
const SLEEPY_IDLE_LOOP: { frame: AnimFrame; holdMs: number }[] = [
  { frame: 'blink', holdMs: 2200 },
  { frame: 'idle', holdMs: 300 },
];
const SLEEPY_IDLE_TOTAL_MS = SLEEPY_IDLE_LOOP.reduce((sum, step) => sum + step.holdMs, 0);

/**
 * A dropped cat: a circular Matter body wrapped in a sprite, tagged with its level.
 * Merge/combo/idle systems read `.level` off this to decide what happens on collision/rest.
 *
 * `restTimeMs`/`nextIdleAt` are mutable scratch state owned by IdleSystem — a cat doesn't
 * manage its own idle schedule, IdleSystem just needs somewhere per-cat to keep it.
 */
export class Cat extends Phaser.Physics.Matter.Sprite {
  public readonly level: number;
  public readonly radius: number;
  public readonly isGolden: boolean;

  public restTimeMs = 0;
  public nextIdleAt = 0;

  /** Soft gold halo behind a Golden Cat — a separate GameObject synced to this one each frame in preUpdate. */
  private glow: Phaser.GameObjects.Image | null = null;

  /** True for levels with real hand-drawn pose frames — see catAnimations.ts. */
  private readonly animated: boolean;
  /** Time accumulated while resting, driving the continuous idle loop; reset the moment the cat moves. */
  private animLoopMs = 0;
  private animFrame: AnimFrame = 'idle';
  /** A single hard landing can register several Matter collision events in quick succession as
   * the body settles/bounces — this debounces playStartledSquash so that reads as one flinch,
   * not a stutter of them. */
  private startledCooldownMs = 0;

  constructor(
    world: Phaser.Physics.Matter.World,
    x: number,
    y: number,
    level: number,
    isGolden = false,
    goldenTint = GOLDEN_TINT,
  ) {
    const data = getCatData(level);
    // The circle body is created here via the `shape` option, in the same call that sets
    // restitution/friction/label — calling `setCircle()` again afterward would silently
    // replace this body with a default-physics one and lose all of those options.
    super(world, x, y, textureKeyForLevel(level), undefined, {
      shape: { type: 'circle', radius: data.radius },
      restitution: 0.35,
      friction: 0.05,
      frictionAir: 0.001,
      label: `cat-${level}`,
    });

    this.level = level;
    this.radius = data.radius;
    this.isGolden = isGolden;
    this.animated = hasAnimationFrames(level);
    this.scene.add.existing(this);

    // A forward-facing illustrated character (unlike the rounder, more rotation-tolerant art on
    // other levels) reads as broken once physics tumbles it to a random resting angle — a smiling
    // face sideways or upside-down looks like a bug, not personality. Lock rotation just for
    // animated levels so translation/collisions still feel the same but the face stays upright.
    if (this.animated) {
      this.setFixedRotation();
    }

    // Scale by HEIGHT only, preserving the source art's own aspect ratio, rather than forcing
    // every cat into a square matching its physics diameter. The source crops aren't perfectly
    // consistent in their own proportions (a wide sitting pose vs. a tall one) — forcing a
    // square stretch made some lower-level cats visually fill more of their box than higher
    // ones, breaking the size-must-increase-with-level guarantee. Matching height to the
    // circle's diameter keeps every cat's apparent size strictly tied to `radius`, so it's
    // guaranteed monotonic across levels regardless of the art's own quirks.
    const visualScale = (this.radius * 2) / this.height;
    // A separate, small horizontal-only correction on top of that (see widthCorrectionForLevel's
    // doc comment) — several levels' art is narrower than tall enough that height-only scaling
    // left visible empty space on either side of an otherwise snugly-resting cat, reading as
    // "too much space between cats" in a mixed pile. This never touches the height scale, so the
    // monotonic-size guarantee above is untouched.
    const scaleX = visualScale * widthCorrectionForLevel(level);
    this.setScale(scaleX, visualScale);

    // Phaser's Matter Transform component scales the physics BODY along with the sprite
    // whenever setScale runs (Body.scale under the hood, independently per axis) — without this,
    // every cat's actual collision circle would silently distort into an ellipse matching
    // whatever the art needed (scaleX above is deliberately != visualScale for several levels),
    // so same-radius cats would rest at inconsistent distances or merge-detect oddly along one
    // axis. Counter-scale the body back to exactly `data.radius` on both axes so only the art
    // moved, not the hitbox — it stays a perfect circle regardless of the visual stretch.
    this.scene.matter.body.scale(this.body as MatterJS.BodyType, 1 / scaleX, 1 / visualScale);

    if (isGolden) {
      this.glow = this.scene.add.image(x, y, GOLDEN_GLOW_TEXTURE);
      this.glow.setBlendMode(Phaser.BlendModes.ADD);
      this.glow.setTint(goldenTint);
      this.glow.setDisplaySize(this.radius * 3.2, this.radius * 3.2);
      this.glow.setDepth(-1);
      this.glow.setAlpha(0.6);

      this.scene.tweens.add({
        targets: this.glow,
        alpha: 0.85,
        scale: this.glow.scale * 1.12,
        duration: 480,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.glow?.setPosition(this.x, this.y);
    if (this.startledCooldownMs > 0) {
      this.startledCooldownMs -= delta;
    }
    if (this.animated) {
      this.updateIdleAnimation(delta);
    }
  }

  /** True once a cat has rested undisturbed long enough to have dozed off — see DEEP_SLEEP_MS. */
  get isDeepAsleep(): boolean {
    return this.restTimeMs >= DEEP_SLEEP_MS;
  }

  /**
   * Continuous "the cat is alive" loop while resting (doc: idle -> blink -> idle -> happy bounce
   * -> idle for the Kitten, ~2s, seamless; idle -> blink -> idle for everyone else) — separate
   * from IdleSystem's rarer purr/bounce beat. Only plays once settled: cycling a facing-forward
   * pose while the body is still tumbling from a drop/merge would just look glitchy against the
   * physics rotation. A cat left resting long enough switches to a slower, mostly-eyes-closed
   * loop (see isDeepAsleep) — the same two frames, held in the opposite proportions, is enough to
   * read as "asleep" without needing dedicated sleepy art.
   */
  private updateIdleAnimation(delta: number) {
    const speed = (this.body as unknown as { speed: number }).speed;
    if (speed >= RESTING_SPEED_THRESHOLD) {
      this.animLoopMs = 0;
      this.setAnimFrame('idle');
      return;
    }

    this.animLoopMs += delta;
    if (this.isDeepAsleep) {
      const elapsed = this.animLoopMs % SLEEPY_IDLE_TOTAL_MS;
      let asleepAcc = 0;
      for (const step of SLEEPY_IDLE_LOOP) {
        asleepAcc += step.holdMs;
        if (elapsed < asleepAcc) {
          this.setAnimFrame(step.frame);
          return;
        }
      }
      return;
    }

    const totalMs = idleLoopTotalMs(this.level);
    const elapsed = this.animLoopMs % totalMs;
    let acc = 0;
    for (const step of idleLoopForLevel(this.level)) {
      acc += step.holdMs;
      if (elapsed < acc) {
        this.setAnimFrame(step.frame);
        return;
      }
    }
  }

  private setAnimFrame(frame: AnimFrame) {
    if (frame === this.animFrame) {
      return;
    }
    this.animFrame = frame;
    this.setTexture(animFrameTextureKey(this.level, frame));
  }

  /**
   * A quick, snappy squash-and-recover for a cat that just took a hard knock from a fast-dropped
   * cat landing on it — distinct from IdleSystem's slow, gentle "boop" so a startle actually
   * reads as different from ambient idling. Purely a motion effect (no new art): a fast
   * horizontal squash sells "flinch" on any of this cat's existing poses.
   */
  /** Returns false (no-op) if this cat is still cooling down from its last flinch — lets a
   * caller batching two cats' reactions together (see GameScene's onHardImpact) know whether to
   * bother with the accompanying sound at all. */
  playStartledSquash(): boolean {
    if (this.startledCooldownMs > 0) {
      return false;
    }
    this.startledCooldownMs = 300;
    this.scene.tweens.killTweensOf(this);
    // baseScaleX carries the same per-level width correction Cat's constructor applies (see
    // widthCorrectionForLevel) — recomputed here rather than read off this.scaleX/scaleY because
    // this can fire while a *previous* squash tween is still mid-flight (killed just above), at a
    // transient scale that isn't the cat's real resting one. Resetting to a plain uniform
    // `baseScale` after the squash used to silently undo that correction on every hard impact.
    const heightScale = (this.radius * 2) / this.height;
    const baseScaleX = heightScale * widthCorrectionForLevel(this.level);
    this.scene.tweens.add({
      targets: this,
      scaleX: baseScaleX * 1.22,
      scaleY: heightScale * 0.82,
      duration: 70,
      yoyo: true,
      ease: 'Sine.easeOut',
      // Guard against a merge destroying this cat's Matter body in the ~70-140ms this tween is
      // in flight (a hard impact frequently precedes a merge by exactly that little) — setScale
      // reaches into Body.scale, which throws on a body that's gone, and an uncaught throw here
      // happens inside TweenManager.update, deep in Phaser's own step() — nothing catches it, so
      // it kills the requestAnimationFrame loop outright and freezes the entire game, not just
      // this tween. destroy() below kills any tween targeting `this` outright, but this guard is
      // cheap insurance against the same shape of bug from any tween added here in the future.
      onComplete: () => {
        if (this.active) {
          this.setScale(baseScaleX, heightScale);
        }
      },
    });
    return true;
  }

  /** A bigger, bouncier entrance than the physics "pop" velocity alone gives a freshly merged cat. */
  playBirthBounce() {
    // Same width correction as the constructor (see widthCorrectionForLevel) — a merged cat is
    // *destroyed and recreated* as a new Cat instance at the next level (see MergeSystem), so its
    // constructor already applied this once; the bug this guards against is this bounce-in tween
    // overwriting that correction back to a plain uniform scale mid-entrance.
    const heightScale = (this.radius * 2) / this.height;
    const targetScaleX = heightScale * widthCorrectionForLevel(this.level);
    this.setScale(targetScaleX * 0.55, heightScale * 0.55);
    this.scene.tweens.add({
      targets: this,
      scaleX: targetScaleX,
      scaleY: heightScale,
      duration: 320,
      ease: 'Back.easeOut',
    });
  }

  destroy(fromScene?: boolean) {
    // Kill first, before the body is gone — a merge (or a hard-impact reaction) can destroy this
    // cat while a tween (playStartledSquash, playBirthBounce, the golden glow loop) is still
    // running against it. An in-flight tween's next update/onComplete would otherwise touch
    // scaleX/scaleY on a Matter game object with no body left, which throws from deep inside
    // Phaser's own TweenManager.update — uncaught there, that exception kills the game's
    // requestAnimationFrame loop outright instead of just this one tween, freezing the whole
    // game (see playStartledSquash's onComplete for exactly the crash this prevents).
    this.scene?.tweens.killTweensOf(this);
    this.glow?.destroy();
    this.glow = null;
    super.destroy(fromScene);
  }
}
