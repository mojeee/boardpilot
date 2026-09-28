#!/usr/bin/env node
// Tell IndexNow search engines (Bing, Yandex, Seznam, Naver…) about every page in the sitemap.
// Run after a deploy: `npm run seo:ping`. Google does not use IndexNow; it reads sitemap.xml.

import { readFileSync } from 'node:fs';
const key = readFileSync(new URL('./site/indexnow-key.txt', import.meta.url), 'utf8').trim();
const host = 'boardpilot.agentflowbind.com';
const sitemap = readFileSync(new URL('../site/sitemap.xml', import.meta.url), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (let i = 0; i < urls.length; i += 10000) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls.slice(i, i + 10000) }),
  });
  console.log(`IndexNow: ${res.status} ${res.statusText} for ${Math.min(10000, urls.length - i)} URLs`);
}
