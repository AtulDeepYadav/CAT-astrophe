/** How long a merge stays "chained" to the previous one before the combo resets. */
const COMBO_WINDOW_MS = 1200;
/** Multiplier growth per combo step (1x, 2x, 4x, 8x...), capped so score doesn't blow up. */
const MAX_MULTIPLIER = 16;

/**
 * Tracks merge chains: merges that land within COMBO_WINDOW_MS of the previous one keep
 * escalating the multiplier: doc's "NICE! / COMBO! / SUPER COMBO!" ladder. A single merge
 * with nothing chained after it is combo x1 (no bonus, no popup).
 */
export class ComboSystem {
  private comboCount = 0;
  private msSinceLastMerge = Number.POSITIVE_INFINITY;

  /** Call once per merge. Returns the multiplier to apply to that merge's points. */
  registerMerge(): { combo: number; multiplier: number } {
    this.comboCount = this.msSinceLastMerge <= COMBO_WINDOW_MS ? this.comboCount + 1 : 1;
    this.msSinceLastMerge = 0;

    const multiplier = Math.min(2 ** (this.comboCount - 1), MAX_MULTIPLIER);
    return { combo: this.comboCount, multiplier };
  }

  /** Call once per frame so a combo chain expires if nothing merges for a while. */
  update(deltaMs: number) {
    this.msSinceLastMerge += deltaMs;
    if (this.msSinceLastMerge > COMBO_WINDOW_MS) {
      this.comboCount = 0;
    }
  }
}
