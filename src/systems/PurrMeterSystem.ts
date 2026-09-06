const METER_MAX = 100;
/** Exported so callers (Daily Challenge's Purr Party modifier) can scale it rather than
 * hardcoding a second copy of the base value. */
export const GAIN_PER_MERGE = 14;
/** How long after the last gain (at any fill level, not just full) before the meter starts draining. */
const DECAY_DELAY_MS = 1000;
/** Drain rate once decay kicks in — a full meter empties out over this many ms. */
const DECAY_DURATION_MS = 7000;
const DECAY_PER_MS = METER_MAX / DECAY_DURATION_MS;

/**
 * Fills as the player merges cats; once full, `consume()` grants one use of a power-up (Yarn
 * Ball) and empties back to zero. Doesn't fill further once full/ready — the player has to spend
 * a full meter before it starts charging again.
 *
 * Any progress — partial or full — drains back toward zero if nothing merges for
 * DECAY_DELAY_MS: this isn't a resource you can bank indefinitely, it rewards staying actively in
 * the merge chain.
 */
export class PurrMeterSystem {
  private value = 0;
  private msSinceLastGain = Number.POSITIVE_INFINITY;

  addProgress(amount: number = GAIN_PER_MERGE) {
    if (this.isReady) {
      return;
    }
    this.value = Math.min(METER_MAX, this.value + amount);
    this.msSinceLastGain = 0;
  }

  /** Call once per frame — drains the meter smoothly once DECAY_DELAY_MS has passed since the last gain. */
  update(deltaMs: number) {
    if (this.value <= 0) {
      return;
    }
    this.msSinceLastGain += deltaMs;
    if (this.msSinceLastGain >= DECAY_DELAY_MS) {
      this.value = Math.max(0, this.value - DECAY_PER_MS * deltaMs);
    }
  }

  get percent(): number {
    return this.value / METER_MAX;
  }

  get isReady(): boolean {
    return this.value >= METER_MAX;
  }

  /** Spends the full meter. Returns false (no-op) if it wasn't ready yet. */
  consume(): boolean {
    if (!this.isReady) {
      return false;
    }
    this.value = 0;
    this.msSinceLastGain = Number.POSITIVE_INFINITY;
    return true;
  }
}
