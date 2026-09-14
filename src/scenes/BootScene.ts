import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import {
  CAT_LEVELS,
  GOLDEN_GLOW_TEXTURE,
  hasMergeSound,
  mergeSoundKey,
  portraitTextureKeyForLevel,
  silhouetteTextureKeyForLevel,
  textureKeyForLevel,
} from '../config/catData';
import { BG_FRAME_COUNT, WORLD_ZONES, backgroundFrameTextureKey } from '../config/worldZones';
import { animFrameTextureKey, framesForLevel } from '../config/catAnimations';
import { AMBIENT_MUSIC_KEY } from '../systems/MusicSystem';
import { monetization } from '../systems/MonetizationSystem';
import { CosmeticsSystem } from '../systems/CosmeticsSystem';
import { loadTheme } from '../systems/ThemeLoader';

const GLOW_TEXTURE_SIZE = 160;

/** Rotate through these while the ~90-file preload runs — genuinely accurate mechanics tips
 * (checked against the actual code, not vibes), not filler. A loading screen with real content
 * teaches a first-time player something before they've even seen the board, and gives repeat
 * players a reason to actually read it instead of tapping past. */
const LOADING_TIPS: string[] = [
  '🌪️ Merging into a Tiger or a Celestial Cat clears the small cats crowding your board.',
  '✨ Two Golden Cats merge for double points — and a bonus size jump.',
  '💖 Fill the Purr Meter for a free Yarn Ball power-up.',
  '🔗 Merge fast for a combo chain — the quicker the chain, the bigger the score bonus.',
  '😿 Board getting crowded? A revive costs 🐟 30 Fish, or watch a quick ad instead.',
  '🎯 Challenge a Friend from Game Over — they get your exact board and try to beat your score.',
  '🌙 Zen Mode never ends — no danger line, no game over, just a calm board to play with.',
  '📅 The Daily Challenge changes every day, with its own twist on the rules.',
];

/**
 * Loads the real cat portraits (cropped from the character sheet in assets-source/,
 * see public/assets/sprites/cats/) — the placeholder-generated circles from earlier
 * phases are gone now that real art exists. Everything downstream still just asks
 * for `textureKeyForLevel(level)`, so nothing else had to change.
 */
export class BootScene extends Phaser.Scene {
  private loadingBarBg!: Phaser.GameObjects.Rectangle;
  private loadingBarFill!: Phaser.GameObjects.Rectangle;
  private tipText!: Phaser.GameObjects.Text;
  private tipTimer!: Phaser.Time.TimerEvent;
  private tipIndex = 0;
  /** Keys of any files the loader couldn't fetch (dropped connection mid-load, a 404, etc.) —
   * checked once loading finishes so a partial failure shows a real retry screen instead of
   * silently limping into the menu with missing textures/audio. */
  private failedFileKeys: string[] = [];

  constructor() {
    super('Boot');
  }

  preload() {
    this.buildLoadingBar();
    this.load.on('progress', (value: number) => {
      this.loadingBarFill.width = 200 * value;
    });
    this.load.on('loaderror', (file: { key: string }) => {
      this.failedFileKeys.push(file.key);
    });

    for (const cat of CAT_LEVELS) {
      this.load.image(textureKeyForLevel(cat.level), `assets/sprites/cats/cat-${cat.level}.webp`);
      this.load.image(
        silhouetteTextureKeyForLevel(cat.level),
        `assets/sprites/cats/cat-${cat.level}-silhouette.webp`,
      );
      this.load.image(portraitTextureKeyForLevel(cat.level), `assets/portraits/cat-${cat.level}.webp`);

      for (const frame of framesForLevel(cat.level)) {
        this.load.image(
          animFrameTextureKey(cat.level, frame),
          `assets/sprites/cats/anim/cat-${cat.level}-${frame}.webp`,
        );
      }

      if (hasMergeSound(cat.level)) {
        this.load.audio(mergeSoundKey(cat.level), `assets/audio/merge/cat-${cat.level}.mp3`);
      }
    }

    for (const zone of WORLD_ZONES) {
      for (let frame = 1; frame <= BG_FRAME_COUNT; frame += 1) {
        this.load.image(
          backgroundFrameTextureKey(zone.key, frame),
          `assets/backgrounds/${zone.key}-f${frame}.webp`,
        );
      }
    }

    // See MusicSystem — a synthesized, seamlessly-looping ambient pad (no real composer track
    // exists to source, and there's no ffmpeg in this environment to compress one), loaded once
    // here and reused for the whole game session regardless of which scene is active.
    this.load.audio(AMBIENT_MUSIC_KEY, 'assets/audio/music/ambient-loop.wav');
  }

