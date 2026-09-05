import Phaser from 'phaser';
import {
  CONTAINER_FLOOR,
  CONTAINER_LEFT,
  CONTAINER_RIGHT,
  CONTAINER_TOP,
  DANGER_LINE_Y,
  GAME_HEIGHT,
  GAME_WIDTH,
  HEADER_TEXT_HEIGHT,
  PANEL_BOTTOM,
  PANEL_DIVIDER_Y,
  PANEL_LEFT,
  PANEL_RIGHT,
  PANEL_TOP,
  WALL_THICKNESS,
} from '../config/gameConfig';
import { GOLDEN_GLOW_TEXTURE, MAX_CAT_LEVEL, SPAWNABLE_LEVELS, getCatData, textureKeyForLevel } from '../config/catData';
import { Cat } from '../entities/Cat';
import { registerMergeSystem } from '../systems/MergeSystem';
import { DangerLineSystem } from '../systems/DangerLineSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { ComboSystem } from '../systems/ComboSystem';
import { PurrMeterSystem } from '../systems/PurrMeterSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { IdleSystem } from '../systems/IdleSystem';

/** NEXT preview scales proportionally between these two heights, by the cat's radius (level 1..MAX_CAT_LEVEL). */
const PREVIEW_MIN_HEIGHT = 22;
const PREVIEW_MAX_HEIGHT = 44;
/** Minimum time between drops, so spam-tapping can't stack cats on top of each other instantly. */
const DROP_COOLDOWN_MS = 350;
/** Chance the currently-previewed next cat is a rare Golden Cat (doc: ~2-5%, nudged up for MVP visibility). */
const GOLDEN_CAT_CHANCE = 0.08;
const PURR_BAR_HEIGHT = 8;

/**
 * V1 core loop: drop cats, merge same-level pairs on contact, score the merges,
 * and end the run if a resting cat sits above the danger line too long.
 */
export class GameScene extends Phaser.Scene {
  private nextLevel = 1;
  private nextIsGolden = false;
  private highestLevelThisRun = 1;
  private nextPreviewImage!: Phaser.GameObjects.Image;
  private nextPreviewGlow!: Phaser.GameObjects.Image;
  private nextPreviewName!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private dangerWarningText!: Phaser.GameObjects.Text;
  private gameOverContainer!: Phaser.GameObjects.Container;
  private finalScoreText!: Phaser.GameObjects.Text;
  private finalCatPortrait!: Phaser.GameObjects.Image;
  private purrBarFill!: Phaser.GameObjects.Rectangle;
  private purrBarY = 0;

  private score = new ScoreSystem();
  private combo = new ComboSystem();
  private purrMeter = new PurrMeterSystem();
  private audio = new AudioSystem();
  private dangerLine!: DangerLineSystem;
  private idleSystem!: IdleSystem;
  private canDrop = true;
  private isGameOver = false;

  constructor() {
    super('Game');
  }

  create() {
    this.score.reset();
    // Fresh instances each run (restart() reuses this Scene object rather than reconstructing it,
    // so these need a hard reset the way `score` gets via .reset() — ScoreSystem keeps `best`
    // across runs on purpose, these two have nothing worth carrying over).
    this.combo = new ComboSystem();
    this.purrMeter = new PurrMeterSystem();
    this.nextLevel = 1;
    this.nextIsGolden = false;
    this.highestLevelThisRun = 1;
    this.isGameOver = false;
    this.canDrop = true;

    // Inner play-area rect (CONTAINER_LEFT..CONTAINER_RIGHT, CONTAINER_TOP..CONTAINER_FLOOR) with
    // invisible walls of WALL_THICKNESS built inward from the panel's gray arena section (drawn in
    // buildPanel) — the panel's own fill/border is what reads visually as the container.
    // The arena starts at CONTAINER_TOP (the panel's score/arena divider) so cats can never
    // spawn into or overlap the score section above it.
    this.matter.world.setBounds(
      CONTAINER_LEFT,
      CONTAINER_TOP,
      CONTAINER_RIGHT - CONTAINER_LEFT,
      CONTAINER_FLOOR - CONTAINER_TOP,
      WALL_THICKNESS,
      true,
      true,
      false,
      true,
    );

    this.buildHeaderText();
    this.buildPanel();

    // Danger line marker + its "about to lose" countdown text (hidden until triggered).
    const dangerLineGraphics = this.add.graphics();
    dangerLineGraphics.lineStyle(2, 0xe0463f, 0.8);
    dangerLineGraphics.lineBetween(CONTAINER_LEFT, DANGER_LINE_Y, CONTAINER_RIGHT, DANGER_LINE_Y);

    this.dangerWarningText = this.add
      .text(GAME_WIDTH / 2, DANGER_LINE_Y + 6, '', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#e0463f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    // Stats section of the panel (yellow, per the sketch): Score (left) / Next-cat preview
    // (center) / Best (right). Padded off the panel's own edges, not the arena's physics edges.
    const statsTop = PANEL_TOP + 4;

    this.scoreText = this.add.text(PANEL_LEFT + 8, statsTop, 'SCORE\n0', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#3a2b22',
      align: 'left',
    });

    this.bestText = this.add
      .text(PANEL_RIGHT - 8, statsTop, `BEST\n${this.score.best}`, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#3a2b22',
        align: 'right',
      })
      .setOrigin(1, 0);

