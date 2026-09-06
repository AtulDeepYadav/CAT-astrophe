import type { CapacitorConfig } from '@capacitor/cli';

/**
 * appId matches the package_name already committed to in ANDROID_PACKAGING.md's
 * assetlinks.json example — this is permanent after first Play Store publish, so it's set once,
 * here, rather than left to whatever a future `cap init` prompt defaults to.
 */
const config: CapacitorConfig = {
  appId: 'com.catastrophe.game',
  appName: 'Cat-astrophe',
  webDir: 'dist',
  backgroundColor: '#2b2018',
  android: {
    // Matches manifest.json's orientation lock — the game's layout is portrait-only.
    // (Capacitor reads this from AndroidManifest.xml at build time; see android/README.md.)
  },
};

export default config;
