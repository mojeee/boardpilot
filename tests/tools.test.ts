// Website calculators (/tools/): the page generator (scripts/site/tools.mjs), the client logic
// (scripts/site/tools-client/calc.ts) and the built bundle (site/tools/calc.js) must give the same
// numbers and texts as the app's shared/electronics.ts and shared/clocks.ts.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { BOARDS as BOARD_MAP, getBoard } from '@shared/board';
import { IT, setLanguage } from '@shared/i18n';
import { dividerR2, e12Nearest, i2cPullup, ledResistor } from '@shared/electronics';
import { adcCalc, pwmCalc, uartCalc } from '@shared/clocks';
import { asBoard, suggestPullup, uartTable, type ToolBoard } from '../scripts/site/tools-client/calc';
import { buildTools, toolBoards } from '../scripts/site/tools.mjs';
import { toolsI18nKeys } from '../scripts/site/tools-i18n.mjs';

const root = resolve(__dirname, '..');
const BOARDS = Object.values(BOARD_MAP);
const SITE = 'https://boardpilot.agentflowbind.com';

interface HeadArgs {
  lang: string;
  title: string;
  description: string;
  url: string;
  alt: { en: string; it: string };
  ld: unknown;
  body: string;
}
/** A small stand-in for build-site.mjs's head(): enough to check what the generator passes it. */
const head = (a: HeadArgs) =>
  `<!doctype html><html lang="${a.lang}"><head><title>${a.title}</title><meta name="description" content="${a.description}" /><link rel="canonical" href="${a.url}" /><link rel="alternate" hreflang="en" href="${SITE}${a.alt.en}" /><link rel="alternate" hreflang="it" href="${SITE}${a.alt.it}" /><link rel="stylesheet" href="/style.css" /><script type="application/ld+json">${JSON.stringify(a.ld)}</script></head><body>${a.body}</body></html>`;
const chromeFor = () => ({ header: '<header class="nav"></header>', footer: '<footer class="footer"></footer>' });

type Built = { pages: Record<string, string>; sitemap: { en: string; it: string }[] };
const built: Record<'en' | 'it', Built> = {
  en: buildTools({ lang: 'en', boards: BOARDS, site: SITE, head, chromeFor }),
  it: buildTools({ lang: 'it', boards: BOARDS, site: SITE, head, chromeFor }),
};
const all = { ...built.en.pages, ...built.it.pages };
const page = (rel: string) => all[rel] ?? '';
const SLUGS = ['led-resistor-calculator', 'voltage-divider-calculator', 'i2c-pull-up-calculator', 'uart-baud-rate-calculator', 'pwm-timer-calculator', 'adc-sample-rate-calculator'];

