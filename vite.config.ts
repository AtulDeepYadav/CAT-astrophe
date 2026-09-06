import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Phaser itself is ~1.3MB of the ~1.4MB total bundle and changes far less often than the
    // game's own code does — splitting it into its own chunk means a future deploy that only
    // touches gameplay code doesn't force every returning player to re-download the engine too;
    // their browser can keep serving the Phaser chunk straight from cache.
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) {
            return 'phaser';
          }
        },
      },
    },
  },
});
