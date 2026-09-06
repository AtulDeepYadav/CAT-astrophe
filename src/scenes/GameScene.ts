import Phaser from 'phaser';
import {
  CONTAINER_FLOOR,
  CONTAINER_LEFT,
  CONTAINER_RIGHT,
  CONTAINER_TOP,
  DANGER_LINE_Y,
  FONT_FAMILY,
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
import {
  CAT_LEVELS,
  GOLDEN_GLOW_TEXTURE,
  MAX_CAT_LEVEL,
  getCatData,
  pickWeightedSpawnLevel,
  silhouetteTextureKeyForLevel,
  textureKeyForLevel,
} from '../config/catData';
import type { WorldZoneKey } from '../config/worldZones';
import { backgroundTextureKeyForZone, zoneForLevel } from '../config/worldZones';
import { Cat } from '../entities/Cat';
import { registerMergeSystem } from '../systems/MergeSystem';
import { DangerLineSystem } from '../systems/DangerLineSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { ComboSystem, MAX_COMBO_TIER, comboLabel } from '../systems/ComboSystem';
import { PurrMeterSystem } from '../systems/PurrMeterSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { IdleSystem } from '../systems/IdleSystem';
import { CollectionSystem } from '../systems/CollectionSystem';
import { StatsSystem } from '../systems/StatsSystem';
import { ACHIEVEMENTS, AchievementSystem } from '../systems/AchievementSystem';
import { COSMETIC_OPTIONS, CosmeticsSystem } from '../systems/CosmeticsSystem';

/** Minimum time between drops, so spam-tapping can't stack cats on top of each other instantly. */
const DROP_COOLDOWN_MS = 350;
/** Chance a rolled cat is a rare Golden Cat (doc: ~2-5%, nudged up for MVP visibility). */
const GOLDEN_CAT_CHANCE = 0.08;
const PURR_BAR_HEIGHT = 11;
/** A "Clutch Save" only counts (and only pays out) if the danger lasted at least this long — a half-second flicker isn't a save. */
const CLUTCH_SAVE_MIN_DANGER_MS = 800;
const CLUTCH_SAVE_BONUS = 25;
/** Danger line color ramps from calm orange to alarm red as progress (0..1) climbs. */
const DANGER_COLOR_START = 0xffa53d;
const DANGER_COLOR_END = 0xe0463f;
/** Cheetah and up count as "Big Cats" — the header's headline stat, and where discoveries start getting the bigger cinematic treatment. */
const BIG_CAT_LEVEL = 7;
/** Lion is the mid-game "king" milestone; three Legendary+ tiers now exist above it. */
const LION_LEVEL = 10;
/** One-time bonus for the Lion cinematic moment (first-ever Lion). */
const LION_DISCOVERY_BONUS = 200;
/** One-time bonus for the Celestial Cat cinematic (first-ever true final form). */
const CELESTIAL_DISCOVERY_BONUS = 500;
/** One-time bonus for a "New Species" cinematic (Big Cats other than Lion/Celestial, which have their own bespoke moments and bonuses). */
const NEW_SPECIES_BONUS = 100;
/** Accent color for achievement-unlock banners — distinct from the cat-discovery gold. */
const ACHIEVEMENT_ACCENT = 0x8ec6ff;
/** Shared between buildCatsTab (layout) and openCollectionBook (re-scaling on open) so they can't drift apart. */
const COLLECTION_CELL_IMAGE_HEIGHT = 50;
/** Flavor text for the once-per-run "you've reached a new area" banner — home has none, it's the starting zone. */
const ZONE_TRANSITION_TEXT: Partial<Record<WorldZoneKey, { emoji: string; title: string }>> = {
  backyard: { emoji: '🌿', title: 'THE OUTSIDE WORLD AWAITS' },
  forest: { emoji: '🌲', title: 'ENTERING THE WILD' },
  jungle: { emoji: '🐆', title: 'THE JUNGLE CALLS' },
  savannah: { emoji: '👑', title: 'WHERE THE WILD KINGS ROAM' },
};

type CollectionBookTab = 'cats' | 'stats' | 'style';

/**
 * Core loop: aim a hovering cat left/right, drop it, merge same-level pairs on contact,
 * score the merges, and end the run if a resting cat sits above the danger line too long.
 */
export class GameScene extends Phaser.Scene {
  /** The cat currently hovering in the arena, about to be dropped — this IS the "what's next" indicator now. */
  private dropLevel = 1;
  private dropIsGolden = false;
  private highestLevelThisRun = 1;

  private worldBackground!: Phaser.GameObjects.Image;
  private currentZoneKey: WorldZoneKey = 'home';

  private collection = new CollectionSystem();
  // Lifetime meta-progression systems (Phase 4) — never reset in create(), unlike combo/purrMeter.
  private stats = new StatsSystem();
  private achievements = new AchievementSystem();
  private cosmetics = new CosmeticsSystem();
  private bigCatText!: Phaser.GameObjects.Text;

  private collectionBookContainer!: Phaser.GameObjects.Container;
  private collectionBookTab: CollectionBookTab = 'cats';
  private collectionTabButtons: { key: CollectionBookTab; text: Phaser.GameObjects.Text }[] = [];
  private catsTabContainer!: Phaser.GameObjects.Container;
  private statsTabContainer!: Phaser.GameObjects.Container;
  private styleTabContainer!: Phaser.GameObjects.Container;
  private collectionCells: {
    level: number;
    image: Phaser.GameObjects.Image;
    name: Phaser.GameObjects.Text;
    tier: Phaser.GameObjects.Text;
  }[] = [];
  private collectionButtonBounds = { x: 0, y: 0, radius: 22 };
  private cosmeticSwatchBounds: { id: string; x: number; y: number; radius: number }[] = [];

  private dropPreviewImage!: Phaser.GameObjects.Image;
  private dropPreviewGlow!: Phaser.GameObjects.Image;
  private aimGuide!: Phaser.GameObjects.Graphics;
  private dropPreviewX = GAME_WIDTH / 2;
  /** True while a purr-bar tap is being handled, so the same gesture doesn't also commit a drop. */
  private suppressNextDrop = false;

  private scoreValueText!: Phaser.GameObjects.Text;
  private bestValueText!: Phaser.GameObjects.Text;
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
  private audio = new AudioSystem(this);
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
    this.currentZoneKey = zoneForLevel(1).key;
    this.isGameOver = false;
    this.canDrop = true;
    this.suppressNextDrop = false;
    this.hasPlayedDangerWarning = false;
    this.hasShakenThisDanger = false;
    // Kitten is never a merge *result* (only ever dropped), so it would otherwise sit permanently
    // "undiscovered" despite being the first cat every player sees — count it as known from the start.
    this.collection.discover(1);
    this.stats.recordGameStarted();

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

    // World backdrop — drawn first (and pinned behind everything) so it sits under the header,
    // the panel, and the arena's semi-transparent fill. Swaps as `highestLevelThisRun` crosses
    // into a new zone (see updateWorldBackground); baked to exactly GAME_WIDTH x GAME_HEIGHT so
    // it needs no scaling.
    this.worldBackground = this.add
      .image(0, 0, backgroundTextureKeyForZone(this.currentZoneKey))
      .setOrigin(0, 0)
      .setDepth(-100);

    this.buildHeaderText();
    this.buildPanel();

    // Danger line marker + its "about to lose" countdown text (hidden until triggered).
    this.dangerLineGraphics = this.add.graphics();
    this.drawDangerLine(DANGER_COLOR_START, 0.8);

    this.dangerWarningText = this.add
      .text(GAME_WIDTH / 2, DANGER_LINE_Y + 8, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#e0463f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    // Stats section of the panel (yellow, per the sketch): Score (left) / Best (right), plus the
    // Purr Meter bar. No next-cat preview here — the hovering drop cat in the arena already
    // shows exactly what's about to fall, so a second "next" box was redundant. One compact line
    // per side instead of a label-over-number card — the arena gets the vertical space back.
    const statsTop = PANEL_TOP + 9;

    this.scoreValueText = this.add.text(PANEL_LEFT + 10, statsTop, 'SCORE 0', {
      fontFamily: FONT_FAMILY,
      fontSize: '16px',
      fontStyle: '800',
      color: '#3a2b22',
    });

    this.bestValueText = this.add
      .text(PANEL_RIGHT - 10, statsTop, `BEST ${this.score.best}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: '800',
        color: '#3a2b22',
      })
      .setOrigin(1, 0);

    this.buildPurrBar(statsTop + 22);

    // The hovering "current drop" cat + its golden glow + a faint aim guide toward the floor.
    this.aimGuide = this.add.graphics();
    this.dropPreviewGlow = this.add.image(0, 0, GOLDEN_GLOW_TEXTURE);
    this.dropPreviewGlow.setBlendMode(Phaser.BlendModes.ADD);
    this.dropPreviewGlow.setTint(this.cosmetics.getSelectedColor());
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
    this.collectionBookContainer = this.buildCollectionBookOverlay();

    registerMergeSystem(this.matter.world, {
      onMerge: ({ newLevel, x, y, isGolden }) => {
        const { combo, multiplier } = this.combo.registerMerge();
        const points = getCatData(newLevel).points * multiplier * (isGolden ? 2 : 1);

        // Checked before collection.discover() mutates state — updateWorldBackground fires its
        // own once-per-run zone banner and needs to know whether a cat-discovery banner/cinematic
        // is also about to fire this same merge, so it can wait its turn instead of colliding.
        const willDiscoverThisMerge = !this.collection.isDiscovered(newLevel);

        this.score.add(points);
        this.refreshScoreText();
        this.audio.playMergeTone(newLevel);
        this.showMergeBurst(x, y, isGolden);
        this.highestLevelThisRun = Math.max(this.highestLevelThisRun, newLevel);
        this.updateWorldBackground(this.highestLevelThisRun, willDiscoverThisMerge);

        this.purrMeter.addProgress();
        this.refreshPurrBar();

        this.stats.recordMerge();
        this.tryUnlockAchievement('first_merge');
        if (isGolden) {
          this.tryUnlockAchievement('first_golden');
        }
        if (this.stats.get().totalCatsMerged >= 100) {
          this.tryUnlockAchievement('merged_100');
        }

        if (combo >= 2) {
          this.showComboPopup(combo, x, y);
        }
        this.stats.recordCombo(combo);
        if (combo >= 5) {
          this.tryUnlockAchievement('combo_5');
        }

        if (newLevel >= BIG_CAT_LEVEL) {
          this.stats.recordBigCat();
          this.refreshBigCatText();
        }
        if (newLevel === LION_LEVEL) {
          this.stats.recordLion();
          // Silent: the Lion cinematic below is already the celebration for this moment —
          // a second banner popping up mid-cinematic would just be visual clutter.
          this.tryUnlockAchievement('first_lion', { silent: true });
        }
        if (newLevel === MAX_CAT_LEVEL) {
          this.tryUnlockAchievement('first_celestial', { silent: true });
        }

        if (this.collection.discover(newLevel)) {
          if (newLevel === LION_LEVEL) {
            this.showLionCinematic();
          } else if (newLevel === MAX_CAT_LEVEL) {
            this.showCelestialCinematic();
          } else if (newLevel >= BIG_CAT_LEVEL) {
            this.showNewSpeciesCinematic(newLevel);
          } else {
            this.showDiscoveryBanner(newLevel);
          }
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
          // A slow heartbeat-like pulse while the warning is up adds tension without changing
          // the text's actual readability — it settles back to rest the instant the board clears.
          this.tweens.add({
            targets: this.dangerWarningText,
            scale: 1.1,
            duration: 260,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
        this.updateDangerVisuals(progress);
      },
      onSafe: (dangerDurationMs) => {
        this.dangerWarningText.setText('');
        this.tweens.killTweensOf(this.dangerWarningText);
        this.dangerWarningText.setScale(1);
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

      if (this.collectionBookContainer.visible) {
        const tabHit = this.hitTestCollectionTab(pointer.x, pointer.y);
        if (tabHit) {
          this.setCollectionBookTab(tabHit);
          this.suppressNextDrop = true;
          return;
        }
        if (this.collectionBookTab === 'style') {
          const swatchHit = this.hitTestCosmeticSwatch(pointer.x, pointer.y);
          if (swatchHit) {
            this.selectCosmetic(swatchHit);
            this.suppressNextDrop = true;
            return;
          }
        }
        this.closeCollectionBook();
        this.suppressNextDrop = true;
        return;
      }

      if (this.isPointOnCollectionButton(pointer.x, pointer.y)) {
        this.openCollectionBook();
        this.suppressNextDrop = true;
        return;
      }

      if (this.purrMeter.isReady && this.isPointOnPurrBar(pointer.x, pointer.y)) {
        this.activateYarnBall();
        this.suppressNextDrop = true;
        return;
      }

      this.suppressNextDrop = false;
      this.updateDropPreviewPosition(pointer.x);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver || this.suppressNextDrop || this.collectionBookContainer.visible) {
        return;
      }
      this.updateDropPreviewPosition(pointer.x);
    });

    this.input.on('pointerup', () => {
      if (this.isGameOver || this.collectionBookContainer.visible) {
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
    // A white stroke keeps this legible over every zone backdrop, from a bright cosy room to a
    // dark forest to an orange sunset — a plain fill alone only worked against the old flat pink.
    this.add
      .text(GAME_WIDTH / 2, HEADER_TEXT_HEIGHT / 2, '🐱 Cat-astrophe', {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
        color: '#3a2b22',
        fontStyle: 'bold',
        stroke: '#fdf6ec',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    // Big Cats count, top-left of the header — symmetric with the Collection Book button, +1 per
    // Cheetah-or-bigger ever merged (lifetime, via StatsSystem), tapping into the Collection
    // Book's Stats tab. Was a Lion-only "crown" count, but "👑 0" told a new player nothing —
    // this at least reads as a running tally even before they know exactly what it counts.
    this.bigCatText = this.add
      .text(30, HEADER_TEXT_HEIGHT / 2, `🐆 ${this.stats.get().bigCatsCreated}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#3a2b22',
        fontStyle: 'bold',
        stroke: '#fdf6ec',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // Collection Book button, top-right of the header.
    this.collectionButtonBounds = { x: GAME_WIDTH - 30, y: HEADER_TEXT_HEIGHT / 2, radius: 24 };
    this.add
      .text(this.collectionButtonBounds.x, this.collectionButtonBounds.y, '📖', {
        fontSize: '24px',
        stroke: '#fdf6ec',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  private refreshBigCatText() {
    this.bigCatText.setText(`🐆 ${this.stats.get().bigCatsCreated}`);
  }

  /**
   * The bordered panel from the sketch: a yellow score section on top of a translucent arena
   * section. The arena fill is a soft tint rather than opaque gray so the world backdrop shows
   * through behind the falling cats — the "glass tank" look from the background reference.
   */
  private buildPanel() {
    const graphics = this.add.graphics();
    const radius = 16;
    const width = PANEL_RIGHT - PANEL_LEFT;

    // Rounded outer corners, square where the score bar meets the arena — a flat seam there
    // reads as one continuous panel rather than a rounded rect sitting inside another.
    graphics.fillStyle(0xffc93c, 1);
    graphics.fillRoundedRect(PANEL_LEFT, PANEL_TOP, width, PANEL_DIVIDER_Y - PANEL_TOP, {
      tl: radius,
      tr: radius,
      bl: 0,
      br: 0,
    });

    // Arena fill removed entirely (was a translucent wash) — the world background now shows
    // straight through the play area, with only the gold border below marking its edges.
    graphics.lineStyle(4, 0xb8860b, 1);
    graphics.strokeRoundedRect(PANEL_LEFT, PANEL_TOP, width, PANEL_BOTTOM - PANEL_TOP, radius);
    graphics.lineBetween(PANEL_LEFT, PANEL_DIVIDER_Y, PANEL_RIGHT, PANEL_DIVIDER_Y);
  }

  /**
   * Crossfades the world backdrop when `level` puts the player in a new zone (see worldZones.ts),
   * and queues that zone's once-per-run announcement banner. `willDiscoverThisMerge` lets the
   * caller warn us a cat-discovery banner/cinematic is about to fire from this same merge (e.g.
   * reaching level 9 is both a new zone AND a new Tiger) — the zone banner waits its turn instead
   * of rendering on top of it.
   */
  private updateWorldBackground(level: number, willDiscoverThisMerge: boolean) {
    const zone = zoneForLevel(level);
    if (zone.key === this.currentZoneKey) {
      return;
    }
    this.currentZoneKey = zone.key;
    if (zone.key === 'savannah') {
      this.tryUnlockAchievement('reach_savannah');
    }

    this.tweens.add({
      targets: this.worldBackground,
      alpha: 0,
      duration: 260,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.worldBackground.setTexture(backgroundTextureKeyForZone(zone.key));
        this.tweens.add({ targets: this.worldBackground, alpha: 1, duration: 420, ease: 'Sine.easeOut' });
      },
    });

    // A discovery banner holds ~2s, the Lion/Celestial/New Species cinematics ~2.3s — 2600ms
    // clears the longest of those with room to spare. Otherwise just let the merge burst settle.
    const delay = willDiscoverThisMerge ? 2600 : 400;
    this.time.delayedCall(delay, () => this.showZoneTransitionBanner(zone.key));
  }

  /** Once-per-run "you've reached a new area" banner — home has none, it's the starting zone. */
  private showZoneTransitionBanner(zoneKey: WorldZoneKey) {
    const flavor = ZONE_TRANSITION_TEXT[zoneKey];
    if (!flavor) {
      return;
    }
    this.showCelebrationBanner({
      portraitEmoji: flavor.emoji,
      eyebrow: 'NEW AREA UNLOCKED',
      title: flavor.title,
      accentColor: 0xffd873,
      holdMs: 1400,
    });
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
    this.scoreValueText.setText(`SCORE ${this.score.score}`);
    this.bestValueText.setText(`BEST ${this.score.best}`);
  }

  /** Syncs the hovering arena preview to `dropLevel`/`dropIsGolden` — the cat about to be dropped. */
  private updateDropPreview() {
    this.dropPreviewImage.setTexture(textureKeyForLevel(this.dropLevel));
    const radius = getCatData(this.dropLevel).radius;
    this.dropPreviewImage.setScale((radius * 2) / this.dropPreviewImage.height);
    this.dropPreviewGlow.setVisible(this.dropIsGolden);
    this.dropPreviewGlow.setDisplaySize(radius * 3.2, radius * 3.2);
    this.dropPreviewGlow.setTint(this.cosmetics.getSelectedColor());
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

    new Cat(
      this.matter.world,
      this.dropPreviewX,
      CONTAINER_TOP + radius + 4,
      level,
      isGolden,
      this.cosmetics.getSelectedColor(),
    );

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

  private isPointOnCollectionButton(x: number, y: number): boolean {
    const { x: bx, y: by, radius } = this.collectionButtonBounds;
    return Phaser.Math.Distance.Between(x, y, bx, by) <= radius;
  }

  /**
   * The Collection Book: a tabbed overlay — Cats (grid, silhouetted until first discovered),
   * Stats (lifetime totals + achievement checklist), and Style (golden-glow color picker, gated
   * behind Crown count). Screen space is too tight on a phone to show all three at once.
   */
  private buildCollectionBookOverlay(): Phaser.GameObjects.Container {
    const overlayBg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1a1410, 0.97).setOrigin(0, 0);

    const title = this.add
      .text(GAME_WIDTH / 2, 40, '📖 Cat-astrophe', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: '#fdf6ec',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const tabDefs: { key: CollectionBookTab; label: string }[] = [
      { key: 'cats', label: '🐱 Cats' },
      { key: 'stats', label: '📊 Stats' },
      { key: 'style', label: '✨ Style' },
    ];
    const tabX = [GAME_WIDTH * 0.2, GAME_WIDTH * 0.5, GAME_WIDTH * 0.8];
    this.collectionTabButtons = tabDefs.map((def, i) => ({
      key: def.key,
      text: this.add
        .text(tabX[i], 74, def.label, {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          color: '#c9bdae',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    }));

    this.catsTabContainer = this.buildCatsTab();
    this.statsTabContainer = this.buildStatsTab();
    this.styleTabContainer = this.buildStyleTab();

    const closeHint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'Tap anywhere else to close', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#c9bdae',
      })
      .setOrigin(0.5);

    const container = this.add.container(0, 0, [
      overlayBg,
      title,
      ...this.collectionTabButtons.map((t) => t.text),
      this.catsTabContainer,
      this.statsTabContainer,
      this.styleTabContainer,
      closeHint,
    ]);
    container.setDepth(1050);
    container.setVisible(false);
    return container;
  }

  private buildCatsTab(): Phaser.GameObjects.Container {
    // 3 columns (13 cats needs 5 rows either way — 2 columns would need 5 rows at a much taller
    // cell height that no longer fits the tab; 3 columns keeps the same row count as the old
    // 10-cat/2-column grid did, just a little narrower per cell).
    const colX = [GAME_WIDTH * 0.2, GAME_WIDTH * 0.5, GAME_WIDTH * 0.8];
    const gridTop = 128;
    const rowHeight = 138;
    const cellImageHeight = COLLECTION_CELL_IMAGE_HEIGHT;

    const children: Phaser.GameObjects.GameObject[] = [];
    this.collectionCells = [];
    for (const cat of CAT_LEVELS) {
      const row = Math.floor((cat.level - 1) / 3);
      const col = (cat.level - 1) % 3;
      const x = colX[col];
      const y = gridTop + row * rowHeight;

      const image = this.add.image(x, y, silhouetteTextureKeyForLevel(cat.level));
      const name = this.add
        .text(x, y + cellImageHeight * 0.68, '???', {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          fontStyle: '700',
          color: '#fdf6ec',
        })
        .setOrigin(0.5);
      const tier = this.add
        .text(x, y + cellImageHeight * 0.68 + 14, '', {
          fontFamily: FONT_FAMILY,
          fontSize: '10px',
          color: '#c9bdae',
        })
        .setOrigin(0.5);

      this.collectionCells.push({ level: cat.level, image, name, tier });
      children.push(image, name, tier);
    }

    return this.add.container(0, 0, children);
  }

  /** Lifetime totals up top, then a scrollable-free checklist of every achievement (locked ones dimmed, name/desc still shown). */
  private buildStatsTab(): Phaser.GameObjects.Container {
    const summary = this.add.text(GAME_WIDTH / 2, 108, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '13px',
      color: '#fdf6ec',
      align: 'center',
      lineSpacing: 4,
    });
    summary.setOrigin(0.5, 0);
    summary.setName('statsSummary');

    const children: Phaser.GameObjects.GameObject[] = [summary];
    const rowTop = 200;
    const rowHeight = 56;

    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const achievement = ACHIEVEMENTS[i];
      const y = rowTop + i * rowHeight;

      const icon = this.add.text(36, y, achievement.icon, { fontSize: '22px' }).setOrigin(0.5);
      const name = this.add
        .text(62, y - 11, achievement.name, {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          color: '#fdf6ec',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);
      const desc = this.add
        .text(62, y + 11, achievement.description, {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: '#c9bdae',
        })
        .setOrigin(0, 0.5);

      icon.setName(`ach-icon-${achievement.id}`);
      name.setName(`ach-name-${achievement.id}`);
      desc.setName(`ach-desc-${achievement.id}`);
      children.push(icon, name, desc);
    }

    return this.add.container(0, 0, children);
  }

  /** Golden-glow color swatches, gated behind lifetime Crown count — tap an unlocked one to select it. */
  private buildStyleTab(): Phaser.GameObjects.Container {
    const intro = this.add
      .text(GAME_WIDTH / 2, 100, 'Pick your Golden Cat glow color', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#c9bdae',
      })
      .setOrigin(0.5);

    const children: Phaser.GameObjects.GameObject[] = [intro];
    const rowTop = 150;
    const rowHeight = 68;
    this.cosmeticSwatchBounds = [];

    for (let i = 0; i < COSMETIC_OPTIONS.length; i++) {
      const option = COSMETIC_OPTIONS[i];
      const y = rowTop + i * rowHeight;
      const cx = 56;

      const circle = this.add.circle(cx, y, 22, option.color, 1).setStrokeStyle(2, 0xfdf6ec, 0.4);
      const name = this.add
        .text(cx + 40, y - 11, option.name, {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          color: '#fdf6ec',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);
      const status = this.add
        .text(cx + 40, y + 11, '', {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: '#c9bdae',
        })
        .setOrigin(0, 0.5);

      circle.setName(`style-circle-${option.id}`);
      name.setName(`style-name-${option.id}`);
      status.setName(`style-status-${option.id}`);
      this.cosmeticSwatchBounds.push({ id: option.id, x: cx, y, radius: 26 });
      children.push(circle, name, status);
    }

    return this.add.container(0, 0, children);
  }

  /** Refreshes all three tabs against current save data, shows the requested one, then shows the book. */
  private openCollectionBook() {
    for (const cell of this.collectionCells) {
      const discovered = this.collection.isDiscovered(cell.level);

      cell.image.setTexture(discovered ? textureKeyForLevel(cell.level) : silhouetteTextureKeyForLevel(cell.level));
      cell.image.setScale(COLLECTION_CELL_IMAGE_HEIGHT / cell.image.height);
      cell.name.setText(discovered ? getCatData(cell.level).name : '???');
      cell.tier.setText(discovered ? getCatData(cell.level).tier : '');
    }

    const s = this.stats.get();
    const summary = this.statsTabContainer.getByName('statsSummary') as Phaser.GameObjects.Text | null;
    summary?.setText(
      `Games Played: ${s.gamesPlayed}    Cats Merged: ${s.totalCatsMerged}\n` +
        `Biggest Combo: x${s.biggestCombo}    Big Cats Merged: ${s.bigCatsCreated}`,
    );
    for (const achievement of ACHIEVEMENTS) {
      const unlocked = this.achievements.isUnlocked(achievement.id);
      const icon = this.statsTabContainer.getByName(`ach-icon-${achievement.id}`) as Phaser.GameObjects.Text | null;
      const name = this.statsTabContainer.getByName(`ach-name-${achievement.id}`) as Phaser.GameObjects.Text | null;
      const desc = this.statsTabContainer.getByName(`ach-desc-${achievement.id}`) as Phaser.GameObjects.Text | null;
      const alpha = unlocked ? 1 : 0.35;
      icon?.setAlpha(alpha);
      name?.setAlpha(alpha);
      desc?.setAlpha(alpha);
      icon?.setText(unlocked ? achievement.icon : '🔒');
    }

    const bigCats = this.stats.get().bigCatsCreated;
    for (const option of COSMETIC_OPTIONS) {
      const unlocked = this.cosmetics.isUnlocked(option.id, bigCats);
      const selected = this.cosmetics.getSelectedId() === option.id;
      const circle = this.styleTabContainer.getByName(`style-circle-${option.id}`) as Phaser.GameObjects.Arc | null;
      const name = this.styleTabContainer.getByName(`style-name-${option.id}`) as Phaser.GameObjects.Text | null;
      const status = this.styleTabContainer.getByName(`style-status-${option.id}`) as Phaser.GameObjects.Text | null;
      circle?.setAlpha(unlocked ? 1 : 0.3);
      circle?.setStrokeStyle(selected ? 3 : 2, selected ? 0xffffff : 0xfdf6ec, selected ? 1 : 0.4);
      name?.setAlpha(unlocked ? 1 : 0.4);
      status?.setText(selected ? 'Selected' : unlocked ? 'Tap to select' : `🔒 Needs ${option.unlockBigCats} 🐆`);
    }

    this.setCollectionBookTab('cats');
    this.collectionBookContainer.setVisible(true);
  }

  private closeCollectionBook() {
    this.collectionBookContainer.setVisible(false);
    // The drop preview's golden glow reflects whatever cosmetic is now selected.
    this.updateDropPreview();
  }

  private setCollectionBookTab(tab: CollectionBookTab) {
    this.collectionBookTab = tab;
    this.catsTabContainer.setVisible(tab === 'cats');
    this.statsTabContainer.setVisible(tab === 'stats');
    this.styleTabContainer.setVisible(tab === 'style');
    for (const button of this.collectionTabButtons) {
      button.text.setColor(button.key === tab ? '#ffd873' : '#c9bdae');
    }
  }

  /** Hit-tests the three tab labels with a generous vertical pad — a text object's own bounds are too tight for a fingertip. */
  private hitTestCollectionTab(x: number, y: number): CollectionBookTab | null {
    for (const button of this.collectionTabButtons) {
      const b = button.text.getBounds();
      if (x >= b.x - 12 && x <= b.x + b.width + 12 && y >= b.y - 14 && y <= b.y + b.height + 14) {
        return button.key;
      }
    }
    return null;
  }

  private hitTestCosmeticSwatch(x: number, y: number): string | null {
    for (const swatch of this.cosmeticSwatchBounds) {
      if (Phaser.Math.Distance.Between(x, y, swatch.x, swatch.y) <= swatch.radius) {
        return swatch.id;
      }
    }
    return null;
  }

  /** Selects a cosmetic if unlocked, re-rendering the Style tab's selection state in place. */
  private selectCosmetic(id: string) {
    const bigCats = this.stats.get().bigCatsCreated;
    if (!this.cosmetics.select(id, bigCats)) {
      return;
    }
    for (const option of COSMETIC_OPTIONS) {
      const selected = option.id === id;
      const circle = this.styleTabContainer.getByName(`style-circle-${option.id}`) as Phaser.GameObjects.Arc | null;
      const status = this.styleTabContainer.getByName(`style-status-${option.id}`) as Phaser.GameObjects.Text | null;
      circle?.setStrokeStyle(selected ? 3 : 2, selected ? 0xffffff : 0xfdf6ec, selected ? 1 : 0.4);
      status?.setText(selected ? 'Selected' : this.cosmetics.isUnlocked(option.id, bigCats) ? 'Tap to select' : status?.text ?? '');
    }
  }

  /**
   * Celebrates discovering a cat for the first time ever (Lion gets its own bigger moment).
   * Fixed at a prominent spot near the top of the arena — not anchored to the merge point, which
   * can be buried mid-pile and easy to miss — with a solid backing pill and a real hold so it's
   * actually readable, not just glimpsed.
   */
  private showDiscoveryBanner(level: number) {
    const data = getCatData(level);
    this.showCelebrationBanner({
      portraitTextureKey: textureKeyForLevel(level),
      eyebrow: 'NEW CAT DISCOVERED!',
      title: data.name,
      accentColor: 0xffd873,
    });
  }

  /** Same beat as a cat discovery, but for a milestone achievement — a distinct accent color, an emoji instead of a portrait. */
  private showAchievementBanner(id: string) {
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    if (!achievement) {
      return;
    }
    this.showCelebrationBanner({
      portraitEmoji: achievement.icon,
      eyebrow: 'ACHIEVEMENT UNLOCKED!',
      title: achievement.name,
      accentColor: ACHIEVEMENT_ACCENT,
    });
  }

  /** Unlocks an achievement (idempotent) and celebrates it, unless `silent` — used when a bigger moment already owns the spotlight. */
  private tryUnlockAchievement(id: string, opts: { silent?: boolean } = {}) {
    if (this.achievements.unlock(id) && !opts.silent) {
      this.showAchievementBanner(id);
    }
  }

  /**
   * Shared "pop in, hold, rise and fade" banner mechanics used by both cat discoveries and
   * achievement unlocks — a fixed spot near the top of the arena, readable over any background.
   */
  private showCelebrationBanner(opts: {
    portraitTextureKey?: string;
    portraitEmoji?: string;
    eyebrow: string;
    title: string;
    accentColor: number;
    holdMs?: number;
  }) {
    const { portraitTextureKey, portraitEmoji, eyebrow, title, accentColor, holdMs = 1300 } = opts;
    const accentHex = `#${accentColor.toString(16).padStart(6, '0')}`;
    const width = 260;
    const height = 58;

    const bg = this.add.rectangle(0, 0, width, height, 0x1a1410, 0.9).setStrokeStyle(2, accentColor, 1);
    const children: Phaser.GameObjects.GameObject[] = [bg];

    if (portraitTextureKey) {
      const portrait = this.add.image(-width / 2 + 34, 0, portraitTextureKey);
      portrait.setScale(44 / portrait.height);
      children.push(portrait);
    } else if (portraitEmoji) {
      children.push(this.add.text(-width / 2 + 34, 0, portraitEmoji, { fontSize: '30px' }).setOrigin(0.5));
    }

    children.push(
      this.add
        .text(-width / 2 + 62, -15, eyebrow, {
          fontFamily: FONT_FAMILY,
          fontSize: '11px',
          color: accentHex,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
      this.add
        .text(-width / 2 + 62, 12, title, {
          fontFamily: FONT_FAMILY,
          fontSize: '19px',
          color: '#fdf6ec',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );

    const banner = this.add.container(GAME_WIDTH / 2, CONTAINER_TOP + 74, children);
    banner.setDepth(600);
    banner.setScale(0.5);
    banner.setAlpha(0);

    this.tweens.add({
      targets: banner,
      scale: 1,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(holdMs, () => {
          this.tweens.add({
            targets: banner,
            y: banner.y - 30,
            alpha: 0,
            duration: 500,
            ease: 'Cubic.easeOut',
            onComplete: () => banner.destroy(),
          });
        });
      },
    });
  }

  /** The first-ever Lion: golden flash, camera punch, a roar, and a bonus — "THE KING HAS ARRIVED". */
  private showLionCinematic() {
    this.audio.playLionRoar();
    this.playMilestoneCinematic({
      tintColor: 0xffd873,
      textColor: '#ffd873',
      title: '👑 THE KING HAS ARRIVED 👑',
      bonus: LION_DISCOVERY_BONUS,
    });
  }

  /** The first-ever Celestial Cat: the same big beat, recolored cosmic-purple, with a bigger bonus. */
  private showCelestialCinematic() {
    this.audio.playCelestialChime();
    this.playMilestoneCinematic({
      tintColor: 0x8a6dff,
      textColor: '#c9b6ff',
      title: '✨ THE CELESTIAL CAT AWAKENS ✨',
      bonus: CELESTIAL_DISCOVERY_BONUS,
    });
  }

  /**
   * First-ever discovery of a Big Cat that isn't Lion or Celestial (Cheetah, Leopard, Tiger,
   * White Lion, Golden Lion) — the same cinematic beat, but skips the camera zoom-punch so Lion
   * and Celestial Cat still read as the two biggest moments in the run rather than being matched.
   */
  private showNewSpeciesCinematic(level: number) {
    const data = getCatData(level);
    this.audio.playMergeTone(level);
    this.playMilestoneCinematic({
      tintColor: 0xffd873,
      textColor: '#ffd873',
      title: `🌟 NEW SPECIES! 🌟\n${data.name}`,
      subtitle: 'Added to your Cat-alogue!',
      bonus: NEW_SPECIES_BONUS,
      zoomPunch: false,
    });
  }

  /**
   * Shared "big moment" cinematic beat: freezes attention on a colored flash, a camera punch,
   * and a title card, plus a score bonus. Lion, Celestial Cat, and every other Big Cat's first
   * discovery all use this, just recolored/retitled and (for the non-Lion/Celestial ones)
   * lighter — see each caller for the sound it plays.
   */
  private playMilestoneCinematic(opts: {
    tintColor: number;
    textColor: string;
    title: string;
    subtitle?: string;
    bonus: number;
    zoomPunch?: boolean;
  }) {
    const { tintColor, textColor, title: titleStr, subtitle, bonus, zoomPunch = true } = opts;
    this.score.add(bonus);
    this.refreshScoreText();

    const darken = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0).setOrigin(0, 0).setDepth(900);
    const glow = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, GOLDEN_GLOW_TEXTURE)
      .setDepth(901)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tintColor)
      .setAlpha(0);
    glow.setDisplaySize(GAME_WIDTH * 2.5, GAME_WIDTH * 2.5);

    const title = this.add
      .text(GAME_WIDTH / 2, subtitle ? GAME_HEIGHT / 2 - 16 : GAME_HEIGHT / 2, titleStr, {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: textColor,
        fontStyle: 'bold',
        align: 'center',
        stroke: '#3a2b22',
        strokeThickness: 5,
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5)
      .setDepth(902)
      .setAlpha(0)
      .setScale(0.5);

    const subtitleText = subtitle
      ? this.add
          .text(GAME_WIDTH / 2, title.y + 58, subtitle, {
            fontFamily: FONT_FAMILY,
            fontSize: '14px',
            color: '#fdf6ec',
            fontStyle: 'bold',
            stroke: '#3a2b22',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(902)
          .setAlpha(0)
      : null;

    this.cameras.main.shake(400, 0.01);
    this.tweens.add({ targets: darken, alpha: 0.4, duration: 220, yoyo: true, hold: 250 });
    this.tweens.add({ targets: glow, alpha: 0.85, duration: 320, yoyo: true, hold: 200 });

    if (zoomPunch) {
      const zoomInDuration = 450;
      this.time.delayedCall(180, () => {
        this.cameras.main.zoomTo(1.12, zoomInDuration, 'Sine.easeOut');
      });
      // Scheduled by fixed delay rather than a zoomTo completion callback — that callback fires
      // repeatedly with a `progress` value that can skip past exactly 1 between ticks, which left
      // the camera permanently zoomed in when the follow-up zoom-back never triggered.
      //
      // `force: true` matters here too: this fires at the exact millisecond the first zoom is due
      // to finish, and Phaser's zoomTo silently no-ops if it thinks a zoom is still `isRunning` —
      // which it can still believe for one frame at that exact boundary depending on update order.
      // Without force, that race intermittently left the camera stuck zoomed in forever.
      this.time.delayedCall(180 + zoomInDuration, () => {
        this.cameras.main.zoomTo(1, 550, 'Sine.easeInOut', true);
      });
    }

    this.time.delayedCall(260, () => {
      title.setAlpha(1);
      this.tweens.add({ targets: title, scale: 1, duration: 280, ease: 'Back.easeOut' });
      if (subtitleText) {
        this.time.delayedCall(200, () => {
          this.tweens.add({ targets: subtitleText, alpha: 1, duration: 250 });
        });
      }
      this.time.delayedCall(1700, () => {
        this.tweens.add({
          targets: title,
          alpha: 0,
          y: title.y - 30,
          duration: 500,
          onComplete: () => title.destroy(),
        });
        if (subtitleText) {
          this.tweens.add({ targets: subtitleText, alpha: 0, y: subtitleText.y - 30, duration: 500, onComplete: () => subtitleText.destroy() });
        }
      });
    });

    this.time.delayedCall(2300, () => {
      darken.destroy();
      glow.destroy();
    });
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

  /** A handful of small sparks radiating out from a combo popup — more of them, and further, the bigger the chain. */
  private spawnComboSparks(x: number, y: number, combo: number) {
    const count = Math.min(4 + combo, 10);
    const distance = Math.min(28 + combo * 4, 60);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spark = this.add.circle(x, y, 3, 0xffd873, 0.9).setDepth(499);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.3,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  /**
   * The bigger the chain, the more it should announce itself: a thicker outline + drop shadow so
   * it doesn't get lost against a busy board, a small screen shake once the chain is real (3+),
   * a handful of sparks radiating from the merge point, and — only for the top "KINGDOM COMBO!"
   * tier — a crown that pops in above the text.
   */
  private showComboPopup(combo: number, x: number, y: number) {
    const text = this.add
      .text(x, y - 10, comboLabel(combo), {
        fontFamily: FONT_FAMILY,
        fontSize: '23px',
        color: '#ff6f3c',
        fontStyle: 'bold',
        stroke: '#3a2b22',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(500)
      .setScale(0.4)
      .setShadow(2, 3, '#000000', 4, true, true);

    if (combo >= 3) {
      this.cameras.main.shake(Math.min(90 + combo * 15, 220), Math.min(0.003 + combo * 0.0007, 0.009));
    }
    this.spawnComboSparks(x, y, combo);

    let crown: Phaser.GameObjects.Text | null = null;
    if (combo >= MAX_COMBO_TIER) {
      crown = this.add
        .text(x, y - 34, '👑', { fontSize: '20px' })
        .setOrigin(0.5)
        .setDepth(500)
        .setAlpha(0)
        .setScale(0.3);
    }

    // Punchy scale-in "pop", a real hold so it can actually be read, then rise-and-fade.
    this.tweens.add({
      targets: text,
      scale: 1,
      duration: 160,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (crown) {
          this.tweens.add({ targets: crown, alpha: 1, scale: 1, duration: 200, ease: 'Back.easeOut' });
        }
        this.tweens.add({
          targets: [text, crown].filter((t): t is Phaser.GameObjects.Text => t !== null),
          y: '-=40',
          alpha: 0,
          duration: 600,
          delay: 550,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            text.destroy();
            crown?.destroy();
          },
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
    // Delayed rather than fired immediately: the achievement banner renders at nearly the same
    // spot as the "CLUTCH SAVE!" popup below, and both showing at once (only possible the very
    // first time this fires) rendered as garbled overlapping text. Staggering them lets the
    // popup rise and fade out of the way first.
    this.time.delayedCall(1000, () => this.tryUnlockAchievement('clutch_save'));

    const text = this.add
      .text(GAME_WIDTH / 2, CONTAINER_TOP + 60, `CLUTCH SAVE! +${CLUTCH_SAVE_BONUS}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '25px',
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
          delay: 650,
          ease: 'Cubic.easeOut',
          onComplete: () => text.destroy(),
        });
      },
    });
  }

  private buildGameOverOverlay(): Phaser.GameObjects.Container {
    const overlayBg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0, 0);

    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 130, 'CAT-ASTROPHE!', {
        fontFamily: FONT_FAMILY,
        fontSize: '30px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.finalCatPortrait = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, textureKeyForLevel(1));
    this.finalCatPortrait.setDisplaySize(76, 76);

    this.finalScoreText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);

    const restartHint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 115, 'Tap to try again', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
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
    this.tweens.killTweensOf(this.dangerWarningText); // stop the heartbeat pulse if it was mid-danger

    const bestCat = getCatData(this.highestLevelThisRun);
    this.finalCatPortrait.setTexture(textureKeyForLevel(this.highestLevelThisRun));
    this.finalScoreText.setText(`You reached ${bestCat.name}!\nScore: ${this.score.score}\nBest: ${this.score.best}`);
    this.gameOverContainer.setVisible(true);

    this.input.once('pointerdown', () => {
      this.scene.restart();
    });
  }
}
