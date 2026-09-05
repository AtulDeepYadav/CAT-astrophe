import Phaser from 'phaser';
import { GOLDEN_GLOW_TEXTURE, getCatData, textureKeyForLevel } from '../config/catData';

const GOLDEN_TINT = 0xffd873;

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

  constructor(world: Phaser.Physics.Matter.World, x: number, y: number, level: number, isGolden = false) {
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
    this.scene.add.existing(this);

    // Scale by HEIGHT only, preserving the source art's own aspect ratio, rather than forcing
    // every cat into a square matching its physics diameter. The source crops aren't perfectly
    // consistent in their own proportions (a wide sitting pose vs. a tall one) — forcing a
    // square stretch made some lower-level cats visually fill more of their box than higher
    // ones, breaking the size-must-increase-with-level guarantee. Matching height to the
    // circle's diameter keeps every cat's apparent size strictly tied to `radius`, so it's
    // guaranteed monotonic across levels regardless of the art's own quirks.
    const visualScale = (this.radius * 2) / this.height;
    this.setScale(visualScale);

    // Phaser's Matter Transform component scales the physics BODY along with the sprite
    // whenever setScale runs (Body.scale under the hood) — without this, every cat's actual
    // collision circle would silently shrink/grow by `visualScale` too, so same-radius cats
    // would rest at inconsistent distances and look like they're sinking into each other.
    // Counter-scale the body back to exactly `data.radius` so only the art moved, not the hitbox.
    this.scene.matter.body.scale(this.body as MatterJS.BodyType, 1 / visualScale, 1 / visualScale);

    if (isGolden) {
      this.glow = this.scene.add.image(x, y, GOLDEN_GLOW_TEXTURE);
      this.glow.setBlendMode(Phaser.BlendModes.ADD);
      this.glow.setTint(GOLDEN_TINT);
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
  }

  destroy(fromScene?: boolean) {
    this.glow?.destroy();
    this.glow = null;
    super.destroy(fromScene);
  }
}
