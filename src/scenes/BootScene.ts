import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { CAT_LEVELS, GOLDEN_GLOW_TEXTURE, textureKeyForLevel } from '../config/catData';

const GLOW_TEXTURE_SIZE = 160;

/**
 * Loads the real cat portraits (cropped from the character sheet in assets-source/,
 * see public/assets/sprites/cats/) — the placeholder-generated circles from earlier
 * phases are gone now that real art exists. Everything downstream still just asks
 * for `textureKeyForLevel(level)`, so nothing else had to change.
 */
export class BootScene extends Phaser.Scene {
  private loadingBarBg!: Phaser.GameObjects.Rectangle;
  private loadingBarFill!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Boot');
  }

  preload() {
    this.buildLoadingBar();
    this.load.on('progress', (value: number) => {
      this.loadingBarFill.width = 200 * value;
    });

    for (const cat of CAT_LEVELS) {
      this.load.image(textureKeyForLevel(cat.level), `assets/sprites/cats/cat-${cat.level}.png`);
    }
  }

  create() {
    this.loadingBarBg.destroy();
    this.loadingBarFill.destroy();
    this.buildGoldenGlowTexture();
    this.scene.start('Game');
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
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 'Loading the Kingdom...', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#3a2b22',
      })
      .setOrigin(0.5);

    this.loadingBarBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 200, 10, 0xffffff, 0.4).setOrigin(0.5);
    this.loadingBarFill = this.add
      .rectangle(GAME_WIDTH / 2 - 100, GAME_HEIGHT / 2, 0, 10, 0xff8fb3, 1)
      .setOrigin(0, 0.5);
  }
}
