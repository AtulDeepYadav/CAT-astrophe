import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, MATTER_CONFIG } from './config/gameConfig';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import './style.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  // Placeholder "world" backdrop color — Phase 3 swaps this for the evolving background art.
  backgroundColor: '#f7b6d2',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: MATTER_CONFIG,
  },
  scene: [BootScene, GameScene],
};

const game = new Phaser.Game(config);

if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
