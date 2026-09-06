const STORAGE_KEY = 'cat-kingdom:cosmetic-selection';

export interface CosmeticOption {
  id: string;
  name: string;
  /** Golden-glow tint applied to Cat.ts in place of the default GOLDEN_TINT. */
  color: number;
  /** Big Cats (Cheetah/level 7 or higher) merged, lifetime, required to unlock this option. 0 = always unlocked. */
  unlockBigCats: number;
}

/**
 * Golden-glow color variants, gated behind lifetime "Big Cats merged" (see
 * StatsSystem.bigCatsCreated) — that stat increments on every merge of a Cheetah or bigger, which
 * happens far more often than a Lion specifically used to, so these thresholds sit noticeably
 * higher than the old Lion-only crown count did.
 */
export const COSMETIC_OPTIONS: CosmeticOption[] = [
  { id: 'gold', name: 'Classic Gold', color: 0xffd873, unlockBigCats: 0 },
  { id: 'rose', name: 'Rose Quartz', color: 0xff8fb3, unlockBigCats: 2 },
  { id: 'sapphire', name: 'Sapphire', color: 0x6ec6ff, unlockBigCats: 6 },
  { id: 'emerald', name: 'Emerald', color: 0x7ce38b, unlockBigCats: 12 },
  { id: 'amethyst', name: 'Amethyst', color: 0xc48bff, unlockBigCats: 20 },
];

const DEFAULT_ID = COSMETIC_OPTIONS[0].id;

/**
 * Which golden-glow color the player has selected, persisted like the rest of the meta systems.
 * Unlock state is derived from the Big Cats count at read time rather than stored — that count
 * itself already lives in StatsSystem.bigCatsCreated, so there's nothing to duplicate here.
 */
export class CosmeticsSystem {
  private selectedId: string;

  constructor() {
    this.selectedId = CosmeticsSystem.load();
  }

  isUnlocked(id: string, bigCats: number): boolean {
    const option = COSMETIC_OPTIONS.find((o) => o.id === id);
    return option ? bigCats >= option.unlockBigCats : false;
  }

  getSelectedId(): string {
    return this.selectedId;
  }

  getSelectedColor(): number {
    return COSMETIC_OPTIONS.find((o) => o.id === this.selectedId)?.color ?? COSMETIC_OPTIONS[0].color;
  }

  /** Selects a color if unlocked. Returns true if the selection changed. */
  select(id: string, bigCats: number): boolean {
    if (id === this.selectedId || !this.isUnlocked(id, bigCats)) {
      return false;
    }
    this.selectedId = id;
    this.save();
    return true;
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, this.selectedId);
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — selection just won't persist.
    }
  }

  private static load(): string {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && COSMETIC_OPTIONS.some((o) => o.id === raw)) {
        return raw;
      }
      return DEFAULT_ID;
    } catch {
      return DEFAULT_ID;
    }
  }
}
