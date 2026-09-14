import { DEFAULT_THEME_ID } from '../config/catData';

const SELECTION_KEY = 'cat-kingdom:cosmetic-selection';
const PURCHASED_KEY = 'cat-kingdom:cosmetic-purchased';
const THEME_SELECTION_KEY = 'cat-kingdom:theme-selection';
const THEME_PURCHASED_KEY = 'cat-kingdom:theme-purchased';

export interface CosmeticOption {
  id: string;
  name: string;
  /** Golden-glow tint applied to Cat.ts in place of the default GOLDEN_TINT. */
  color: number;
  /** Big Cats (Cheetah/level 7 or higher) merged, lifetime, required to unlock this option for
   * free. 0 = always unlocked. */
  unlockBigCats: number;
  /** Fish price to unlock immediately instead of waiting for unlockBigCats — the first real
   * spending destination for Fish beyond the Game Over revive offer. */
  unlockFish: number;
}

/**
 * Golden-glow color variants, gated behind lifetime "Big Cats merged" (see
 * StatsSystem.bigCatsCreated) — that stat increments on every merge of a Cheetah or bigger, which
 * happens far more often than a Lion specifically used to, so these thresholds sit noticeably
 * higher than the old Lion-only crown count did. Each also has a Fish price for unlocking right
 * away instead of grinding toward the free threshold.
 */
export const COSMETIC_OPTIONS: CosmeticOption[] = [
  { id: 'gold', name: 'Classic Gold', color: 0xffd873, unlockBigCats: 0, unlockFish: 0 },
  { id: 'rose', name: 'Rose Quartz', color: 0xff8fb3, unlockBigCats: 2, unlockFish: 25 },
  { id: 'sapphire', name: 'Sapphire', color: 0x6ec6ff, unlockBigCats: 6, unlockFish: 60 },
  { id: 'emerald', name: 'Emerald', color: 0x7ce38b, unlockBigCats: 12, unlockFish: 120 },
  { id: 'amethyst', name: 'Amethyst', color: 0xc48bff, unlockBigCats: 20, unlockFish: 200 },
];

const DEFAULT_ID = COSMETIC_OPTIONS[0].id;

/** A full art-reskin (Robot/Pirate/8-bit, etc.) — a second, independent cosmetic axis alongside
 * the golden-glow color above: owning a color implies nothing about which theme is equipped, or
 * vice versa. See ThemeLoader's own doc comment for the loading side of this. */
export interface ThemeOption {
  id: string;
  name: string;
  /** A cheap swatch stand-in shown in the Style tab row (an emoji, not a texture) — lets the row
   * render before that theme's real art has been fetched, or for a theme with no thumbnail asset
   * of its own at all. */
  icon: string;
  /** Fish price to unlock. Unlike cosmetic colors, themes have no free lifetime-stat unlock path —
   * a pure Fish sink, at least until/unless that changes. */
  unlockFish: number;
}

// Empty until real theme art exists — a 'robot' placeholder briefly lived here to preview the
// Style tab's row layout, but selling a cosmetic that silently falls back to default art is
// exactly the "unfinished feature" Play Store review (Rule 2.1) rejects apps for, so it came back
// out ahead of submission. Add real entries the moment art exists; nothing else needs to change
// (see ThemeLoader's own doc comment for the loading side of this).
export const THEME_OPTIONS: ThemeOption[] = [];

/**
 * Which golden-glow color the player has selected, persisted like the rest of the meta systems.
 * Free unlock state is derived from the Big Cats count at read time rather than stored (that
 * count already lives in StatsSystem.bigCatsCreated) — but a Fish *purchase* is its own one-way
 * fact ("did the player ever buy this") that has to be remembered here, since nothing else
 * tracks it.
 */
export class CosmeticsSystem {
  private selectedId: string;
  private purchased: Set<string>;
  private selectedThemeId: string;
  private purchasedThemes: Set<string>;

