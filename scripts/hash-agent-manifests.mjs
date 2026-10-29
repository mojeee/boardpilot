#!/usr/bin/env node
// Adds (or refreshes) the sha256 of every image in resources/agent/<board>/manifest.json from the
// binaries already there. It does not rebuild any firmware: use it once for agents built before
// the hashes existed. `npm run build:agent` writes the hashes by itself.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'agent');
let n = 0;
for (const d of readdirSync(OUT, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const mp = join(OUT, d.name, 'manifest.json');
  if (!existsSync(mp)) continue;
  const m = JSON.parse(readFileSync(mp, 'utf8'));
  for (const p of m.parts) p.sha256 = createHash('sha256').update(readFileSync(join(OUT, d.name, p.file))).digest('hex');
  writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
  n++;
}
console.log(`Hashed ${n} manifest(s) in resources/agent/.`);
