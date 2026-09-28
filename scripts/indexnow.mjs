#!/usr/bin/env node
// Tell IndexNow search engines (Bing, Yandex, Seznam, Naver…) that the site changed.
// Run after a deploy: `npm run seo:ping`. Google does not use IndexNow; it reads sitemap.xml.

import { readFileSync } from 'node:fs';
const key = readFileSync(new URL('./site/indexnow-key.txt', import.meta.url), 'utf8').trim();
const host = 'boardpilot.agentflowbind.com';
const urls = ['/', '/it/', '/esp32-pinout/', '/it/esp32-pinout/'].map((p) => `https://${host}${p}`);
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urls.length} URLs`);