  constructor() {
    this.selectedId = CosmeticsSystem.loadSelection();
    this.purchased = CosmeticsSystem.loadPurchased();
    this.selectedThemeId = CosmeticsSystem.loadThemeSelection();
    this.purchasedThemes = CosmeticsSystem.loadPurchasedThemes();
  }

  isUnlocked(id: string, bigCats: number): boolean {
    if (this.purchased.has(id)) {
      return true;
    }
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
    this.saveSelection();
    return true;
  }

  /** Marks a cosmetic as purchased (idempotent) — the caller (GameScene) is responsible for
   * actually spending the Fish via CurrencySystem first; this just remembers the outcome. */
  markPurchased(id: string) {
    if (this.purchased.has(id)) {
      return;
    }
    this.purchased.add(id);
    try {
      localStorage.setItem(PURCHASED_KEY, JSON.stringify([...this.purchased]));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — purchase just won't persist.
    }
  }

  private saveSelection() {
    try {
      localStorage.setItem(SELECTION_KEY, this.selectedId);
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — selection just won't persist.
    }
  }

  private static loadSelection(): string {
    try {
      const raw = localStorage.getItem(SELECTION_KEY);
      if (raw && COSMETIC_OPTIONS.some((o) => o.id === raw)) {
        return raw;
      }
      return DEFAULT_ID;
    } catch {
      return DEFAULT_ID;
    }
  }

  private static loadPurchased(): Set<string> {
    try {
      const raw = localStorage.getItem(PURCHASED_KEY);
      if (!raw) {
        return new Set();
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set();
    } catch {
      return new Set();
    }
  }

  // --- Theme axis (see ThemeOption's own doc comment) — same shape as the color methods above,
  // just against THEME_OPTIONS/the theme-* localStorage keys instead. ---

  /** DEFAULT_THEME_ID is always unlocked — every player starts here, and it's the one theme that
   * never needs ThemeLoader to fetch anything (BootScene's own preload already covers it). */
  isThemeUnlocked(id: string): boolean {
    return id === DEFAULT_THEME_ID || this.purchasedThemes.has(id);
  }

  getSelectedThemeId(): string {
    return this.selectedThemeId;
  }

  /** Selects a theme if unlocked. Returns true if the selection changed. Doesn't load anything —
   * callers that need the art actually present (GameScene) should await ThemeLoader.loadTheme
   * first; this just persists the choice. */
  selectTheme(id: string): boolean {
    if (id === this.selectedThemeId || !this.isThemeUnlocked(id)) {
      return false;
    }
    this.selectedThemeId = id;
    this.saveThemeSelection();
    return true;
  }

  /** Marks a theme as purchased (idempotent) — same contract as markPurchased: the caller has
   * already spent the Fish via CurrencySystem, this just remembers the outcome. */
  markThemePurchased(id: string) {
    if (this.purchasedThemes.has(id)) {
      return;
    }
    this.purchasedThemes.add(id);
    try {
      localStorage.setItem(THEME_PURCHASED_KEY, JSON.stringify([...this.purchasedThemes]));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — purchase just won't persist.
    }
  }

  private saveThemeSelection() {
    try {
      localStorage.setItem(THEME_SELECTION_KEY, this.selectedThemeId);
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — selection just won't persist.
    }
  }

  private static loadThemeSelection(): string {
    try {
      const raw = localStorage.getItem(THEME_SELECTION_KEY);
      if (raw && (raw === DEFAULT_THEME_ID || THEME_OPTIONS.some((o) => o.id === raw))) {
        return raw;
      }
      return DEFAULT_THEME_ID;
    } catch {
      return DEFAULT_THEME_ID;
    }
  }

  private static loadPurchasedThemes(): Set<string> {
    try {
      const raw = localStorage.getItem(THEME_PURCHASED_KEY);
      if (!raw) {
        return new Set();
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set();
    } catch {
      return new Set();
    }
  }
}
