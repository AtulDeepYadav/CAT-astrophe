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
import { GOLDEN_GLOW_TEXTURE, getCatData, pickWeightedSpawnLevel, textureKeyForLevel } from '../config/catData';
import { Cat } from '../entities/Cat';
import { registerMergeSystem } from '../systems/MergeSystem';
import { DangerLineSystem } from '../systems/DangerLineSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { ComboSystem, comboLabel } from '../systems/ComboSystem';
import { PurrMeterSystem } from '../systems/PurrMeterSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { IdleSystem } from '../systems/IdleSystem';

/** Minimum time between drops, so spam-tapping can't stack cats on top of each other instantly. */
const DROP_COOLDOWN_MS = 350;
/** Chance a rolled cat is a rare Golden Cat (doc: ~2-5%, nudged up for MVP visibility). */
const GOLDEN_CAT_CHANCE = 0.08;
const PURR_BAR_HEIGHT = 8;
/** A "Clutch Save" only counts (and only pays out) if the danger lasted at least this long — a half-second flicker isn't a save. */
const CLUTCH_SAVE_MIN_DANGER_MS = 800;
const CLUTCH_SAVE_BONUS = 25;
/** Danger line color ramps from calm orange to alarm red as progress (0..1) climbs. */
const DANGER_COLOR_START = 0xffa53d;
const DANGER_COLOR_END = 0xe0463f;

/**
 * Core loop: aim a hovering cat left/right, drop it, merge same-level pairs on contact,
 * score the merges, and end the run if a resting cat sits above the danger line too long.
 */
export class GameScene extends Phaser.Scene {
  /** The cat currently hovering in the arena, about to be dropped — this IS the "what's next" indicator now. */
  private dropLevel = 1;
  private dropIsGolden = false;
  private highestLevelThisRun = 1;

  private dropPreviewImage!: Phaser.GameObjects.Image;
  private dropPreviewGlow!: Phaser.GameObjects.Image;
  private aimGuide!: Phaser.GameObjects.Graphics;
  private dropPreviewX = GAME_WIDTH / 2;
  /** True while a purr-bar tap is being handled, so the same gesture doesn't also commit a drop. */
  private suppressNextDrop = false;

  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private dangerLineGraphics!: Phaser.GameObjects.Graphics;
  private dangerWarningText!: Phaser.GameObjects.Text;
  private gameOverContainer!: Phaser.GameObjects.Container;
  private finalScoreText!: Phaser.GameObjects.Text;
  private finalCatPortrait!: Phaser.GameObjects.Image;
  private purrBarFill!: Phaser.GameObjects.Rectangle;
  private purrBarY = 0;

  /** Guards against re-triggering the once-per-episode warning sound / screen shake every frame. */
  private hasPlayedDangerWarning = false;
  private hasShakenThisDanger = false;

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
    this.highestLevelThisRun = 1;
    this.isGameOver = false;
    this.canDrop = true;
    this.suppressNextDrop = false;
    this.hasPlayedDangerWarning = false;
    this.hasShakenThisDanger = false;

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
    this.dangerLineGraphics = this.add.graphics();
    this.drawDangerLine(DANGER_COLOR_START, 0.8);

    this.dangerWarningText = this.add
      .text(GAME_WIDTH / 2, DANGER_LINE_Y + 6, '', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#e0463f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    // Stats section of the panel (yellow, per the sketch): Score (left) / Best (right), plus the
    // Purr Meter bar. No next-cat preview here — the hovering drop cat in the arena already
    // shows exactly what's about to fall, so a second "next" box was redundant.
    const statsTop = PANEL_TOP + 6;

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

    this.buildPurrBar(statsTop + 32);

    // The hovering "current drop" cat + its golden glow + a faint aim guide toward the floor.
    this.aimGuide = this.add.graphics();
    this.dropPreviewGlow = this.add.image(0, 0, GOLDEN_GLOW_TEXTURE);
    this.dropPreviewGlow.setBlendMode(Phaser.BlendModes.ADD);
    this.dropPreviewGlow.setTint(0xffd873);
    this.dropPreviewGlow.setVisible(false);
    this.tweens.add({
      targets: this.dropPreviewGlow,
      alpha: 0.5,
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.dropPreviewImage = this.add.image(0, 0, textureKeyForLevel(1));

    const rolled = this.rollLevel();
    this.dropLevel = rolled.level;
    this.dropIsGolden = rolled.isGolden;
    this.updateDropPreview();
    this.updateDropPreviewPosition(this.dropPreviewX);

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
      onDangerTick: (secondsRemaining, progress) => {
        this.dangerWarningText.setText(`⚠ MEOW MELTDOWN ${secondsRemaining.toFixed(1)}s`);
        if (!this.hasPlayedDangerWarning) {
          this.hasPlayedDangerWarning = true;
          this.audio.playDangerWarning();
        }
        this.updateDangerVisuals(progress);
      },
      onSafe: (dangerDurationMs) => {
        this.dangerWarningText.setText('');
        this.resetDangerVisuals();
        if (dangerDurationMs >= CLUTCH_SAVE_MIN_DANGER_MS) {
          this.showClutchSave();
        }
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
        this.suppressNextDrop = true;
        return;
      }

      this.suppressNextDrop = false;
      this.updateDropPreviewPosition(pointer.x);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver || this.suppressNextDrop) {
        return;
      }
      this.updateDropPreviewPosition(pointer.x);
    });

