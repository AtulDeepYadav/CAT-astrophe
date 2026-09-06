const LEADERBOARD_KEY = 'cat-kingdom:leaderboard';
const MAX_ENTRIES = 10;

export interface LeaderboardEntry {
  score: number;
  /** The cat name reached this run (e.g. "Tiger") — more tellable at a glance than a bare level number. */
  catName: string;
  /** Device-local date string (see dailyChallenges.todayKey) the run was played on. */
  date: string;
  mode: 'normal' | 'daily';
}

/**
 * Top-10 local runs, newest-tie-loses on a score tie (sorted purely by score, stable sort keeps
 * insertion order for ties). Separate from ScoreSystem's single "best" — this is the doc's
 * "local leaderboard" item, a short list of runs rather than one number. Zen Mode runs aren't
 * recorded: removing the danger-line pressure removes the thing that makes a high score mean
 * something, so it isn't a fair/comparable entry alongside a real run.
 */
export class LeaderboardSystem {
  private entries: LeaderboardEntry[];

  constructor() {
    this.entries = LeaderboardSystem.load();
  }

  getTop(): LeaderboardEntry[] {
    return [...this.entries];
  }

  /** Returns the 1-based rank the entry landed at, or null if it didn't crack the top 10. */
  submit(entry: LeaderboardEntry): number | null {
    const combined = [...this.entries, entry].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
    this.entries = combined;
    LeaderboardSystem.save(this.entries);
    const rank = combined.indexOf(entry);
    return rank === -1 ? null : rank + 1;
  }

  private static load(): LeaderboardEntry[] {
    try {
      const raw = localStorage.getItem(LEADERBOARD_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private static save(entries: LeaderboardEntry[]) {
    try {
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — the list just won't persist.
    }
  }
}
