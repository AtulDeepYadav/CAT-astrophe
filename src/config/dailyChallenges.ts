/**
 * One seeded modifier per calendar day (device-local date, not UTC — "today's challenge" should
 * match what the clock on the player's own phone says) so every player sees the same challenge on
 * the same day without needing a server. The seed is just the date string itself, hashed — no
 * randomness, no network call, and it's stable if the player closes and reopens the app.
 */
export interface DailyModifier {
  id: string;
  name: string;
  description: string;
  /** Overrides the normal [1,2,3,4] spawn pool entirely (equal odds across whatever's listed) —
   * undefined means the normal weighted Kitten-heavy pool. */
  spawnLevels?: number[];
  /** Multiplies the normal ~1-in-20 chance of a dropped cat being Golden. */
  goldenChanceMultiplier?: number;
  /** Multiplies how much progress each merge adds to the Purr Meter. */
  purrGainMultiplier?: number;
  /** Shifts the danger line down (in pixels) — a stricter, shorter fuse. Positive = harder. */
  dangerLineShiftPx?: number;
}

export const DAILY_MODIFIERS: DailyModifier[] = [
  {
    id: 'kittens_only',
    name: 'Kittens Only',
    description: 'Only Kittens and Tabbies drop today — build up the slow, hard way.',
    spawnLevels: [1, 2],
  },
  {
    id: 'golden_rush',
    name: 'Golden Rush',
    description: 'Golden Cats are far more common today — chain those level-skips.',
    goldenChanceMultiplier: 5,
  },
  {
    id: 'double_danger',
    name: 'Double Danger',
    description: 'The danger line sits lower today. No room to stack and stall.',
    dangerLineShiftPx: 80,
  },
  {
    id: 'purr_party',
    name: 'Purr Party',
    description: 'The Purr Meter fills twice as fast — Yarn Balls all day.',
    purrGainMultiplier: 2,
  },
  {
    id: 'big_start',
    name: 'Big Start',
    description: 'No plain Kittens today — every drop is a Fluffy Cat or bigger.',
    spawnLevels: [2, 3, 4],
  },
];

/** Device-local calendar date as YYYY-MM-DD — deliberately not toISOString(), which is UTC and
 * would flip to "tomorrow" partway through the evening for anyone west of Greenwich. */
export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A tiny stable string hash (djb2) — good enough to pick a modifier index, not for anything
 * security-sensitive. */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function todaysModifier(date: Date = new Date()): DailyModifier {
  const index = hashString(todayKey(date)) % DAILY_MODIFIERS.length;
  return DAILY_MODIFIERS[index];
}
