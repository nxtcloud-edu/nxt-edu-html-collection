import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/app/',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../public/app', import.meta.url)),
    // A cached index may request the immediately previous hashed assets during a Lambda rollout.
    // Keep old assets until an explicit, separately reviewed cleanup phase.
    emptyOutDir: false,
  },
});
