import { defineConfig } from 'vite';

export default defineConfig({
  base: '/empty-the-chamber/',
  build: { chunkSizeWarningLimit: 800 }, // three.js dominates the single bundle
});
