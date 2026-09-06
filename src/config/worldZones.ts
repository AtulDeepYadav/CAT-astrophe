/**
 * The world the player is "in" evolves with the biggest cat they've reached this run
 * (monotonic — it never regresses just because that cat later got merged away), per
 * the plan's Home -> Backyard -> Forest -> Jungle -> Savannah progression.
 */
export type WorldZoneKey = 'home' | 'backyard' | 'forest' | 'jungle' | 'savannah';

export interface WorldZoneData {
  key: WorldZoneKey;
  name: string;
  /** Lowest cat level that puts the player in this zone. */
  minLevel: number;
}

export const WORLD_ZONES: WorldZoneData[] = [
  { key: 'home', name: 'Cosy Home', minLevel: 1 },
  { key: 'backyard', name: 'Backyard', minLevel: 5 },
  { key: 'forest', name: 'Forest', minLevel: 7 },
  { key: 'jungle', name: 'Jungle', minLevel: 9 },
  { key: 'savannah', name: 'Savannah', minLevel: 10 },
];

/** WORLD_ZONES is ascending by minLevel, so the last match at or below `level` wins. */
export function zoneForLevel(level: number): WorldZoneData {
  let current = WORLD_ZONES[0];
  for (const zone of WORLD_ZONES) {
    if (level >= zone.minLevel) {
      current = zone;
    }
  }
  return current;
}

/** Each zone backdrop is a 4-frame seamless loop (subtle idle motion — leaves sway, water flows,
 * clouds drift) rather than one static image. Frames are 1-indexed to match how the source art
 * itself labels them ("Frame 1 (0.0s)" .. "Frame 4 (3.0s)"). */
export const BG_FRAME_COUNT = 4;

export function backgroundFrameTextureKey(key: WorldZoneKey, frame: number): string {
  return `bg-${key}-f${frame}`;
}
