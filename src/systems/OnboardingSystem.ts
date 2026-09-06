const STORAGE_KEY = 'cat-kingdom:onboarding-seen';

/** Tracks whether the first-launch tips card has ever been dismissed — shown once, ever, across
 * every mode, since the mechanics it explains (drop, merge, danger line, Purr Meter) are
 * universal rather than specific to Normal/Daily/Zen. */
export class OnboardingSystem {
  private seen: boolean;

  constructor() {
    this.seen = OnboardingSystem.load();
  }

  get hasSeenIntro(): boolean {
    return this.seen;
  }

  markSeen() {
    this.seen = true;
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — it'll just show again next launch.
    }
  }

  private static load(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
