#!/usr/bin/env node
// Create a BoardPilot license key. The private key lives outside the repo:
//   ~/.boardpilot/license-private.pem   (back it up; without it you cannot issue keys)
// Usage: node scripts/make-license.mjs --name "Ada Lovelace" [--email ada@example.com] [--plan personal|commercial|education] [--expires 2027-12-31]

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createPrivateKey, sign } from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
if (!args.name) {
  console.error('Usage: node scripts/make-license.mjs --name "Full Name" [--email x] [--plan personal|commercial|education] [--expires YYYY-MM-DD]');
  process.exit(1);
}
const keyPath = process.env.BOARDPILOT_LICENSE_KEY ?? join(homedir(), '.boardpilot', 'license-private.pem');
const payload = { n: args.name, p: args.plan ?? 'personal', i: new Date().toISOString().slice(0, 10) };
if (args.email) payload.e = args.email;
if (args.expires) payload.x = args.expires;
const data = Buffer.from(JSON.stringify(payload));
const sig = sign(null, data, createPrivateKey(readFileSync(keyPath, 'utf8')));
console.log(`BP1-${data.toString('base64url')}.${sig.toString('base64url')}`);