describe('calculator pages', () => {
  it('builds the hub and six calculators in both languages', () => {
    for (const pre of ['', 'it/']) {
      expect(all[`${pre}tools/index.html`]).toBeTruthy();
      for (const s of SLUGS) expect(all[`${pre}tools/${s}/index.html`], `${pre}${s}`).toBeTruthy();
    }
    expect(Object.keys(all)).toHaveLength(14);
    expect(built.en.sitemap).toHaveLength(7);
    expect(built.it.sitemap).toHaveLength(0); // one sitemap entry per page pair, with both languages
  });

  it('gives every page its own title and description', () => {
    const titles = Object.values(all).map((h) => /<title>([^<]+)<\/title>/.exec(h)?.[1]);
    const descs = Object.values(all).map((h) => /name="description" content="([^"]+)"/.exec(h)?.[1]);
    expect(titles.every(Boolean)).toBe(true);
    expect(descs.every((d) => d && d.length > 80 && d.length < 260)).toBe(true);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it('marks up FAQ, breadcrumbs and a free web application', () => {
    for (const [rel, html] of Object.entries(all)) {
      const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]) as { '@graph': Record<string, unknown>[] };
      const types = ld['@graph'].map((n) => n['@type']);
      expect(types, rel).toContain('BreadcrumbList');
      if (rel.endsWith('tools/index.html')) continue;
      const app = ld['@graph'].find((n) => n['@type'] === 'WebApplication')!;
      expect(app.applicationCategory).toBe('UtilitiesApplication');
      expect((app.offers as { price: string }).price).toBe('0');
      const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage')! as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
      expect(faq.mainEntity.length, rel).toBeGreaterThanOrEqual(4);
      for (const q of faq.mainEntity) {
        expect(q.name.endsWith('?'), q.name).toBe(true);
        expect(q.acceptedAnswer.text.length).toBeGreaterThan(60);
        expect(html).toContain(`<summary>${q.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}</summary>`);
      }
    }
  });

  it('links both languages, the lessons, the demo and the calculator script', () => {
    for (const s of SLUGS) {
      const en = page(`tools/${s}/index.html`);
      const it = page(`it/tools/${s}/index.html`);
      expect(en).toContain(`hreflang="it" href="${SITE}/it/tools/${s}/"`);
      expect(it).toContain(`<link rel="canonical" href="${SITE}/it/tools/${s}/"`);
      expect(en).toMatch(/href="\/learn\/[a-z-]+\/"/);
      expect(it).toMatch(/href="\/it\/learn\/[a-z-]+\/"/);
      expect(en).toContain('/demo/#demo=board');
      expect(en).toContain('<script src="/tools/calc.js" defer></script>');
      expect(en).toContain('href="/tools.css"');
      expect(en).toContain('<pre class="formula">');
      expect(en).toContain('<noscript>');
    }
    // board data only where a board picker is
    expect(page('tools/uart-baud-rate-calculator/index.html')).toContain('id="bp-boards"');
    expect(page('tools/led-resistor-calculator/index.html')).not.toContain('id="bp-boards"');
  });

  it('offers every board in the pickers', () => {
    const html = page('tools/pwm-timer-calculator/index.html');
    const json = JSON.parse(/id="bp-boards">([\s\S]*?)<\/script>/.exec(html)![1]) as ToolBoard[];
    expect(json).toHaveLength(BOARDS.length);
    expect(json).toEqual(toolBoards(BOARDS));
    for (const b of BOARDS) expect(html).toContain(`<option value="${b.id}"`);
  });

  it('writes worked examples that match the app’s calculators', () => {
    const led = ledResistor(3.3, 2.0, 10);
    expect(led.ok && led.standard).toBe(150);
    expect(page('tools/led-resistor-calculator/index.html')).toContain('<b>150 Ω</b>');
    expect(page('it/tools/led-resistor-calculator/index.html')).toContain('8,67 mA');

    expect(e12Nearest(dividerR2(5, 3.3, 10000))).toBe(18000);
    expect(page('tools/voltage-divider-calculator/index.html')).toContain('<b>18 kΩ</b>');

    const p = i2cPullup(3.3, 100, 'fast');
    expect(page('tools/i2c-pull-up-calculator/index.html')).toContain(`<b>${suggestPullup(p.minOhms, p.maxOhms) / 1000} kΩ</b>`);

    const uno = getBoard('arduino-uno-r3');
    const u = uartCalc(uno, 16e6, 115200);
    expect(Math.round(u.actual!)).toBe(117647);
    expect(u.summary).toContain('2.12%');
    expect(page('tools/uart-baud-rate-calculator/index.html')).toContain('117647 baud, +2.12 %');
    const esp = uartCalc(getBoard('esp32-devkitc-30'), 80e6, 115200);
    expect(esp.values).toEqual(expect.arrayContaining([['CLKDIV', '694'], ['FRAG', '7']]));

    const servo = pwmCalc(uno, 16e6, 50, 7.5);
    expect(servo.values).toEqual(expect.arrayContaining([['ICR1 (TOP)', '39999'], ['OCR1A', '3000']]));
    const ledc = pwmCalc(getBoard('esp32-devkitc-30'), 80e6, 5000, 50);
    expect(ledc.values).toEqual(expect.arrayContaining([['Divider', '1.953125'], ['Duty value', '4096']]));
    expect(ledc.actual).toBe(5000);

    expect(Math.round(adcCalc(uno, 16e6, '128').actual!)).toBe(9615);
    expect(page('tools/adc-sample-rate-calculator/index.html')).toContain('9615 readings per second');
  });
});

