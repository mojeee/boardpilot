// Web build of the app for the website ("Try it live"): the normal renderer plus app/web/bpWeb.ts,
// which runs the simulator and the rest of the main-process code in the page.
//
//   npm run build:web      -> site/demo/ (committed; Cloudflare Pages serves site/ as it is)
//   npx vite preview -c vite.web.config.ts   -> http://localhost:4173/ to try the build locally
//
// Node modules used by that main-process code are replaced by small in-memory shims, and the two
// modules that only make sense on a computer (the real USB driver and the Anthropic SDK client)
// are swapped for stubs. The Electron build (electron.vite.config.ts) is not affected.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const r = (p: string) => resolve(__dirname, p);
const pkg = JSON.parse(readFileSync(r('package.json'), 'utf8')) as { version: string };

/** Main-process files replaced in the web build, by resolved path. */
const SWAPS: Record<string, string> = {
  [r('app/main/hardware/realDriver.ts')]: r('app/web/stubs/realDriver.ts'),
  [r('app/main/ai/providers/anthropic.ts')]: r('app/web/stubs/anthropic.ts'),
};

function swapForWeb(): Plugin {
  return {
    name: 'boardpilot-web-swaps',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.')) return null;
      const hit = await this.resolve(source, importer, { ...options, skipSelf: true });
      return hit && SWAPS[hit.id] ? SWAPS[hit.id] : null;
    },
  };
}

export default defineConfig({
  root: r('app/web'),
  base: './',
  publicDir: false,
  plugins: [swapForWeb(), react()],
  define: {
    __BP_VERSION__: JSON.stringify(pkg.version),
    // app/main/hardware/ports.ts picks driver hints by platform; the page is neither Windows nor macOS.
    'process.platform': JSON.stringify('browser'),
  },
  resolve: {
    alias: [
      { find: '@shared', replacement: r('shared') },
      { find: '@boards', replacement: r('boards') },
      { find: '@parts', replacement: r('parts') },
      { find: '@flows', replacement: r('flows') },
      { find: /^node:fs\/promises$/, replacement: r('app/web/shims/fsPromises.ts') },
      { find: /^node:fs$/, replacement: r('app/web/shims/fs.ts') },
      { find: /^node:path$/, replacement: r('app/web/shims/path.ts') },
      { find: /^node:events$/, replacement: r('app/web/shims/events.ts') },
      { find: /^node:crypto$/, replacement: r('app/web/shims/crypto.ts') },
    ],
  },
  build: {
    outDir: r('site/demo'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // three.js and React Three Fiber change less often than the app: a separate, long-cached file.
        manualChunks: (id) => (/node_modules\/(three|@react-three|three-stdlib|troika-|camera-controls|maath|meshline|stats-gl|@monogrid)/.test(id) ? 'three' : undefined),
      },
    },
  },
  preview: { port: 4173, strictPort: false },
});
