// Live AI evaluations (tests/live/*.live.ts): real API calls, so never part of `npm test`.
// Run with `npm run eval:ai`; see tests/live/builder.live.ts for the options.
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
  test: { include: ['tests/live/**/*.live.ts'], environment: 'node', testTimeout: 15 * 60_000, maxConcurrency: 5 },
});
