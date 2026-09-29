// Takes the README and website screenshots from the real app in simulator mode, so the pictures
// always show the current UI. Needs a build first (npm run build). On Linux without a display it
// runs under xvfb-run with software WebGL.
//   node scripts/screenshots.mjs            every shot
//   node scripts/screenshots.mjs live test  some shots
//   node scripts/screenshots.mjs boards     the 3D view of every board, for the social images
// Writes docs/img/<name>.jpg (1600 × 1000), site/img/<name>.jpg and site/img/<name>-900.jpg;
// "boards" writes site/img/boards/<id>-3d.png (then run: npx electron scripts/render-social.cjs boards).

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** name → hash for the app window and how long the scripted demo needs before the capture (ms). */
const SHOTS = {
  home: { hash: '', delay: 6000 },
  live: { hash: '#demo=live&stage=desk', delay: 26000 },
  debug: { hash: '#demo=debug&scenario=weather-station-swapped&stage=desk', delay: 32000 },
  test: { hash: '#demo=test&scenario=weather-station-swapped&stage=desk', delay: 30000 },
  monitor: { hash: '#demo=monitor&scenario=healthy', delay: 16000 },
  library: { hash: '#demo=library&stage=desk', delay: 20000 },
};

/** The 3D viewport inside the 1600 × 1000 window: right of the task rail, left of the panel, above the log. */
const VIEWPORT = '208,56,992,692';

const want = process.argv.slice(2);
const headless = process.platform === 'linux' && !process.env.DISPLAY;

function run(env, delay) {
  const electron = ['electron', '.', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const cmd = headless ? 'xvfb-run' : 'npx';
  const args = headless ? ['-a', '-s', '-screen 0 1600x1000x24', 'npx', ...electron] : electron;
  spawnSync(cmd, args, { cwd: root, env: { ...process.env, ...env, BP_SNAPSHOT_DELAY: String(delay) }, stdio: 'ignore', timeout: delay + 60000 });
}

if (want[0] === 'boards') {
  mkdirSync(join(root, 'site/img/boards'), { recursive: true });
  const ids = want.length > 1 ? want.slice(1) : readdirSync(join(root, 'boards')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  for (const id of ids) {
    const out = join(root, 'site/img/boards', `${id}-3d.png`);
    process.stdout.write(`${id}… `);
    run({ BP_SNAPSHOT: out, BP_SNAPSHOT_RECT: VIEWPORT, BP_SNAPSHOT_HASH: `#demo=board&board=${id}&stage=desk&clean=1` }, 24000);
    console.log(existsSync(out) ? 'ok' : 'failed');
  }
  process.exit(0);
}

const names = want.length ? want : Object.keys(SHOTS);

for (const name of names) {
  const shot = SHOTS[name];
  if (!shot) {
    console.error(`unknown shot ${name}; known: ${Object.keys(SHOTS).join(', ')}`);
    process.exit(1);
  }
  const out = join(root, 'docs/img', `${name}.jpg`);
  process.stdout.write(`${name}… `);
  run({ BP_SNAPSHOT: out, BP_SNAPSHOT_SMALL: join(root, 'site/img', `${name}-900.jpg`), BP_SNAPSHOT_HASH: shot.hash }, shot.delay);
  if (!existsSync(out)) {
    console.log('failed');
    continue;
  }
  copyFileSync(out, join(root, 'site/img', `${name}.jpg`));
  console.log('ok');
}
