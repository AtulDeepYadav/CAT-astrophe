const METER_MAX = 100;
const GAIN_PER_MERGE = 14;
/** A full, unspent meter drains back to zero after sitting idle this long — use the Yarn Ball or lose the charge. */
const READY_DECAY_MS = 10000;

/**
 * Fills as the player merges cats; once full, `consume()` grants one use of a power-up
 * (Yarn Ball in V2) and empties back to zero. Doesn't fill further once full/ready — the
 * player has to spend a full meter before it starts charging again. Left unspent too long,
 * it drains back to zero on its own instead of sitting there as free insurance forever.
 */
export class PurrMeterSystem {
  private value = 0;
  private ready = false;
  private readyElapsedMs = 0;

  addProgress(amount: number = GAIN_PER_MERGE) {
    if (this.ready) {
      return;
    }
    this.value = Math.min(METER_MAX, this.value + amount);
    if (this.value >= METER_MAX) {
      this.ready = true;
      this.readyElapsedMs = 0;
    }
  }

  /** Call once per frame. Only does anything while a full meter is waiting to be spent. */
  update(deltaMs: number) {
    if (!this.ready) {
      return;
    }
    this.readyElapsedMs += deltaMs;
    if (this.readyElapsedMs >= READY_DECAY_MS) {
      this.value = 0;
      this.ready = false;
      this.readyElapsedMs = 0;
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
    this.readyElapsedMs = 0;
    return true;
  }
}
