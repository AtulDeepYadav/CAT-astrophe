/**
 * A real cloud save (Play Games Services, a backend account) needs the native wrapping this
 * project hasn't done yet — see the store-readiness audit. Until then, this is the honest
 * stopgap: a portable text code the player copies out and can paste back in on a new device or
 * after clearing site data, covering every `cat-kingdom:*` key (best score, collection,
 * achievements, cosmetics, stats, settings, leaderboard, daily-challenge state) in one blob.
 */
const KEY_PREFIX = 'cat-kingdom:';

function collectSaveKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

/** Returns a compact backup code, or null if there's nothing to back up or localStorage is unavailable. */
export function exportSaveData(): string | null {
  try {
    const keys = collectSaveKeys();
    if (keys.length === 0) {
      return null;
    }
    const data: Record<string, string> = {};
    for (const key of keys) {
      data[key] = localStorage.getItem(key) ?? '';
    }
    return btoa(encodeURIComponent(JSON.stringify(data)));
  } catch {
    return null;
  }
}

/** Writes every key from a backup code back into localStorage. Returns false (no-op, nothing
 * written) for a malformed code rather than partially applying it. */
export function importSaveData(code: string): boolean {
  try {
    const data = JSON.parse(decodeURIComponent(atob(code.trim()))) as Record<string, unknown>;
    const entries = Object.entries(data);
    const isValid =
      entries.length > 0 && entries.every(([key, value]) => key.startsWith(KEY_PREFIX) && typeof value === 'string');
    if (!isValid) {
      return false;
    }
    for (const [key, value] of entries) {
      localStorage.setItem(key, value as string);
    }
    return true;
  } catch {
    return false;
  }
}
