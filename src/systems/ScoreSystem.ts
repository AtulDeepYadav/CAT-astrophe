const BEST_SCORE_KEY = 'cat-kingdom:best-score';

/**
 * Tracks the current run's score and the persisted best score.
 * localStorage is per-device/per-browser only — fine for a local "best" until
 * a real backend/leaderboard shows up in V4.
 */
export class ScoreSystem {
  public score = 0;
  public best: number;

  constructor() {
    this.best = ScoreSystem.loadBest();
  }

  add(points: number) {
    this.score += points;
    if (this.score > this.best) {
      this.best = this.score;
      ScoreSystem.saveBest(this.best);
    }
  }

  reset() {
    this.score = 0;
  }

  private static loadBest(): number {
    try {
      const raw = localStorage.getItem(BEST_SCORE_KEY);
      const value = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  private static saveBest(value: number) {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(value));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — best just won't persist.
    }
  }
}
