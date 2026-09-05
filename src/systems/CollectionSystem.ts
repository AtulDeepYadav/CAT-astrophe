const STORAGE_KEY = 'cat-kingdom:discovered-levels';

/**
 * Tracks which cat levels the player has ever merged into, across all runs — persisted in
 * localStorage the same way ScoreSystem persists the best score. This is what the Collection
 * Book reveals silhouettes against, and what gates the one-time "New Cat!" / Lion cinematic.
 */
export class CollectionSystem {
  private discovered: Set<number>;

  constructor() {
    this.discovered = CollectionSystem.load();
  }

  isDiscovered(level: number): boolean {
    return this.discovered.has(level);
  }

  /** Records a level as discovered. Returns true only the first time it's ever seen. */
  discover(level: number): boolean {
    if (this.discovered.has(level)) {
      return false;
    }
    this.discovered.add(level);
    CollectionSystem.save(this.discovered);
    return true;
  }

  private static load(): Set<number> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return new Set();
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((n) => typeof n === 'number')) : new Set();
    } catch {
      return new Set();
    }
  }

  private static save(levels: Set<number>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...levels]));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — collection just won't persist.
    }
  }
}
