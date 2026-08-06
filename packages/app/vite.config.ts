import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Static output: the public site has no backend, and the local Python package serves this
  // same bundle from 127.0.0.1. Relative base keeps both working.
  base: './',
  build: { outDir: 'dist', sourcemap: true },
});