    // "Next cat" preview — a fixed-size box so every level reads at the same size here,
    // regardless of how big that cat's actual physics body is once dropped.
    this.add
      .text(GAME_WIDTH / 2, statsTop, 'NEXT', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#6b5644',
      })
      .setOrigin(0.5, 0);

    this.nextPreviewGlow = this.add.image(GAME_WIDTH / 2, statsTop + 32, GOLDEN_GLOW_TEXTURE);
    this.nextPreviewGlow.setBlendMode(Phaser.BlendModes.ADD);
    this.nextPreviewGlow.setTint(0xffd873);
    this.nextPreviewGlow.setVisible(false);
    this.tweens.add({
      targets: this.nextPreviewGlow,
      alpha: 0.5,
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.nextPreviewImage = this.add.image(GAME_WIDTH / 2, statsTop + 32, textureKeyForLevel(this.nextLevel));
    this.nextPreviewName = this.add
      .text(GAME_WIDTH / 2, statsTop + 54, '', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#3a2b22',
      })
      .setOrigin(0.5, 0);

    this.buildPurrBar(statsTop + 74);
    this.updateNextPreview();

    this.gameOverContainer = this.buildGameOverOverlay();

    registerMergeSystem(this.matter.world, {
      onMerge: ({ newLevel, x, y, isGolden }) => {
        const { combo, multiplier } = this.combo.registerMerge();
        const points = getCatData(newLevel).points * multiplier * (isGolden ? 2 : 1);

        this.score.add(points);
        this.refreshScoreText();
        this.audio.playMergeTone(newLevel);
        this.showMergeBurst(x, y, isGolden);
        this.highestLevelThisRun = Math.max(this.highestLevelThisRun, newLevel);

        this.purrMeter.addProgress();
        this.refreshPurrBar();

        if (combo >= 2) {
          this.showComboPopup(combo, x, y);
        }
      },
    });

    this.idleSystem = new IdleSystem(this, this.audio);

    this.dangerLine = new DangerLineSystem({
      onDangerTick: (secondsRemaining) => {
        this.dangerWarningText.setText(`⚠ MEOW MELTDOWN ${secondsRemaining.toFixed(1)}s`);
      },
      onSafe: () => {
        this.dangerWarningText.setText('');
      },
      onGameOver: () => this.triggerGameOver(),
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) {
        return;
      }

      this.audio.unlock(); // must happen from a real user gesture; harmless to call every tap

      if (this.purrMeter.isReady && this.isPointOnPurrBar(pointer.x, pointer.y)) {
        this.activateYarnBall();
        return;
      }

      this.dropCat(pointer.x);
    });
  }

  /**
   * Header text sits directly on the canvas backdrop, above the panel — that backdrop is a
   * placeholder for the evolving world art (Cosy Room -> Jungle -> Savannah, per the plan),
   * so this stays minimal until a real logo/identity replaces it.
   */
  private buildHeaderText() {
    this.add
      .text(GAME_WIDTH / 2, HEADER_TEXT_HEIGHT / 2, '🐱 Cat Kingdom', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#3a2b22',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }

  /** The bordered panel from the sketch: a yellow score section on top of a gray arena section. */
  private buildPanel() {
    const graphics = this.add.graphics();

    graphics.fillStyle(0xffc93c, 1);
    graphics.fillRect(PANEL_LEFT, PANEL_TOP, PANEL_RIGHT - PANEL_LEFT, PANEL_DIVIDER_Y - PANEL_TOP);

    graphics.fillStyle(0xc9c9c9, 1);
    graphics.fillRect(PANEL_LEFT, PANEL_DIVIDER_Y, PANEL_RIGHT - PANEL_LEFT, PANEL_BOTTOM - PANEL_DIVIDER_Y);

    graphics.lineStyle(4, 0x1a1410, 1);
    graphics.strokeRect(PANEL_LEFT, PANEL_TOP, PANEL_RIGHT - PANEL_LEFT, PANEL_BOTTOM - PANEL_TOP);
    graphics.lineBetween(PANEL_LEFT, PANEL_DIVIDER_Y, PANEL_RIGHT, PANEL_DIVIDER_Y);
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) {
      return;
    }
    this.dangerLine.update(delta, this.matter.world);
    this.combo.update(delta);
    this.idleSystem.update(delta, this.matter.world);
  }

  /** Syncs the preview sprite/name to `nextLevel`/`nextIsGolden`, at a fixed on-screen size. */
  private updateNextPreview() {
    this.nextPreviewImage.setTexture(textureKeyForLevel(this.nextLevel));

    // Same idea as Cat.ts: scale by height only (preserving the art's own aspect ratio) so the
    // preview's SIZE actually reflects the cat's relative size, per the character sheet's own
    // "same world, bigger meows" progression — a fixed box for every level was hiding that.
    const radius = getCatData(this.nextLevel).radius;
    const minRadius = getCatData(1).radius;
    const maxRadius = getCatData(MAX_CAT_LEVEL).radius;
    const t = (radius - minRadius) / (maxRadius - minRadius);
    const targetHeight = PREVIEW_MIN_HEIGHT + t * (PREVIEW_MAX_HEIGHT - PREVIEW_MIN_HEIGHT);
    this.nextPreviewImage.setScale(targetHeight / this.nextPreviewImage.height);

    this.nextPreviewGlow.setVisible(this.nextIsGolden);
    this.nextPreviewGlow.setDisplaySize(targetHeight * 1.7, targetHeight * 1.7);

    const name = getCatData(this.nextLevel).name;
    this.nextPreviewName.setText(this.nextIsGolden ? `✨ ${name}` : name);
  }

  private refreshScoreText() {
    this.scoreText.setText(`SCORE\n${this.score.score}`);
    this.bestText.setText(`BEST\n${this.score.best}`);
  }

  /** Randomizes the next cat that will be dropped, including the rare Golden Cat roll. */
  private rollNextCat() {
    this.nextLevel = SPAWNABLE_LEVELS[Phaser.Math.Between(0, SPAWNABLE_LEVELS.length - 1)];
    this.nextIsGolden = Math.random() < GOLDEN_CAT_CHANCE;
    this.updateNextPreview();
  }

  private dropCat(x: number) {
    if (!this.canDrop) {
      return;
    }

    const level = this.nextLevel;
    const isGolden = this.nextIsGolden;
    this.rollNextCat();

    const radius = getCatData(level).radius;
    const clampedX = Phaser.Math.Clamp(x, CONTAINER_LEFT + radius, CONTAINER_RIGHT - radius);

    new Cat(this.matter.world, clampedX, CONTAINER_TOP + radius + 4, level, isGolden);

    this.canDrop = false;
    this.time.delayedCall(DROP_COOLDOWN_MS, () => {
      this.canDrop = true;
    });
  }

  /** The Purr Meter track + fill, drawn as a thin bar at the bottom of the panel's score section. */
  private buildPurrBar(y: number) {
    this.purrBarY = y;
    const barLeft = PANEL_LEFT + 8;
    const barWidth = PANEL_RIGHT - PANEL_LEFT - 16;

    this.add.rectangle(barLeft, y, barWidth, PURR_BAR_HEIGHT, 0x8a6d4a, 0.3).setOrigin(0, 0);
    this.purrBarFill = this.add.rectangle(barLeft, y, 0, PURR_BAR_HEIGHT, 0xff9d5c, 1).setOrigin(0, 0);
  }

  private refreshPurrBar() {
    const barWidth = PANEL_RIGHT - PANEL_LEFT - 16;
    this.purrBarFill.width = barWidth * this.purrMeter.percent;

    if (this.purrMeter.isReady) {
      this.purrBarFill.setFillStyle(0xffd873, 1);
      if (!this.tweens.isTweening(this.purrBarFill)) {
        this.tweens.add({
          targets: this.purrBarFill,
          alpha: 0.5,
          duration: 260,
          yoyo: true,
          repeat: -1,
        });
      }
    } else {
      this.tweens.killTweensOf(this.purrBarFill);
      this.purrBarFill.setAlpha(1);
      this.purrBarFill.setFillStyle(0xff9d5c, 1);
    }
  }

  private isPointOnPurrBar(x: number, y: number): boolean {
    return (
      x >= PANEL_LEFT + 8 && x <= PANEL_RIGHT - 8 && y >= this.purrBarY - 6 && y <= this.purrBarY + PURR_BAR_HEIGHT + 6
    );
  }

  /** Yarn Ball: nudges every cat on the board horizontally toward the arena's center column. */
  private activateYarnBall() {
    this.purrMeter.consume();
    this.refreshPurrBar();
    this.audio.playPowerUp();

    const centerX = (CONTAINER_LEFT + CONTAINER_RIGHT) / 2;
    for (const body of this.matter.world.getAllBodies()) {
      const cat = body.gameObject;
      if (!(cat instanceof Cat)) {
        continue;
      }
      const pull = (centerX - cat.x) * 0.06;
      const velocity = (body as unknown as { velocity: { x: number; y: number } }).velocity;
      this.matter.body.setVelocity(body, { x: velocity.x + pull, y: velocity.y });
    }
  }

  /** A quick expanding-ring flash at the merge point — gold for a Golden Cat merge, warm orange otherwise. */
  private showMergeBurst(x: number, y: number, isGolden: boolean) {
    const ring = this.add.circle(x, y, 6, isGolden ? 0xffd873 : 0xffab73, 0.55).setDepth(400);
    ring.setStrokeStyle(2, isGolden ? 0xffd873 : 0xff8f4d, 0.9);

    this.tweens.add({
      targets: ring,
      radius: isGolden ? 70 : 46,
      alpha: 0,
      duration: isGolden ? 480 : 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private showComboPopup(combo: number, x: number, y: number) {
    const text = this.add
      .text(x, y - 10, `COMBO x${combo}`, {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#ff6f3c',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(500)
      .setScale(0.4);

    // Punchy scale-in "pop", then the usual rise-and-fade.
    this.tweens.add({
      targets: text,
      scale: 1,
      duration: 160,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          y: y - 50,
          alpha: 0,
          duration: 600,
          ease: 'Cubic.easeOut',
          onComplete: () => text.destroy(),
        });
      },
    });
  }

  private buildGameOverOverlay(): Phaser.GameObjects.Container {
    const overlayBg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0, 0);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 110, 'CAT-ASTROPHE!', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.finalCatPortrait = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, textureKeyForLevel(1));
    this.finalCatPortrait.setDisplaySize(56, 56);

    this.finalScoreText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 45, '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);

    const restartHint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 95, 'Tap to try again', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#f7ecd9',
      })
      .setOrigin(0.5);

    const container = this.add.container(0, 0, [overlayBg, title, this.finalCatPortrait, this.finalScoreText, restartHint]);
    container.setDepth(1000);
    container.setVisible(false);
    return container;
  }

  private triggerGameOver() {
    this.isGameOver = true;

    const bestCat = getCatData(this.highestLevelThisRun);
    this.finalCatPortrait.setTexture(textureKeyForLevel(this.highestLevelThisRun));
    this.finalScoreText.setText(`You reached ${bestCat.name}!\nScore: ${this.score.score}\nBest: ${this.score.best}`);
    this.gameOverContainer.setVisible(true);

    this.input.once('pointerdown', () => {
      this.scene.restart();
    });
  }
}
