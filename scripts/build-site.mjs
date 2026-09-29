#!/usr/bin/env node
// Builds the static website in site/: English and Italian landing pages, the ESP32 pinout pages,
// sitemap.xml and robots.txt. Run `npm run build:site` after editing scripts/site/*.
// Output is committed, because Cloudflare Pages serves site/ as it is (no build step).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IT } from './site/i18n-it.mjs';
import { renderPinout } from './site/pinout.mjs';
import { buildParts } from './site/parts.mjs';
import { buildBoards, boardCards } from './site/boards.mjs';
import { buildCompare, buildGuides, compareLinks, partBoardLinks } from './site/guides.mjs';
import { readdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://boardpilot.agentflowbind.com';
const REPO = 'https://github.com/mojeee/boardpilot';
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const board = JSON.parse(readFileSync(join(root, 'boards/esp32-devkitc-30.json'), 'utf8'));
const boards = readdirSync(join(root, 'boards'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(root, 'boards', f), 'utf8')));
const tpl = readFileSync(join(root, 'scripts/site/index.template.html'), 'utf8');
const today = new Date().toISOString().slice(0, 10);
const parts = readdirSync(join(root, 'parts'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(root, 'parts', f), 'utf8')))
  .sort((a, b) => a.name.localeCompare(b.name));
const PARTS_COUNT = String(parts.length);
const featured = ['bme280-gy', 'hc-sr04', 'ssd1306-i2c', 'mpu6050', 'ws2812b-strip', 'vl53l0x', 'ds18b20-probe', 'rc522-rfid', 'relay-1ch', 'servo-sg90', 'ina219', 'neo-6m-gps', 'bh1750-gy302', 'max30102', 'l298n-driver', 'tm1637-4digit'];
const partsCloud = (lang) =>
  featured
    .map((id) => parts.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => `<a href="${lang === 'it' ? '/it' : ''}/parts/${p.id}/"><span style="background:${p.model.color}"></span>${esc(p.name.split(/[ (]/)[0])}</a>`)
    .join('');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/<[^>]+>/g, '');

