const STORAGE_KEY = 'cat-kingdom:achievements';

export interface AchievementData {
  id: string;
  icon: string;
  name: string;
  description: string;
}

/** Fixed list of milestone achievements — unlocked once, permanently, via `unlock(id)` below. */
export const ACHIEVEMENTS: AchievementData[] = [
  { id: 'first_merge', icon: '🐾', name: 'First Merge', description: 'Merge your first two cats.' },
  { id: 'first_golden', icon: '✨', name: 'Golden Touch', description: 'Merge a Golden Cat.' },
  { id: 'combo_5', icon: '🔥', name: 'Combo Master', description: 'Reach a x5 combo chain.' },
  { id: 'first_lion', icon: '👑', name: 'The King', description: 'Create your first Lion.' },
  { id: 'clutch_save', icon: '💚', name: 'Nine Lives', description: 'Survive a Clutch Save.' },
  { id: 'reach_savannah', icon: '🌅', name: 'World Traveler', description: 'Reach the Savannah.' },
  { id: 'merged_100', icon: '💯', name: 'Century Club', description: 'Merge 100 cats, lifetime.' },
  { id: 'first_celestial', icon: '✨', name: 'Beyond the Stars', description: 'Create the Celestial Cat.' },
];

/**
 * Tracks which achievements have ever been unlocked, persisted in localStorage the same way as
 * the Collection Book. Each id is permanent once earned — this never re-locks anything.
 */
export class AchievementSystem {
  private unlocked: Set<string>;

  constructor() {
    this.unlocked = AchievementSystem.load();
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  /** Returns true only the first time this achievement is earned. */
  unlock(id: string): boolean {
    if (this.unlocked.has(id)) {
      return false;
    }
    this.unlocked.add(id);
    AchievementSystem.save(this.unlocked);
    return true;
  }

  get unlockedCount(): number {
    return this.unlocked.size;
  }

  private static load(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return new Set();
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === 'string')) : new Set();
    } catch {
      return new Set();
    }
  }

  private static save(ids: Set<string>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — achievements just won't persist.
    }
  }
}
