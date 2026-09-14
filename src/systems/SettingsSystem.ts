const STORAGE_KEY = 'cat-kingdom:settings';

interface Settings {
  musicMuted: boolean;
  sfxMuted: boolean;
  hapticsEnabled: boolean;
}

const DEFAULT_SETTINGS: Settings = { musicMuted: false, sfxMuted: false, hapticsEnabled: true };

/** Player-facing preferences — the one place any settings (Music/SFX/Haptics, and whatever's
 * added later) live rather than each getting their own ad-hoc key. */
export class SettingsSystem {
  private settings: Settings;

  constructor() {
    this.settings = SettingsSystem.load();
  }

  get musicMuted(): boolean {
    return this.settings.musicMuted;
  }

  get sfxMuted(): boolean {
    return this.settings.sfxMuted;
  }

  get hapticsEnabled(): boolean {
    return this.settings.hapticsEnabled;
  }

  setMusicMuted(musicMuted: boolean) {
    this.settings = { ...this.settings, musicMuted };
    SettingsSystem.save(this.settings);
  }

  setSfxMuted(sfxMuted: boolean) {
    this.settings = { ...this.settings, sfxMuted };
    SettingsSystem.save(this.settings);
  }

  setHapticsEnabled(hapticsEnabled: boolean) {
    this.settings = { ...this.settings, hapticsEnabled };
    SettingsSystem.save(this.settings);
  }

  private static load(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_SETTINGS };
      }
      const parsed = JSON.parse(raw);
      // Migrate a pre-split save (one combined `muted` flag) onto both new fields, rather than
      // silently resetting a tester's sound preference back to "on" the first time this runs.
      if (typeof parsed.muted === 'boolean' && parsed.musicMuted === undefined && parsed.sfxMuted === undefined) {
        return { ...DEFAULT_SETTINGS, musicMuted: parsed.muted, sfxMuted: parsed.muted };
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
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
