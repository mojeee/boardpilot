import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@boards': resolve(__dirname, 'boards'),
      '@parts': resolve(__dirname, 'parts'),
      '@flows': resolve(__dirname, 'flows'),
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
