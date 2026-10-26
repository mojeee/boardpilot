// Website landing page: the comparison table (scripts/site/compare-tools.mjs) only states facts with
// an official source and leaves the rest empty, the demo gallery (scripts/site/demo.mjs) shows every
// recorded conversation and the Display Studio slot, and the built pages (site/index.html,
// site/it/index.html) keep their sections, links and structured data.

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// @ts-expect-error plain JS site generator
import { compareTable, ROWS, SOURCES, TOOLS } from '../scripts/site/compare-tools.mjs';
// @ts-expect-error plain JS site generator
import { chatUrl, demoGallery, isDisplayRecording, modelName } from '../scripts/site/demo.mjs';

interface Cell {
  v: string;
  en: string;
  it: string;
}
interface Recording {
  id: string;
  title: string;
  blurb: string;
  board: string;
  lang: string;
  model: string;
  slot?: string;
}

const root = resolve(__dirname, '..');
const RECORDINGS: Recording[] = readdirSync(join(root, 'app/renderer/replay/recordings'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(root, 'app/renderer/replay/recordings', f), 'utf8')));

const allRows = (ROWS as { rows: (string | Cell | null)[][] }[]).flatMap((g) => g.rows);

describe('comparison table', () => {
  it('has one cell per tool in every row, with both languages', () => {
    for (const r of allRows) {
      expect(r, String(r[0])).toHaveLength(2 + TOOLS.length);
      for (const c of r.slice(2) as (Cell | null)[]) {
        if (!c) continue;
        expect(['yes', 'part', 'no', 'text']).toContain(c.v);
        expect(c.en.length, String(r[0])).toBeGreaterThan(1);
        expect(c.it.length, String(r[0])).toBeGreaterThan(1);
      }
    }
  });

  it('lists official sources for every other product it states something about', () => {
    TOOLS.slice(1).forEach((tool: { id: string }, i: number) => {
      const stated = allRows.some((r) => r[3 + i] !== null);
      if (stated) expect(SOURCES[tool.id]?.length, tool.id).toBeGreaterThan(0);
    });
    for (const list of Object.values(SOURCES) as string[][]) for (const s of list) expect(s).toMatch(/^https:\/\//);
  });

  it('renders the table, the empty-cell legend and the sources comment in both languages', () => {
    for (const lang of ['en', 'it']) {
      const html = compareTable(lang, { lessons: '11' });
      expect(html).toContain('<table class="cmp">');
      expect(html).toContain('<!-- Comparison sources');
      expect(html).toContain('https://docs.wokwi.com/');
      expect(html.match(/<tr><th scope="row"/g)).toHaveLength(allRows.length);
      expect(html).not.toContain('{{');
      // an HTML comment must not contain "--" inside it
      const comment = /<!--([\s\S]*?)-->/.exec(html)?.[1] ?? '';
      expect(comment).not.toContain('--');
    }
    expect(compareTable('it')).toContain('Non indicato sul suo sito');
  });
});

describe('demo gallery', () => {
  const boardName = (id: string) => id;
  const poster = () => '/img/chat.jpg';

  // Recordings that are not Display Studio ones (those fill the Display Studio slot instead).
  const CHATS = RECORDINGS.filter((r) => !isDisplayRecording(r));

  it('shows the debugging demo, every recording and the Display Studio placeholder', () => {
    for (const lang of ['en', 'it']) {
      const html = demoGallery({ lang, recordings: CHATS, boardName, poster, boardsHref: '/boards/' });
      expect(html.match(/<article class="demo-card/g)).toHaveLength(CHATS.length + 2);
      for (const r of CHATS) expect(html).toContain(chatUrl(lang, r.id).replace(/&/g, '&amp;'));
      expect(html).toContain('#demo=debug');
      expect(html).toContain('Display Studio');
      expect(html).toContain('k-soon');
    }
  });

  it('puts a Display Studio recording in its slot', () => {
    const display = { ...CHATS[0], id: 'display-oled', title: 'OLED dashboard', slot: 'display-studio' };
    const html = demoGallery({ lang: 'en', recordings: [...CHATS, display], boardName, poster, boardsHref: '/boards/' });
    expect(html.match(/<article class="demo-card/g)).toHaveLength(CHATS.length + 2);
    expect(html).not.toContain('k-soon');
    expect(html).toContain('OLED dashboard');
  });

  it('names models in plain words', () => {
    expect(modelName('claude-sonnet-5')).toBe('Claude Sonnet 5');
    expect(modelName('claude-sonnet-5-5')).toBe('Claude Sonnet 5.5');
  });
});

describe.skipIf(!existsSync(join(root, 'site/index.html')))('built landing pages', () => {
  for (const [lang, file] of [
    ['en', 'site/index.html'],
    ['it', 'site/it/index.html'],
  ]) {
    const html = readFileSync(join(root, file), 'utf8');
    it(`${lang}: has every section, no placeholder and FAQ structured data`, () => {
      for (const id of ['features', 'f-build', 'f-3d', 'f-debug', 'f-flash', 'f-monitor', 'f-learn', 'f-mcp', 'boards', 'how', 'how-parts', 'how-wiring', 'how-debug', 'how-code', 'how-sim', 'trust', 'demos', 'try', 'compare', 'pricing', 'faq', 'download']) {
        expect(html, id).toContain(`id="${id}"`);
      }
      expect(html).not.toContain('{{');
      const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}');
      const faq = ld['@graph'].find((x: { '@type': string }) => x['@type'] === 'FAQPage');
      expect(faq.mainEntity.length).toBeGreaterThanOrEqual(11);
    });
    it(`${lang}: every demo link opens a demo that exists`, () => {
      const ids = new Set(RECORDINGS.map((r) => r.id));
      for (const m of html.matchAll(/data-demo="([^"]+)"/g)) {
        const url = m[1].replace(/&amp;/g, '&');
        expect(url).toMatch(/^\/demo\/#demo=(chat|debug|code|template)&/);
        const chat = /chat=([\w-]+)/.exec(url)?.[1];
        if (chat) expect(ids.has(chat), chat).toBe(true);
        expect(url).toContain(`lang=${lang}`);
      }
    });
  }
});