    this.input.on('pointerup', () => {
      if (this.isGameOver) {
        return;
      }
      if (this.suppressNextDrop) {
        this.suppressNextDrop = false;
        return;
      }
      this.commitDrop();
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

  /** Picks a level via the weighted spawn table plus an independent Golden Cat roll. */
  private rollLevel(): { level: number; isGolden: boolean } {
    return { level: pickWeightedSpawnLevel(), isGolden: Math.random() < GOLDEN_CAT_CHANCE };
  }

  private refreshScoreText() {
    this.scoreText.setText(`SCORE\n${this.score.score}`);
    this.bestText.setText(`BEST\n${this.score.best}`);
  }

  /** Syncs the hovering arena preview to `dropLevel`/`dropIsGolden` — the cat about to be dropped. */
  private updateDropPreview() {
    this.dropPreviewImage.setTexture(textureKeyForLevel(this.dropLevel));
    const radius = getCatData(this.dropLevel).radius;
    this.dropPreviewImage.setScale((radius * 2) / this.dropPreviewImage.height);
    this.dropPreviewGlow.setVisible(this.dropIsGolden);
    this.dropPreviewGlow.setDisplaySize(radius * 3.2, radius * 3.2);
  }

  /** Moves the hovering preview (+ its glow + aim guide) to a clamped x, following the pointer. */
  private updateDropPreviewPosition(x: number) {
    const radius = getCatData(this.dropLevel).radius;
    this.dropPreviewX = Phaser.Math.Clamp(x, CONTAINER_LEFT + radius, CONTAINER_RIGHT - radius);
    const y = CONTAINER_TOP + radius + 4;

    this.dropPreviewImage.setPosition(this.dropPreviewX, y);
    this.dropPreviewGlow.setPosition(this.dropPreviewX, y);

    // Short and faint rather than a full-height line down to the floor — just enough to read as
    // an aim hint without dominating the board.
    this.aimGuide.clear();
    this.aimGuide.lineStyle(1, 0x3a2b22, 0.12);
    const guideBottom = Math.min(CONTAINER_FLOOR, y + radius + 90);
    this.aimGuide.lineBetween(this.dropPreviewX, y + radius, this.dropPreviewX, guideBottom);
  }

  /** Drops the currently-hovering cat at its aimed position, then rolls a fresh one to hover next. */
  private commitDrop() {
    if (!this.canDrop) {
      return;
    }

    const level = this.dropLevel;
    const isGolden = this.dropIsGolden;
    const radius = getCatData(level).radius;

    new Cat(this.matter.world, this.dropPreviewX, CONTAINER_TOP + radius + 4, level, isGolden);

    const rolled = this.rollLevel();
    this.dropLevel = rolled.level;
    this.dropIsGolden = rolled.isGolden;
    this.updateDropPreview();
    this.updateDropPreviewPosition(this.dropPreviewX);

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
    // Padded well past the bar's drawn 8px height — a real fingertip needs a ~40px+ target, not a hairline.
    return (
      x >= PANEL_LEFT + 8 &&
      x <= PANEL_RIGHT - 8 &&
      y >= this.purrBarY - 16 &&
      y <= this.purrBarY + PURR_BAR_HEIGHT + 16
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
      .text(x, y - 10, comboLabel(combo), {
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

  private drawDangerLine(color: number, alpha: number) {
    this.dangerLineGraphics.clear();
    this.dangerLineGraphics.lineStyle(2, color, alpha);
    this.dangerLineGraphics.lineBetween(CONTAINER_LEFT, DANGER_LINE_Y, CONTAINER_RIGHT, DANGER_LINE_Y);
  }

  /** Escalates the danger line's color toward alarm-red and shakes the screen once past the halfway point. */
  private updateDangerVisuals(progress: number) {
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(DANGER_COLOR_START),
      Phaser.Display.Color.ValueToColor(DANGER_COLOR_END),
      100,
      Math.round(progress * 100),
    );
    this.drawDangerLine(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 0.8 + progress * 0.2);

    if (progress > 0.5 && !this.hasShakenThisDanger) {
      this.hasShakenThisDanger = true;
      this.cameras.main.shake(150, 0.006);
    }
  }

  private resetDangerVisuals() {
    this.drawDangerLine(DANGER_COLOR_START, 0.8);
    this.hasPlayedDangerWarning = false;
    this.hasShakenThisDanger = false;
  }

  /** Rewards surviving a real scare — the board clearing the danger line after a meaningful close call. */
  private showClutchSave() {
    this.score.add(CLUTCH_SAVE_BONUS);
    this.refreshScoreText();
    this.audio.playClutchSave();

    const text = this.add
      .text(GAME_WIDTH / 2, CONTAINER_TOP + 60, `CLUTCH SAVE! +${CLUTCH_SAVE_BONUS}`, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#2ecc71',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(500)
      .setScale(0.4);

    this.tweens.add({
      targets: text,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          y: text.y - 40,
          alpha: 0,
          duration: 700,
          delay: 300,
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
