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

export function backgroundTextureKeyForZone(key: WorldZoneKey): string {
  return `bg-${key}`;
}
