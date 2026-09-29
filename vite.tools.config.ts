// The website calculators (/tools/): scripts/site/tools-client/main.ts and the app's own
// shared/electronics.ts and shared/clocks.ts, bundled into one small script.
//
//   npm run build:tools    -> site/tools/calc.js (committed; Cloudflare Pages serves site/ as it is)
//
// shared/i18n is swapped for a small module holding only the Italian texts these calculators
// use (scripts/site/tools-i18n.mjs), so the script stays a few tens of KB.

import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { IT } from './shared/i18n';
import { toolsI18nModule, toolsItDict } from './scripts/site/tools-i18n.mjs';

const r = (p: string) => resolve(__dirname, p);
const I18N = r('shared/i18n/index.ts');
const VIRTUAL = '\0bp-tools-i18n';

function smallI18n(): Plugin {
  return {
    name: 'boardpilot-tools-i18n',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/i18n$/.test(source)) return null;
      const hit = await this.resolve(source, importer, { ...options, skipSelf: true });
      return hit?.id === I18N ? VIRTUAL : null;
    },
    load(id) {
      return id === VIRTUAL ? toolsI18nModule(toolsItDict(__dirname, IT)) : null;
    },
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [smallI18n()],
  resolve: { alias: [{ find: '@shared', replacement: r('shared') }] },
  build: {
    outDir: r('site/tools'),
    emptyOutDir: false,
    target: 'es2020',
    minify: true,
    copyPublicDir: false,
    lib: {
      entry: r('scripts/site/tools-client/main.ts'),
      formats: ['iife'],
      name: 'BoardPilotTools',
      fileName: () => 'calc.js',
    },
  },
});
