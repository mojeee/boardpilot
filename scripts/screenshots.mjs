// Takes the README and website screenshots from the real app in simulator mode, so the pictures
// always show the current UI. Needs a build first (npm run build). On Linux without a display it
// runs under xvfb-run with software WebGL.
//   node scripts/screenshots.mjs            every shot
//   node scripts/screenshots.mjs live test  some shots
//   node scripts/screenshots.mjs boards     the 3D view of every board, for the social images
// Captures at 2x pixel density, then writes docs/img/<name>.jpg (2400 px wide, for the README),
// site/img/<name>.jpg (1800 px) and site/img/<name>-900.jpg (900 px), all sharp on retina screens;
// "boards" writes site/img/boards/<id>-3d.png (then run: npx electron scripts/render-social.cjs boards).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** name → hash for the app window and how long the scripted demo needs before the capture (ms). */
// Every shot sets the 3D look (&detail, &light) so a choice remembered by an earlier run does not leak in.
const LOOK = '&detail=full&light=studio';
const SHOTS = {
  workspace: { hash: `#demo=workspace&stage=desk${LOOK}`, delay: 30000 },
  home: { hash: '#screen=home', delay: 6000 },
  live: { hash: `#demo=live&stage=desk${LOOK}`, delay: 26000 },
  debug: { hash: `#demo=debug&scenario=weather-station-swapped&stage=desk${LOOK}`, delay: 32000 },
  test: { hash: `#demo=test&scenario=weather-station-swapped&stage=desk${LOOK}`, delay: 30000 },
  monitor: { hash: `#demo=monitor&scenario=healthy${LOOK}`, delay: 16000 },
  library: { hash: `#demo=library&stage=desk${LOOK}`, delay: 20000 },
  schematic: { hash: `#demo=template&id=smart-room-monitor&view=diagram&diagram=schematic&speed=1${LOOK}`, delay: 12000 },
  timing: { hash: `#demo=timing&scenario=healthy${LOOK}`, delay: 22000 },
  learn: { hash: `#demo=lesson-preview&lesson=gpio&stage=desk${LOOK}`, delay: 14000 },
  code: { hash: `#demo=code&stage=desk${LOOK}`, delay: 14000 },
  newproject: { hash: `#demo=new-project&mode=port&scenario=weather-station-swapped${LOOK}`, delay: 26000 },
  export: { hash: `#demo=export&id=weather-station${LOOK}`, delay: 12000 },
  import: { hash: `#demo=import${LOOK}`, delay: 30000 },
};

/** The 3D viewport inside the 1600 × 1000 window: under the top menu and the project tabs, left of the assistant, above the Code/Log panel. */
const VIEWPORT = '0,84,1200,666';

const want = process.argv.slice(2);
const headless = process.platform === 'linux' && !process.env.DISPLAY;

/** A fresh app profile for every shot: nothing remembered by an earlier run leaks into the picture. */
const profile = () => mkdtempSync(join(tmpdir(), 'bp-shot-'));

function run(env, delay) {
  const electron = ['electron', '.', '--no-sandbox', '--force-device-scale-factor=2', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const cmd = headless ? 'xvfb-run' : 'npx';
  const args = headless ? ['-a', '-s', '-screen 0 3300x2100x24', 'npx', ...electron] : electron;
  spawnSync(cmd, args, { cwd: root, env: { ...process.env, BP_PROFILE: profile(), ...env, BP_SNAPSHOT_DELAY: String(delay) }, stdio: 'ignore', timeout: delay + 60000 });
}

if (want[0] === 'boards') {
  mkdirSync(join(root, 'site/img/boards'), { recursive: true });
  const ids = want.length > 1 ? want.slice(1) : readdirSync(join(root, 'boards')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  for (const id of ids) {
    const out = join(root, 'site/img/boards', `${id}-3d.png`);
    process.stdout.write(`${id}… `);
    run({ BP_SNAPSHOT: out, BP_SNAPSHOT_RECT: VIEWPORT, BP_SNAPSHOT_HASH: `#demo=board&board=${id}&stage=desk&clean=1&bare=1${LOOK}` }, 24000);
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
  run(
    {
      BP_SNAPSHOT: out,
      BP_SNAPSHOT_WIDTH: '2400',
      BP_SNAPSHOT_COPIES: `${join(root, 'site/img', `${name}.jpg`)}:1800,${join(root, 'site/img', `${name}-900.jpg`)}:900`,
      BP_SNAPSHOT_HASH: shot.hash,
    },
    shot.delay,
  );
  if (!existsSync(out)) {
    console.log('failed');
    continue;
  }
  console.log('ok');
}
