const METER_MAX = 100;
const GAIN_PER_MERGE = 14;

/**
 * Fills as the player merges cats; once full, `consume()` grants one use of a power-up
 * (Yarn Ball in V2) and empties back to zero. Doesn't fill further once full/ready — the
 * player has to spend a full meter before it starts charging again.
 */
export class PurrMeterSystem {
  private value = 0;
  private ready = false;

  addProgress(amount: number = GAIN_PER_MERGE) {
    if (this.ready) {
      return;
    }
    this.value = Math.min(METER_MAX, this.value + amount);
    if (this.value >= METER_MAX) {
      this.ready = true;
    }
  }

  get percent(): number {
    return this.value / METER_MAX;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Spends the full meter. Returns false (no-op) if it wasn't ready yet. */
  consume(): boolean {
    if (!this.ready) {
      return false;
    }
    this.value = 0;
    this.ready = false;
    return true;
  }
}