describe('calculator client logic', () => {
  it('suggests a standard pull-up inside the allowed range', () => {
    for (const mode of ['standard', 'fast', 'fastPlus'] as const) {
      for (const pf of [20, 100, 200, 400]) {
        const r = i2cPullup(3.3, pf, mode);
        const s = suggestPullup(r.minOhms, r.maxOhms);
        if (s) expect(s >= r.minOhms && s <= r.maxOhms).toBe(true);
      }
    }
    expect(suggestPullup(3000, 1000)).toBe(0);
  });

  it('runs the app’s clock calculators on the compact board data', () => {
    for (const tb of toolBoards(BOARDS) as ToolBoard[]) {
      const full = getBoard(tb.id);
      const c = tb.clocks!;
      expect(uartCalc(asBoard(tb), c.uartHz ?? 1, 115200)).toEqual(uartCalc(full, c.uartHz ?? 1, 115200));
      expect(pwmCalc(asBoard(tb), c.pwmHz ?? 1, 1000, 25)).toEqual(pwmCalc(full, c.pwmHz ?? 1, 1000, 25));
      expect(adcCalc(asBoard(tb), c.adcHz ?? c.cpuHz, '')).toEqual(adcCalc(full, c.adcHz ?? c.cpuHz, ''));
    }
    const table = uartTable(toolBoards(BOARDS).find((b: ToolBoard) => b.id === 'esp32-devkitc-30')!, 80e6);
    expect(table.every((r) => r.ok && Math.abs(r.errorPct!) < 0.01)).toBe(true);
  });

  it('carries every Italian text the calculators need', () => {
    const missing = toolsI18nKeys(root).filter((k) => !(k in IT));
    expect(missing).toEqual([]);
  });
});

describe('calculator bundle (site/tools/calc.js)', () => {
  const file = join(root, 'site/tools/calc.js');
  it.runIf(existsSync(file))('gives the same results as the app, in both languages (rebuild with npm run build:tools)', () => {
    type Api = {
      ledResistor: typeof ledResistor;
      uartCalc: typeof uartCalc;
      pwmCalc: typeof pwmCalc;
      adcCalc: typeof adcCalc;
      setLanguage: typeof setLanguage;
    };
    const load = (lang: string): Api => {
      const document = { documentElement: { lang }, readyState: 'complete', querySelectorAll: () => [], getElementById: () => null, addEventListener: () => undefined };
      const ctx: Record<string, unknown> = { document, location: { search: '' }, URLSearchParams, navigator: {}, setTimeout };
      ctx.window = ctx;
      vm.runInNewContext(readFileSync(file, 'utf8'), ctx);
      return ctx.BPCalc as Api;
    };
    const cases = BOARDS.filter((b) => b.clocks).map((b) => b.id);
    for (const lang of ['en', 'it'] as const) {
      const api = load(lang);
      setLanguage(lang);
      try {
        expect(api.ledResistor(5, 2, 10)).toEqual(ledResistor(5, 2, 10));
        for (const id of cases) {
          const b = getBoard(id);
          const c = b.clocks!;
          for (const baud of [9600, 115200, 921600]) expect(api.uartCalc(b, c.uartHz ?? 1, baud), `${lang} ${id} ${baud}`).toEqual(uartCalc(b, c.uartHz ?? 1, baud));
          expect(api.pwmCalc(b, c.pwmHz ?? 1, 50, 7.5)).toEqual(pwmCalc(b, c.pwmHz ?? 1, 50, 7.5));
          expect(api.adcCalc(b, c.adcHz ?? c.cpuHz, '')).toEqual(adcCalc(b, c.adcHz ?? c.cpuHz, ''));
        }
      } finally {
        setLanguage('en');
      }
    }
  });
});
