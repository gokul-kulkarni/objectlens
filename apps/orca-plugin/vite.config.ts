import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/*
 * Builds the loadable Orca plugin into `dist/`: `orca-plugin.json` and the icon come from
 * `public/`, and `editor.html` is the custom editor's entry.
 *
 * Orca frames have no network and no bundler, so everything ships in the folder with relative
 * paths. No sourcemaps: they would double the plugin's size for a frame nobody debugs from source.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: 'editor.html',
    },
  },
});
