import { todayKey } from '../config/dailyChallenges';

const STORAGE_KEY = 'cat-kingdom:daily-challenge';

interface DailyRecord {
  date: string;
  played: boolean;
  bestScore: number;
}

/**
 * Tracks whether today's seeded challenge has been played and the best score on it so far.
 * One "today" record is kept, not a history — a new date rolling in just replaces it, the same
 * way the challenge itself resets at midnight regardless of what happened yesterday.
 */
export class DailyChallengeSystem {
  private record: DailyRecord;

  constructor() {
    this.record = DailyChallengeSystem.load();
  }

  get playedToday(): boolean {
    return this.record.played;
  }

  get bestScoreToday(): number {
    return this.record.bestScore;
  }

  /** Call once a daily-challenge run ends. Returns true if this run beat today's previous best. */
  recordResult(score: number): boolean {
    const isNewBest = score > this.record.bestScore;
    this.record = {
      date: todayKey(),
      played: true,
      bestScore: Math.max(score, this.record.bestScore),
    };
    DailyChallengeSystem.save(this.record);
    return isNewBest;
  }

  private static load(): DailyRecord {
    const today = todayKey();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DailyRecord;
        if (parsed.date === today) {
          return parsed;
        }
      }
    } catch {
      // Fall through to a fresh record below.
    }
    return { date: today, played: false, bestScore: 0 };
  }

  private static save(record: DailyRecord) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — today's state just won't persist.
    }
  }
}
