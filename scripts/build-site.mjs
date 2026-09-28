#!/usr/bin/env node
// Builds the static website in site/: English and Italian landing pages, the ESP32 pinout pages,
// sitemap.xml and robots.txt. Run `npm run build:site` after editing scripts/site/*.
// Output is committed, because Cloudflare Pages serves site/ as it is (no build step).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IT } from './site/i18n-it.mjs';
import { renderPinout } from './site/pinout.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://boardpilot.agentflowbind.com';
const REPO = 'https://github.com/mojeee/boardpilot';
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const board = JSON.parse(readFileSync(join(root, 'boards/esp32-devkitc-30.json'), 'utf8'));
const tpl = readFileSync(join(root, 'scripts/site/index.template.html'), 'utf8');
const today = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/<[^>]+>/g, '');

function write(rel, content) {
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
write('esp32-pinout/index.html', renderPinout({ lang: 'en', board, site: SITE, ...chrome(en, 'en', pinPaths) }));
write('it/esp32-pinout/index.html', renderPinout({ lang: 'it', board, site: SITE, ...chrome(it, 'it', pinPaths) }));

/* sitemap with language alternates */
const pages = [
  { en: '/', it: '/it/', priority: '1.0' },
  { en: '/esp32-pinout/', it: '/it/esp32-pinout/', priority: '0.8' },
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
console.log(`site built: 4 pages, sitemap, robots (version ${pkg.version})`);
