/**
 * Single source of truth for the 13 cat levels.
 * Every system (spawner, merge, scoring, audio, sprites) reads from this table
 * instead of hardcoding level numbers — balance changes happen in one place.
 */
/** Rarity tier shown as a small badge in the Collection Book, per the doc's ranking table. */
export type CatTier = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Apex' | 'Legendary' | 'Mythic' | 'Ultimate';

export interface CatLevelData {
  level: number;
  name: string;
  /** Physics body radius in pixels at this level. */
  radius: number;
  /** Unused now that real art (public/assets/sprites/cats) replaced the placeholder circles — kept for possible future UI accent theming per cat. */
  color: number;
  outlineColor: number;
  /** Score awarded when this cat is created via a merge. */
  points: number;
  tier: CatTier;
}

// Radius grows by +1 more each level (deltas 6,7,8...18) and points are triangular
// (n(n+1)/2) — both keep escalating smoothly all the way to the new top tier without
// needing a special case.
export const CAT_LEVELS: CatLevelData[] = [
  { level: 1, name: 'Kitten', radius: 18, color: 0xfff2cc, outlineColor: 0xd9b96a, points: 1, tier: 'Common' },
  { level: 2, name: 'Tabby', radius: 24, color: 0xf5c98a, outlineColor: 0xc98f45, points: 3, tier: 'Common' },
  { level: 3, name: 'Fluffy Cat', radius: 31, color: 0xf0a35e, outlineColor: 0xb8722f, points: 6, tier: 'Common' },
  { level: 4, name: 'House Cat', radius: 39, color: 0xe98a63, outlineColor: 0xaa5836, points: 10, tier: 'Common' },
  { level: 5, name: 'Wildcat', radius: 48, color: 0xd97a5a, outlineColor: 0x954a2e, points: 15, tier: 'Uncommon' },
  { level: 6, name: 'Lynx', radius: 58, color: 0xc2704f, outlineColor: 0x7d3f24, points: 21, tier: 'Uncommon' },
  { level: 7, name: 'Cheetah', radius: 69, color: 0xdba24a, outlineColor: 0x8f6421, points: 28, tier: 'Rare' },
  { level: 8, name: 'Leopard', radius: 81, color: 0xc98d2e, outlineColor: 0x7a561c, points: 36, tier: 'Rare' },
  { level: 9, name: 'Tiger', radius: 94, color: 0xe07a3e, outlineColor: 0x8c451e, points: 45, tier: 'Epic' },
  { level: 10, name: 'Lion', radius: 108, color: 0xd4a017, outlineColor: 0x7d5c0d, points: 55, tier: 'Apex' },
  { level: 11, name: 'White Lion', radius: 123, color: 0xf5f0e6, outlineColor: 0xd4a017, points: 66, tier: 'Legendary' },
  { level: 12, name: 'Golden Lion', radius: 139, color: 0xffd700, outlineColor: 0xb8860b, points: 78, tier: 'Mythic' },
  { level: 13, name: 'Celestial Cat', radius: 156, color: 0x6a5acd, outlineColor: 0x2c1a5e, points: 91, tier: 'Ultimate' },
];

export function getCatData(level: number): CatLevelData {
  const data = CAT_LEVELS[level - 1];
  if (!data) {
    throw new Error(`No cat data for level ${level}`);
  }
  return data;
}

export const MAX_CAT_LEVEL = CAT_LEVELS.length;

/** Levels that can appear as a randomly spawned "next cat" (kept low so the board doesn't fill instantly). */
export const SPAWNABLE_LEVELS = [1, 2, 3, 4];

/**
 * Weighted odds per spawnable level (must line up 1:1 with SPAWNABLE_LEVELS) — small cats show up
 * far more often than big ones, so the player is rarely stuck holding four unmergeable House Cats
 * in a row. Weights don't need to sum to 100; only their ratios matter.
 */
const SPAWN_WEIGHTS = [40, 30, 20, 10];

/** Picks a spawnable level using SPAWN_WEIGHTS instead of a flat uniform chance. `overrideLevels`
 * (a Daily Challenge modifier's own pool) replaces SPAWNABLE_LEVELS entirely with equal odds
 * across the given levels instead of the normal Kitten-heavy weighting. */
export function pickWeightedSpawnLevel(overrideLevels?: number[]): number {
  if (overrideLevels && overrideLevels.length > 0) {
    return overrideLevels[Math.floor(Math.random() * overrideLevels.length)];
  }
  const total = SPAWN_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < SPAWNABLE_LEVELS.length; i++) {
    roll -= SPAWN_WEIGHTS[i];
    if (roll <= 0) {
      return SPAWNABLE_LEVELS[i];
    }
  }
  return SPAWNABLE_LEVELS[SPAWNABLE_LEVELS.length - 1]; // floating-point safety net
}

export function textureKeyForLevel(level: number): string {
  return `cat-${level}`;
}

/** Flat dark silhouette of the same sprite — shown in the Collection Book for undiscovered cats. */
export function silhouetteTextureKeyForLevel(level: number): string {
  return `cat-${level}-silhouette`;
}

/** Soft radial-gradient texture generated once in BootScene, reused behind every Golden Cat. */
export const GOLDEN_GLOW_TEXTURE = 'golden-glow';

/**
 * Levels with a real recorded feline vocalization (a trimmed clip per species) — see
 * public/assets/audio/merge/. The newest Legendary+ tiers (Golden Lion, Celestial Cat) have no
 * real-world animal to record, so AudioSystem falls back to its synthesized tone for those.
 */
const MERGE_SOUND_LEVELS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

export function hasMergeSound(level: number): boolean {
  return MERGE_SOUND_LEVELS.has(level);
}

export function mergeSoundKey(level: number): string {
  return `merge-cat-${level}`;
}
