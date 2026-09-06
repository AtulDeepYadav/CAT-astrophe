import { todayKey } from '../config/dailyChallenges';

const STORAGE_KEY = 'cat-kingdom:streak';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Fish bonus per streak day, capped at a week — an unbounded reward would make a month-long
 * streak worth an ever-growing pile of Fish for doing nothing that day beyond opening the app. */
const MAX_BONUS_DAYS = 7;
const FISH_PER_DAY = 5;

interface StreakData {
  /** Device-local YYYY-MM-DD (see todayKey) of the last day a check-in was recorded. */
  lastPlayedDate: string;
  currentStreak: number;
  bestStreak: number;
}

export interface StreakCheckInResult {
  streak: number;
  /** False if today was already checked in (e.g. a second Menu visit the same day) — the caller
   * should only award the Fish bonus / show the banner when this is true. */
  isNewDay: boolean;
  fishBonus: number;
}

/**
 * Rewards showing up on *consecutive* days, not just the existing single-daily-modifier run —
 * the game had no login-streak mechanic at all before this, despite it being one of the cheapest,
 * most standard retention hooks in the genre. A missed day doesn't just fail to add to the streak,
 * it resets it to 1 — that loss-aversion is most of what makes a streak worth keeping.
 */
export class StreakSystem {
  private data: StreakData;

  constructor() {
    this.data = StreakSystem.load();
  }

  get currentStreak(): number {
    return this.data.currentStreak;
  }

  get bestStreak(): number {
    return this.data.bestStreak;
  }

  /** Call once per app/Menu load. Advances the streak at most once per calendar day — safe to
   * call on every Menu visit, since a same-day repeat just returns isNewDay: false. */
  checkIn(now: Date = new Date()): StreakCheckInResult {
    const today = todayKey(now);
    if (this.data.lastPlayedDate === today) {
      return { streak: this.data.currentStreak, isNewDay: false, fishBonus: 0 };
    }

    const yesterday = todayKey(new Date(now.getTime() - DAY_MS));
    const continued = this.data.lastPlayedDate === yesterday;
    this.data.currentStreak = continued ? this.data.currentStreak + 1 : 1;
    this.data.bestStreak = Math.max(this.data.bestStreak, this.data.currentStreak);
    this.data.lastPlayedDate = today;
    this.save();

    const fishBonus = Math.min(this.data.currentStreak, MAX_BONUS_DAYS) * FISH_PER_DAY;
    return { streak: this.data.currentStreak, isNewDay: true, fishBonus };
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — streak just won't persist.
    }
  }

  private static load(): StreakData {
    const empty: StreakData = { lastPlayedDate: '', currentStreak: 0, bestStreak: 0 };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return empty;
      }
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.lastPlayedDate === 'string' &&
        typeof parsed.currentStreak === 'number' &&
        typeof parsed.bestStreak === 'number'
      ) {
        return parsed as StreakData;
      }
      return empty;
    } catch {
      return empty;
    }
  }
}
