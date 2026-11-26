// The web view: React, drawably's hand-drawn controls and @sketchyicons/react-native's icons, which
// draw through react-native-svg; react-native-web stands in for React Native in the browser.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const extensions = ['.web.tsx', '.web.ts', '.web.mjs', '.web.js', '.tsx', '.ts', '.mjs', '.js', '.jsx', '.json'];

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  define: { __DEV__: 'false', global: 'globalThis' },
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      // A native module behind a lazy, Android-only require: react-native-web has no TurboModuleRegistry.
      { find: /^\.\.\/fabric\/NativeSvgSoundModule$/, replacement: `${import.meta.dirname}/stubs/native-module.ts` },
      // Bundled <Image> assets, which the icons never use.
      { find: /^@react-native\/assets-registry\/registry$/, replacement: `${import.meta.dirname}/stubs/assets-registry.ts` },
    ],
    extensions,
  },
  optimizeDeps: { rolldownOptions: { resolve: { extensions } } },
  build: { outDir: 'dist', emptyOutDir: true },
});
