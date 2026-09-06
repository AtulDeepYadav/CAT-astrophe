const STORAGE_KEY = 'cat-kingdom:settings';

interface Settings {
  muted: boolean;
}

const DEFAULT_SETTINGS: Settings = { muted: false };

/** Player-facing preferences — currently just sound on/off, but the one place any future
 * settings (haptics on/off, etc.) would live rather than each getting their own ad-hoc key. */
export class SettingsSystem {
  private settings: Settings;

  constructor() {
    this.settings = SettingsSystem.load();
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  setMuted(muted: boolean) {
    this.settings = { ...this.settings, muted };
    SettingsSystem.save(this.settings);
  }

  private static load(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_SETTINGS };
      }
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private static save(settings: Settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage can be unavailable (private browsing, etc.) — the setting just won't persist.
    }
  }
}
