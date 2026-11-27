// The web view: React, drawably's hand-drawn controls, @sketchyicons/react's icons, and three for
// the worlds. The page loads the sky's engine apart from itself, as a chunk of its own.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
});
