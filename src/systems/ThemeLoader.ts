import Phaser from 'phaser';
import {
  CAT_LEVELS,
  DEFAULT_THEME_ID,
  portraitTextureKeyForLevel,
  silhouetteTextureKeyForLevel,
  textureKeyForLevel,
} from '../config/catData';
import { animFrameTextureKey, framesForLevel } from '../config/catAnimations';

/**
 * Loads one cosmetic theme's full asset set into `scene`'s texture manager, lazily — the first
 * time a player actually equips that theme (see GameScene's selectTheme), not eagerly for every
 * theme at boot. BootScene's own default-theme preload loop is already ~200 requests (accepted
 * there since it's covered by a loading bar the player only sees once); multiplying that by every
 * theme before anyone has picked one would blow well past that budget for art most players may
 * never even look at.
 *
 * Mirrors BootScene's preload loop file-for-file, just rooted under a `themes/<id>/` subfolder
 * (see catData.ts's per-theme texture-key scheme) instead of the bare default folder — an artist
 * fills in a theme by literally duplicating the default folder's structure there, nothing here
 * needs to change to receive it.
 */

/** Cheap "is this theme's art already in the texture manager" probe — every file in a theme's set
 * loads in the same batch below, so one present key (the Kitten's base sprite) implies the rest
 * are too. Always true for the default theme, which BootScene already loads unconditionally. */
export function isThemeLoaded(scene: Phaser.Scene, theme: string): boolean {
  return theme === DEFAULT_THEME_ID || scene.textures.exists(textureKeyForLevel(1, theme));
}

/**
 * Resolves once loading finishes, whether or not every file in it actually succeeded — a themed
 * file that 404s (expected until real art exists for a given theme/level/frame) never populates
 * its themed key, so this aliases that missing key straight to the already-loaded default-theme
 * texture once the load settles. Every call site elsewhere in the app can then blindly ask for
 * `textureKeyForLevel(level, theme)` (etc.) and always get *something* drawable back — never a
 * missing-texture error or a cat that silently vanishes because one file didn't ship yet.
 *
 * Safe to call for an already-loaded theme (including the default one) — resolves immediately
 * without queuing anything.
 */
export function loadTheme(scene: Phaser.Scene, theme: string): Promise<void> {
  if (isThemeLoaded(scene, theme)) {
    return Promise.resolve();
  }

  const files: { themed: string; fallback: string; path: string }[] = [];
  for (const cat of CAT_LEVELS) {
    files.push({
      themed: textureKeyForLevel(cat.level, theme),
      fallback: textureKeyForLevel(cat.level),
      path: `assets/sprites/cats/themes/${theme}/cat-${cat.level}.webp`,
    });
    files.push({
      themed: silhouetteTextureKeyForLevel(cat.level, theme),
      fallback: silhouetteTextureKeyForLevel(cat.level),
      path: `assets/sprites/cats/themes/${theme}/cat-${cat.level}-silhouette.webp`,
    });
    files.push({
      themed: portraitTextureKeyForLevel(cat.level, theme),
      fallback: portraitTextureKeyForLevel(cat.level),
      path: `assets/portraits/themes/${theme}/cat-${cat.level}.webp`,
    });
    for (const frame of framesForLevel(cat.level)) {
      files.push({
        themed: animFrameTextureKey(cat.level, frame, theme),
        fallback: animFrameTextureKey(cat.level, frame),
        path: `assets/sprites/cats/themes/${theme}/anim/cat-${cat.level}-${frame}.webp`,
      });
    }
  }

  for (const file of files) {
    scene.load.image(file.themed, file.path);
  }

  return new Promise((resolve) => {
    scene.load.once('complete', () => {
      for (const file of files) {
        if (!scene.textures.exists(file.themed) && scene.textures.exists(file.fallback)) {
          scene.textures.addImage(file.themed, scene.textures.get(file.fallback).getSourceImage() as HTMLImageElement);
        }
      }
      resolve();
    });
    scene.load.start();
  });
}