/* cache busting: every CSS, JS and image URL carries a content hash, so browsers never show stale files */
import { createHash } from 'node:crypto';
const hashCache = new Map();
function hashOf(rel) {
  if (!hashCache.has(rel)) {
    try {
      hashCache.set(rel, createHash('sha1').update(readFileSync(join(root, 'site', rel))).digest('hex').slice(0, 10));
    } catch {
      hashCache.set(rel, null);
    }
  }
  return hashCache.get(rel);
}
function bust(html) {
  return html.replace(/((?:https:\/\/boardpilot\.agentflowbind\.com)?\/((?:img\/(?:boards\/)?[\w.-]+|style\.css|app\.js|logo(?:-mark)?\.svg|favicon\.svg|apple-touch-icon\.png)))(?=["'\s,])/g, (m, url, rel) => {
    const h = hashOf(rel);
    return h ? `${url}?v=${h}` : m;
  });
}

function write(rel, content) {
  if (rel.endsWith('.html')) content = bust(content);
  const p = join(root, 'site', rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

/** Replace the text of every data-i18n element, and data-i18n-content / data-i18n-alt attributes. */
function translate(html, dict) {
  const missing = new Set();
  html = html.replace(/(<([a-z0-9]+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, _tag, key, _inner, close) => {
    if (!(key in dict)) {
      missing.add(key);
      return m;
    }
    return open + esc(dict[key]) + close;
  });
  html = html.replace(/data-i18n-(content|alt)="([^"]+)"(\s+[^>]*?)?\s(content|alt)="[^"]*"/g, (m, _a, key, mid = '', attr) => {
    if (!(key in dict)) {
      missing.add(key);
      return m;
    }
    return `data-i18n-${attr}="${key}"${mid} ${attr}="${esc(dict[key])}"`;
  });
  if (missing.size) throw new Error(`Missing Italian site texts: ${[...missing].join(', ')}`);
  return html;
}

function faqFrom(html) {
  const out = [];
  for (const m of html.matchAll(/<details><summary[^>]*>([\s\S]*?)<\/summary><p[^>]*>([\s\S]*?)<\/p><\/details>/g)) {
    out.push({ '@type': 'Question', name: unesc(m[1]), acceptedAnswer: { '@type': 'Answer', text: unesc(m[2]) } });
  }
  return out;
}

function landing(lang) {
  const home = lang === 'it' ? '/it/' : '/';
  const url = `${SITE}${home}`;
  let html = tpl
    .replaceAll('{{SITE}}', SITE)
    .replaceAll('{{URL}}', url)
    .replaceAll('{{LANG}}', lang)
    .replaceAll('{{HOME}}', home)
    .replaceAll('{{PINOUT}}', `${lang === 'it' ? '/it' : ''}/esp32-pinout/`)
    .replaceAll('{{PARTS}}', `${lang === 'it' ? '/it' : ''}/parts/`)
    .replaceAll('{{PARTS_COUNT}}', PARTS_COUNT)
    .replaceAll('{{BOARDS}}', `${lang === 'it' ? '/it' : ''}/boards/`)
    .replaceAll('{{BOARDS_COUNT}}', String(boards.length))
    .replaceAll('{{BOARD_CARDS}}', boardCards(lang, boards, BOARD_IT))
    .replaceAll('{{PARTS_CLOUD}}', partsCloud(lang))
    .replaceAll('{{PATH_EN}}', '/')
    .replaceAll('{{PATH_IT}}', '/it/')
    .replaceAll('{{ON_EN}}', lang === 'en' ? 'on' : '')
    .replaceAll('{{ON_IT}}', lang === 'it' ? 'on' : '')
    .replaceAll('{{OG_LOCALE}}', lang === 'it' ? 'it_IT' : 'en_US')
    .replaceAll('{{OG_LOCALE_ALT}}', lang === 'it' ? 'en_US' : 'it_IT');
  if (lang === 'it') html = translate(html, IT);
  const title = unesc(/<title[^>]*>([\s\S]*?)<\/title>/.exec(html)[1]);
  const description = unesc(/<meta name="description"[^>]*content="([^"]*)"/.exec(html)[1]);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'BoardPilot', inLanguage: ['en', 'it'] },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE}/#app`,
        name: 'BoardPilot',
        url,
        description,
        applicationCategory: 'DeveloperApplication',
        applicationSubCategory: 'Embedded development, ESP32 debugging',
        operatingSystem: 'macOS 12+, Windows 10, Windows 11',
        softwareVersion: pkg.version,
        inLanguage: ['en', 'it'],
        image: `${SITE}/img/og.jpg`,
        screenshot: ['debug', 'test', 'monitor', 'library'].map((s) => `${SITE}/img/${s}.jpg`),
        downloadUrl: [
          `${REPO}/releases/latest/download/BoardPilot-mac-arm64.dmg`,
          `${REPO}/releases/latest/download/BoardPilot-mac-x64.dmg`,
          `${REPO}/releases/latest/download/BoardPilot-win-x64.exe`,
        ],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', description: lang === 'it' ? 'Prova gratuita di 30 giorni' : 'Free 30-day trial' },
        license: `${REPO}/blob/main/LICENSE.md`,
        author: { '@type': 'Person', name: 'Mojtaba Amini', url: 'https://github.com/mojeee' },
        sameAs: [REPO],
        featureList:
          lang === 'it'
            ? 'Scheda ESP32 in 3D, debug guidato I2C, test di scambio SDA/SCL, bus I2C decodificato, controllo del cablaggio, libreria componenti, grafici dal vivo, simulatore'
            : 'Live 3D ESP32 board, guided I2C debugging, SDA/SCL swap test, decoded I2C bus, wiring checker, parts library, live plots, simulator',
      },
      { '@type': 'WebPage', '@id': `${url}#page`, url, name: title, inLanguage: lang, isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': `${SITE}/#app` } },
      { '@type': 'FAQPage', mainEntity: faqFrom(html) },
    ],
  };
  html = html.replace('{{JSONLD}}', JSON.stringify(ld).replace(/</g, '\\u003c'));
  if (html.includes('{{')) throw new Error(`Unreplaced placeholder in ${lang} landing page`);
  return html;
}

const BOARD_IT = {};
for (const f of ['boards-data.ts', 'boards-ui.ts']) Object.assign(BOARD_IT, (await import(join(root, 'shared/i18n/it', f))).default);
const en = landing('en');
const it = landing('it');
write('index.html', en);
write('it/index.html', it);

/* pinout pages reuse the landing page header and footer, with links pointing back to the landing page */
function chrome(html, lang, pagePath) {
  const home = lang === 'it' ? '/it/' : '/';
  const header = /<header class="nav">[\s\S]*?<\/header>/.exec(html)[0]
    .replace(/href="#([a-z]+)"/g, `href="${home}#$1"`)
    .replace(/<a href="\/" hreflang="en"[^>]*>EN<\/a><a href="\/it\/" hreflang="it"[^>]*>IT<\/a>/, `<a href="${pagePath.en}" hreflang="en" class="${lang === 'en' ? 'on' : ''}">EN</a><a href="${pagePath.it}" hreflang="it" class="${lang === 'it' ? 'on' : ''}">IT</a>`);
  const footer = /<footer class="footer">[\s\S]*?<\/footer>/.exec(html)[0];
  return { header, footer };
}
const pinPaths = { en: '/esp32-pinout/', it: '/it/esp32-pinout/' };
// pages that are not the landing page keep the "Boards" link pointing at the boards index
write('esp32-pinout/index.html', renderPinout({ lang: 'en', board, site: SITE, ...chrome(en, 'en', pinPaths) }));
write('it/esp32-pinout/index.html', renderPinout({ lang: 'it', board, site: SITE, ...chrome(it, 'it', pinPaths) }));

