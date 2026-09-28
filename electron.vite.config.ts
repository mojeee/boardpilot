import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = {
  '@shared': resolve(__dirname, 'shared'),
  '@boards': resolve(__dirname, 'boards'),
  '@parts': resolve(__dirname, 'parts'),
  '@flows': resolve(__dirname, 'flows'),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'app/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'app/preload/index.ts') } } },
  },
  renderer: {
    root: resolve(__dirname, 'app/renderer'),
    resolve: { alias },
    plugins: [react()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'app/renderer/index.html') } } },
  },
});
