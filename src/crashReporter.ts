/**
 * Crash visibility once this is live on real, varied Android hardware - the audit's own
 * High-tier finding: "no way to find out it's crashing... without this."
 *
 * What this actually does today: catches every uncaught error and unhandled promise rejection
 * and keeps the last 20 in localStorage, so there's at least something to look at (via devtools
 * or by asking a tester to export it) instead of nothing. It does NOT send anything anywhere -
 * doing that for real means signing up for a service (Sentry's free tier or Firebase
 * Crashlytics are the two the audit suggested) and getting a project DSN/config, which is an
 * account only the project owner can create. reportError() below is the one place that
 * integration plugs in later - swap its body for `Sentry.captureException(error)` (or
 * equivalent) once that account exists; everything upstream of it (the two listeners, the
 * context captured) stays the same.
 */
const STORAGE_KEY = 'cat-kingdom:crash-log';
const MAX_ENTRIES = 20;

interface CrashEntry {
  message: string;
  stack?: string;
  timestamp: string;
  url: string;
}

function reportError(entry: CrashEntry) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: CrashEntry[] = raw ? JSON.parse(raw) : [];
    existing.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(-MAX_ENTRIES)));
  } catch {
    // localStorage can be unavailable (private browsing, etc.) — nothing to fall back to locally,
    // and there's no remote endpoint configured yet either (see file header).
  }
}

/** Call once at startup (see main.ts). Safe to call multiple times — replaces its own listeners. */
export function initCrashReporter() {
  window.addEventListener('error', (event) => {
    reportError({
      message: event.message,
      stack: event.error?.stack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportError({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    });
  });
}

/** Reads back whatever's been captured locally — e.g. for a support/debug view, or to ask a
 * tester to paste the output when reporting an issue. */
export function getCrashLog(): CrashEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
