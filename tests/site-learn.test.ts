// Website learn pages (scripts/site/learn.mjs): one page per lesson in English and Italian, unique
// titles and descriptions, internal links and anchors that resolve, valid JSON-LD, and a glossary
// whose terms point at real lessons.

import { describe, expect, it } from 'vitest';
import { LESSONS, TRACKS } from '@shared/lessons';
import { IT } from '@shared/i18n';
// @ts-expect-error plain JS site generator
import { buildLearn, learnLinks, partTopics } from '../scripts/site/learn.mjs';
// @ts-expect-error plain JS site generator
import { GLOSSARY } from '../scripts/site/glossary.mjs';

interface Term {
  id: string;
  lessons: string[];
  en: [string, string];
  it: [string, string];
}
interface HeadArgs {
  lang: string;
  title: string;
  description: string;
  url: string;
  alt: { en: string; it: string };
  ld: unknown;
  body: string;
}

const SITE = 'https://example.test';
// Minimal stand-in for build-site.mjs's head(): what the tests read back.
const head = (a: HeadArgs) =>
  `<html lang="${a.lang}"><head><title>${a.title}</title><meta name="description" content="${a.description}" /><link rel="canonical" href="${a.url}" /><link rel="alternate" hreflang="en" href="${SITE}${a.alt.en}" /><link rel="alternate" hreflang="it" href="${SITE}${a.alt.it}" /><script type="application/ld+json">${JSON.stringify(a.ld)}</script></head><body>${a.body}</body></html>`;
const chrome = () => ({ header: '<header></header>', footer: '<footer></footer>' });

function build(lang: 'en' | 'it', demo = true) {
  return buildLearn({ lang, lessons: LESSONS, tracks: TRACKS, IT, site: SITE, head, chrome, boards: [], demo }) as {
    pages: Record<string, string>;
    sitemap: { en: string; it: string }[];
  };
}

const en = build('en');
const it_ = build('it');
const all: Record<string, string> = { ...en.pages, ...it_.pages };
const fileFor = (href: string) => `${href.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
const descOf = (html: string) => /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';

describe('learn pages', () => {
  it('has a hub, a page per lesson, a glossary and interview questions in both languages', () => {
    for (const pre of ['', 'it/']) {
      expect(all[`${pre}learn/index.html`]).toBeTruthy();
      expect(all[`${pre}learn/glossary/index.html`]).toBeTruthy();
      expect(all[`${pre}learn/interview-questions/index.html`]).toBeTruthy();
      for (const l of LESSONS) expect(all[`${pre}learn/${l.id}/index.html`], `${pre}${l.id}`).toBeTruthy();
    }
    expect(Object.keys(all)).toHaveLength((LESSONS.length + 3) * 2);
    expect(en.sitemap).toHaveLength(LESSONS.length + 3);
    expect(it_.sitemap).toHaveLength(0);
  });

  it('gives every page a unique title and description', () => {
    for (const pages of [en.pages, it_.pages]) {
      const titles = Object.values(pages).map(titleOf);
      const descs = Object.values(pages).map(descOf);
      expect(titles.every((t) => t.length > 10)).toBe(true);
      expect(descs.every((d) => d.length > 50 && d.length <= 200)).toBe(true);
      expect(new Set(titles).size).toBe(titles.length);
      expect(new Set(descs).size).toBe(descs.length);
    }
    // Italian pages are really translated
    expect(titleOf(it_.pages['it/learn/gpio/index.html'])).not.toBe(titleOf(en.pages['learn/gpio/index.html']));
  });

  it('links only to learn pages and anchors that exist', () => {
    for (const [file, html] of Object.entries(all)) {
      for (const m of html.matchAll(/href="((?:\/it)?\/learn\/[^"]*)"/g)) {
        const [path, hash] = m[1].split('#');
        const target = all[fileFor(path)];
        expect(target, `${file} -> ${m[1]}`).toBeTruthy();
        if (hash) expect(target, `${file} -> ${m[1]}`).toContain(`id="${hash}"`);
      }
      for (const m of html.matchAll(/href="#([^"]+)"/g)) expect(html, `${file} #${m[1]}`).toContain(`id="${m[1]}"`);
    }
  });

  it('writes valid JSON-LD and never invents answers', () => {
    for (const [file, html] of Object.entries(all)) {
      const raw = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
      expect(raw, file).toBeTruthy();
      const ld = JSON.parse(raw!) as { '@graph': { '@type': string | string[] }[] };
      const types = ld['@graph'].flatMap((n) => n['@type']);
      expect(types).toContain('BreadcrumbList');
      expect(types).not.toContain('FAQPage');
    }
    const hub = JSON.parse(/ld\+json">([\s\S]*?)<\/script>/.exec(en.pages['learn/index.html'])![1]) as { '@graph': { '@type': string }[] };
    expect(hub['@graph'].map((n) => n['@type'])).toContain('Course');
    const gloss = en.pages['learn/glossary/index.html'];
    expect(gloss).toContain('"DefinedTermSet"');
  });

  it('renders every lesson block and every interview question', () => {
    for (const l of LESSONS) {
      const html = en.pages[`learn/${l.id}/index.html`];
      for (const q of l.interview) expect(html).toContain(q.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
      if (l.blocks.some((b) => b.kind === 'lab')) expect(html).toContain('Hands-on lab (in the app)');
      if (l.blocks.some((b) => b.kind === 'board')) expect(html).toContain(`demo=lesson-preview&amp;lesson=${l.id}`);
    }
    // without the browser demo, no link points at it
    expect(Object.values(build('en', false).pages).join('')).not.toContain('/demo/');
  });
});

describe('glossary', () => {
  const terms = GLOSSARY as Term[];
  it('has about sixty or more unique terms, each in both languages, linked to real lessons', () => {
    expect(terms.length).toBeGreaterThanOrEqual(60);
    expect(new Set(terms.map((g) => g.id)).size).toBe(terms.length);
    const ids = new Set(LESSONS.map((l) => l.id));
    for (const g of terms) {
      expect(g.id).toMatch(/^[a-z0-9-]+$/);
      expect(g.en[0] && g.en[1] && g.it[0] && g.it[1], g.id).toBeTruthy();
      expect(g.lessons.filter((x) => !ids.has(x)), g.id).toEqual([]);
    }
  });

  it('links part pages to the lesson that explains their bus', () => {
    expect(partTopics({ id: 'bme280-gy', bus: 'i2c', voltage: '3.3', pins: [{ name: 'SDA', role: 'i2c_sda' }] }).lessons).toContain('buses');
    expect(partTopics({ id: 'potentiometer', bus: 'analog', voltage: '3.3', pins: [{ name: 'W', role: 'analog_out' }] }).lessons).toContain('adc');
    const links = learnLinks({ lessons: LESSONS, IT }) as { part: (lang: string, p: unknown) => string };
    const html = links.part('it', { id: 'bme280-gy', bus: 'i2c', voltage: '3.3', pins: [{ name: 'SDA', role: 'i2c_sda' }] });
    expect(html).toContain('/it/learn/buses/');
    expect(html).toContain('/it/learn/glossary/#i2c');
  });
});