  async create() {
    this.destroyLoadingUI();

    if (this.failedFileKeys.length > 0) {
      this.showLoadErrorScreen();
      return;
    }

    this.buildGoldenGlowTexture();

    // A theme equipped in a previous session (persisted by CosmeticsSystem) has to have its art
    // actually in THIS session's texture manager before anything reads textureKeyForLevel(...,
    // theme) — the manager is rebuilt from scratch on every page load, so a stale reference to an
    // unloaded theme would otherwise show Phaser's missing-texture placeholder everywhere that
    // theme's cats appear. Only the one equipped theme loads here (never every theme, see
    // ThemeLoader's own doc comment for the budget reasoning) and it's a no-op entirely for the
    // (default, and by far most common) case of no theme equipped.
    const equippedTheme = new CosmeticsSystem().getSelectedThemeId();
    await loadTheme(this, equippedTheme);

    // Fire-and-forget: on web this resolves instantly (a no-op), and on Android it brings up the
    // AdMob/RevenueCat SDKs and preloads the first rewarded ad in the background. Nothing here
    // gates the menu on it — a slow ad-network response should never delay getting into the game.
    void monetization.initialize();
    // Phaser bakes Text objects to a texture at creation time — starting the Game scene before
    // the webfont resolves would freeze every label onto the system fallback font permanently,
    // not just for one frame. Race against a timeout so a slow/unavailable font API can never
    // block the game from starting at all.
    await Promise.race([this.waitForFont(), new Promise((resolve) => this.time.delayedCall(2500, resolve))]);
    
    // A friend's "Challenge a Friend" share link (see GameScene's shareContent) — ?mode=challenge
    // routes straight into a Game run seeded to match the sender's exact drop sequence instead of
    // the normal Menu. `target` is untrusted user input via the URL: parseInt on garbage (or a
    // tampered/missing value) produces NaN, which the HUD's `this.targetScore ? ... : ...` check
    // already treats as falsy and quietly falls back to the normal "BEST" display — but parsing it
    // explicitly here (rather than relying on that to catch it) keeps a bad value from ever being
    // stored as a real number goal anywhere else that might not have the same falsy-NaN guard.
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const seed = urlParams.get('seed');
    const targetScoreStr = urlParams.get('target');
    const parsedTarget = targetScoreStr ? parseInt(targetScoreStr, 10) : NaN;
    const targetScore = Number.isFinite(parsedTarget) ? parsedTarget : undefined;

    if (mode === 'challenge' && seed) {
      this.scene.start('Game', { mode: 'challenge', challengeSeed: seed, targetScore });
    } else {
      this.scene.start('Menu');
    }
  }

  /** A dropped connection partway through loading ~90 image/audio files used to just leave the
   * loading bar frozen forever with no explanation — this gives the player something to act on.
   * A full page reload (not just re-running this scene) is the simplest reliable way to retry:
   * Phaser's own loader doesn't cleanly support re-queuing just the files that failed. */
  private showLoadErrorScreen() {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x2b2018, 1).setOrigin(0, 0);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, "Couldn't load everything", {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: '700',
        color: '#fff6e8',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, 'Check your connection and try again.', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#d8c7ae',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5);

    const retryButton = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, 'Retry', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        fontStyle: '700',
        color: '#3a2b22',
        backgroundColor: '#ffd873',
        padding: { x: 28, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    retryButton.on('pointerdown', () => window.location.reload());
  }

  private async waitForFont() {
    try {
      await Promise.all([document.fonts.load('700 32px "Baloo 2"'), document.fonts.load('700 16px "Nunito"')]);
      await document.fonts.ready;
    } catch {
      // Web Font Loading API can be unavailable/unreliable in some contexts (older browsers,
      // privacy modes) — fall through and start with whatever font already resolved.
    }
  }

  /** A soft white radial gradient, tinted gold and additively blended wherever it's used (see Cat.ts). */
  private buildGoldenGlowTexture() {
    const size = GLOW_TEXTURE_SIZE;
    const canvasTexture = this.textures.createCanvas(GOLDEN_GLOW_TEXTURE, size, size);
    if (!canvasTexture) {
      return;
    }

    const ctx = canvasTexture.getContext();
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    canvasTexture.refresh();
  }

  private buildLoadingBar() {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 'Brewing a cat-astrophe...', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#3a2b22',
      })
      .setOrigin(0.5);

    this.loadingBarBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 200, 10, 0xffffff, 0.4).setOrigin(0.5);
    this.loadingBarFill = this.add
      .rectangle(GAME_WIDTH / 2 - 100, GAME_HEIGHT / 2, 0, 10, 0xff8fb3, 1)
      .setOrigin(0, 0.5);

    // Starts on a random tip (not always index 0) so a quick dev-reload or a fast connection that
    // never gets to rotate doesn't always show the same one first.
    this.tipIndex = Math.floor(Math.random() * LOADING_TIPS.length);
    this.tipText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, LOADING_TIPS[this.tipIndex], {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#6f6152',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5, 0);
    this.tipTimer = this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => {
        this.tipIndex = (this.tipIndex + 1) % LOADING_TIPS.length;
        this.tipText.setText(LOADING_TIPS[this.tipIndex]);
      },
    });
  }

  private destroyLoadingUI() {
    this.loadingBarBg.destroy();
    this.loadingBarFill.destroy();
    this.tipText.destroy();
    this.tipTimer.destroy();
  }
}
