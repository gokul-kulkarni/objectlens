import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { plainTextOutput } from './src/bundling/plainTextOutput';

/*
 * Builds the custom editor into `dist/`, which is committed: Orca installs a plugin by copying
 * the files of a tagged commit, and the manifest at the repository root (`orca-plugin.json`)
 * names `apps/orca-plugin/dist/editor.html` as the entry. Rebuild and commit `dist/` with any
 * change to the UI — CI fails when the committed build no longer matches its source.
 *
 * Orca frames have no network and no bundler, so everything ships in the folder with relative
 * paths. No sourcemaps: they would double the plugin's size for a frame nobody debugs from source.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), plainTextOutput()],
  // The parse worker is a separate bundle with its own plugin list.
  worker: { format: 'es', plugins: () => [plainTextOutput()] },
  base: './',
  publicDir: false,
  // Escape every non-ASCII character in the output; `escapeControlCharacters` below does the
  // same for control characters, which esbuild writes as-is.
  esbuild: { charset: 'ascii' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: 'editor.html',
    },
  },
});
