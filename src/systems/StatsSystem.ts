const STORAGE_KEY = 'cat-kingdom:lifetime-stats';

export interface LifetimeStats {
  totalCatsMerged: number;
  biggestCombo: number;
  lionsCreated: number;
  gamesPlayed: number;
}

const DEFAULT_STATS: LifetimeStats = {
  totalCatsMerged: 0,
  biggestCombo: 0,
  lionsCreated: 0,
  gamesPlayed: 0,
};

/**
 * Lifetime stats across every run, persisted in localStorage like Best Score and the Collection.
 * Best score itself stays in ScoreSystem (no reason to duplicate it) — this covers the rest of
 * the doc's "people weirdly love stats" list.
 */
export class StatsSystem {
  private stats: LifetimeStats;

  constructor() {
    this.stats = StatsSystem.load();
  }

  get(): LifetimeStats {
    return { ...this.stats };
  }

  recordGameStarted() {
    this.stats.gamesPlayed += 1;
    this.save();
  }

  recordMerge() {
    this.stats.totalCatsMerged += 1;
    this.save();
  }

  /** Returns true if this combo count set a new lifetime best. */
  recordCombo(combo: number): boolean {
    if (combo > this.stats.biggestCombo) {
      this.stats.biggestCombo = combo;
      this.save();
      return true;
    }
    return false;
  }

  recordLion() {
    this.stats.lionsCreated += 1;
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stats));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — stats just won't persist.
    }
  }

  private static load(): LifetimeStats {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_STATS };
      }
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATS, ...parsed };
    } catch {
      return { ...DEFAULT_STATS };
    }
  }
}
