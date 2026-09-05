const STORAGE_KEY = 'cat-kingdom:cosmetic-selection';

export interface CosmeticOption {
  id: string;
  name: string;
  /** Golden-glow tint applied to Cat.ts in place of the default GOLDEN_TINT. */
  color: number;
  /** Crowns (Lions created, lifetime) required to unlock this option. 0 = always unlocked. */
  unlockCrowns: number;
}

/** Golden-glow color variants, gated behind lifetime Crown count (see StatsSystem.lionsCreated). */
export const COSMETIC_OPTIONS: CosmeticOption[] = [
  { id: 'gold', name: 'Classic Gold', color: 0xffd873, unlockCrowns: 0 },
  { id: 'rose', name: 'Rose Quartz', color: 0xff8fb3, unlockCrowns: 1 },
  { id: 'sapphire', name: 'Sapphire', color: 0x6ec6ff, unlockCrowns: 3 },
  { id: 'emerald', name: 'Emerald', color: 0x7ce38b, unlockCrowns: 5 },
  { id: 'amethyst', name: 'Amethyst', color: 0xc48bff, unlockCrowns: 8 },
];

const DEFAULT_ID = COSMETIC_OPTIONS[0].id;

/**
 * Which golden-glow color the player has selected, persisted like the rest of the meta systems.
 * Unlock state is derived from crown count at read time rather than stored — the crown count
 * itself already lives in StatsSystem.lionsCreated, so there's nothing to duplicate here.
 */
export class CosmeticsSystem {
  private selectedId: string;

  constructor() {
    this.selectedId = CosmeticsSystem.load();
  }

  isUnlocked(id: string, crowns: number): boolean {
    const option = COSMETIC_OPTIONS.find((o) => o.id === id);
    return option ? crowns >= option.unlockCrowns : false;
  }

  getSelectedId(): string {
    return this.selectedId;
  }

  getSelectedColor(): number {
    return COSMETIC_OPTIONS.find((o) => o.id === this.selectedId)?.color ?? COSMETIC_OPTIONS[0].color;
  }

  /** Selects a color if unlocked. Returns true if the selection changed. */
  select(id: string, crowns: number): boolean {
    if (id === this.selectedId || !this.isUnlocked(id, crowns)) {
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
