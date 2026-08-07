import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Static output: the public site has no backend, and the local Python package serves this
  // same bundle from 127.0.0.1. Relative base keeps both working.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        /*
         * Third-party code is split out because it changes on a different clock from ours: the
         * canvas and the YAML grammar are ~150 kB that a returning visitor should keep from cache
         * across every deploy where only our own code moved.
         *
         * It is deliberately not lazy. The format picker calls every adapter's `sniff` on the
         * first keystroke and the view switcher needs the canvas as soon as a graph exists, so
         * deferring either would trade a smaller first chunk for a stall at the first interaction.
         */
        // Matched by module path rather than by package name: neither is a direct dependency of
        // this package — they arrive through the view and adapter packages — so naming them as
        // entry points fails to resolve.
        manualChunks(id: string) {
          if (id.includes('/node_modules/@xyflow/')) return 'canvas';
          if (id.includes('/node_modules/yaml/')) return 'grammars';
          return undefined;
        },
      },
    },
  },
});