/* parts library pages and open dataset */
const IT_MEASURES = {};
for (const f of readdirSync(join(root, 'shared/i18n/it'))) {
  if (/^(partsdata\d*|three|gotchas)\.ts$/.test(f)) Object.assign(IT_MEASURES, (await import(join(root, 'shared/i18n/it', f))).default);
}
/** A page's social image: its own when it exists in site/img (e.g. a board's), else the default. */
function ogImage(image) {
  return image && existsSync(join(root, 'site', image.replace(/^\//, ''))) ? image : '/img/og.jpg';
}

function head({ lang, title, description, url, alt, ld, body, image }) {
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="en" href="${SITE}${alt.en}" />
    <link rel="alternate" hreflang="it" href="${SITE}${alt.it}" />
    <link rel="alternate" hreflang="x-default" href="${SITE}${alt.en}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="BoardPilot" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${SITE}${ogImage(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#12171C" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/style.css" />
    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
  </head>
  <body>
${body}
  </body>
</html>
`;
}
const partPaths = { en: '/parts/', it: '/it/parts/' };
for (const [lang, html] of [['en', en], ['it', it]]) {
  const pages = buildParts({ parts, lang, site: SITE, IT_MEASURES, head, boardLinks: (p) => partBoardLinks(lang, p, boards), ...chrome(html, lang, partPaths) });
  for (const [rel, content] of Object.entries(pages)) write(rel, content);
}
write('boards.json', JSON.stringify({ name: 'BoardPilot board library', license: 'CC-BY-4.0', source: `${REPO}/tree/main/boards`, generated: today, count: boards.length, boards }, null, 1));
write('parts.json', JSON.stringify({ name: 'BoardPilot parts library', license: 'CC-BY-4.0', attribution: 'BoardPilot (https://boardpilot.agentflowbind.com)', source: `${REPO}/tree/main/parts`, generated: today, count: parts.length, parts }, null, 1));
for (const p of parts) write(`parts/${p.id}.json`, JSON.stringify(p, null, 2));

const boardPaths = { en: '/boards/', it: '/it/boards/' };
const extraPages = [];
for (const [lang, html] of [['en', en], ['it', it]]) {
  const pages = buildBoards({ lang, boards, parts, site: SITE, repo: REPO, head, IT: BOARD_IT, ...chrome(html, lang, boardPaths) });
  for (const [rel, content] of Object.entries(pages)) write(rel, content);
  // Wiring guides: part names and notes translated with the parts dictionaries, board texts with the board one.
  const guides = buildGuides({ lang, boards, parts, site: SITE, head, IT: { ...IT_MEASURES, ...BOARD_IT }, ...chrome(html, lang, boardPaths) });
  for (const [rel, content] of Object.entries(guides.pages)) write(rel, content);
  const compare = buildCompare({ lang, boards, site: SITE, head, ...chrome(html, lang, boardPaths) });
  for (const [rel, content] of Object.entries(compare.pages)) write(rel, content);
  extraPages.push(...guides.sitemap, ...compare.sitemap);
}
// The hand-written ESP32 page links to its comparisons too.
for (const [rel, lang] of [['esp32-pinout/index.html', 'en'], ['it/esp32-pinout/index.html', 'it']]) {
  const file = join(root, 'site', rel);
  const html = readFileSync(file, 'utf8');
  const links = compareLinks(lang, 'esp32-devkitc-30', boards);
  const h = lang === 'it' ? 'Confronti' : 'Compare';
  if (links && !html.includes('class="link-cloud"')) writeFileSync(file, html.replace('<div class="cta-box">', `<h2>${h}</h2><p class="link-cloud">${links}</p>\n        <div class="cta-box">`));
}

/* sitemap with language alternates */
const pages = [
  { en: '/', it: '/it/', priority: '1.0' },
  { en: '/parts/', it: '/it/parts/', priority: '0.9' },
  { en: '/esp32-pinout/', it: '/it/esp32-pinout/', priority: '0.8' },
  { en: '/boards/', it: '/it/boards/', priority: '0.9' },
  ...boards.filter((b) => b.id !== 'esp32-devkitc-30').map((b) => ({ en: `/boards/${b.id}/`, it: `/it/boards/${b.id}/`, priority: '0.8' })),
  ...extraPages.map((p) => ({ ...p, priority: '0.6' })),
  ...parts.map((p) => ({ en: `/parts/${p.id}/`, it: `/it/parts/${p.id}/`, priority: '0.6' })),
];
const urlEntry = (loc, p) => `  <url>
    <loc>${SITE}${loc}</loc>
    <lastmod>${today}</lastmod>
    <priority>${p.priority}</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${p.en}"/>
    <xhtml:link rel="alternate" hreflang="it" href="${SITE}${p.it}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${p.en}"/>
  </url>`;
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.flatMap((p) => [urlEntry(p.en, p), urlEntry(p.it, p)]).join('\n')}
</urlset>
`,
);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`site built: ${pages.length * 2} pages in the sitemap, ${boards.length} boards, ${extraPages.length} guide and comparison pages per language (${parts.length} parts), sitemap, robots, parts.json (version ${pkg.version})`);
