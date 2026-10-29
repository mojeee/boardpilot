// Validates board definition files (boards/*.json). Used by tests and by hand:
//   node scripts/check-boards.mjs              all boards
//   node scripts/check-boards.mjs boards/x.json one board
// Prints every problem and exits 1 if there is any.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBoard } from '../shared/boardCheck.mjs';

// The rules live in shared/boardCheck.mjs (the app checks imported boards with them too).
export { checkBoard, pinCornerMm } from '../shared/boardCheck.mjs';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(join(root, 'boards')).filter((f) => f.endsWith('.json')).map((f) => join(root, 'boards', f));
  let bad = 0;
  for (const f of files) {
    const b = JSON.parse(readFileSync(f, 'utf8'));
    const errs = checkBoard(b);
    if (errs.length) {
      bad++;
      console.log(`✗ ${f}`);
      for (const x of errs) console.log(`   ${x}`);
    } else console.log(`✓ ${f} (${b.pins.length} pins)`);
  }
  process.exit(bad ? 1 : 0);
}
