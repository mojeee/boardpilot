// The technical "How BoardPilot works" page: both languages, every linked source file exists,
// and the rules it lists are the wiring checker's real rules.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ES module of the site generator
import { buildHowItWorks } from '../scripts/site/howitworks.mjs';

const root = join(__dirname, '..');
const REPO = 'https://github.com/mojeee/boardpilot';
const head = ({ body }: { body: string }) => body;

describe('How BoardPilot works page', () => {
  const pages = ['en', 'it'].map((lang) => buildHowItWorks({ lang, site: 'https://x', repo: REPO, head, header: '', footer: '' }) as { rel: string; html: string });

  it('is written in English and Italian', () => {
    expect(pages.map((p) => p.rel)).toEqual(['how-it-works/index.html', 'it/how-it-works/index.html']);
    expect(pages[1].html).toContain('Come si scelgono i pin');
  });

  it('links only to source files that exist', () => {
    for (const p of pages) {
      const paths = [...p.html.matchAll(new RegExp(`${REPO}/blob/main/([^"]+)`, 'g'))].map((m) => m[1]);
      expect(paths.length).toBeGreaterThan(15);
      expect(paths.filter((x) => !existsSync(join(root, x)))).toEqual([]);
    }
  });

  it('lists the wiring checker’s real rules', () => {
    const src = readFileSync(join(root, 'shared/types.ts'), 'utf8');
    const union = /rule:\s*([\s\S]*?);\n\s*severity/.exec(src)![1];
    const rules = [...union.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    for (const p of pages) for (const r of rules) expect(p.html, r).toContain(`<code>${r}</code>`);
  });
});
