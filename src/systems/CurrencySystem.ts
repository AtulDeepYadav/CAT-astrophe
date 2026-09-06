const BALANCE_KEY = 'cat-kingdom:fish';

/**
 * A simple earn-and-spend currency ("Fish") — the game had no persistent, spendable resource
 * anywhere before this (the lifetime bigCatsCreated stat gates cosmetic unlocks, but a player
 * never chooses how to spend it). Fish is earned once per run at Game Over based on that run's
 * score, and is the one thing the in-run revive offer costs — deliberately just that one sink for
 * now rather than a shop, so the economy exists and is provably real before building more on top
 * of it.
 */
export class CurrencySystem {
  public balance: number;

  constructor() {
    this.balance = CurrencySystem.load();
  }

  add(amount: number) {
    if (amount <= 0) {
      return;
    }
    this.balance += amount;
    this.save();
  }

  /** Returns false (no-op) if the balance can't cover it — never lets balance go negative. */
  spend(amount: number): boolean {
    if (amount <= 0 || this.balance < amount) {
      return false;
    }
    this.balance -= amount;
    this.save();
    return true;
  }

  private save() {
    try {
      localStorage.setItem(BALANCE_KEY, String(this.balance));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — balance just won't persist.
    }
  }

  private static load(): number {
    try {
      const raw = localStorage.getItem(BALANCE_KEY);
      const value = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  }
}

/** How much a run's score converts to in earned Fish — one place both GameScene and any future
 * preview UI can read the same formula from. */
export function fishEarnedForScore(score: number): number {
  return score > 0 ? Math.floor(score / 25) : 0;
}
