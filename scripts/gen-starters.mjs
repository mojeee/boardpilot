// Writes the Pico SDK starter project of every template on every Pico SDK board into a folder,
// one subfolder per template and board (<out>/<board>/<template>/). Used by the nightly firmware
// job (.github/workflows/nightly-firmware.yml), which then builds each one with the real SDK.
//
//   node scripts/gen-starters.mjs <out-dir> [board-id ...]
//
// The generator is TypeScript that uses import.meta.glob (boards, parts, templates), so it is
// loaded through Vite's SSR module loader (Vite is already a dev dependency), with the same
// aliases as vitest.config.ts.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'out', 'starters'));
const only = process.argv.slice(3);

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: {
      '@shared': join(root, 'shared'),
      '@boards': join(root, 'boards'),
      '@parts': join(root, 'parts'),
      '@flows': join(root, 'flows'),
    },
  },
});

let count = 0;
try {
  const { BOARDS, PARTS } = await server.ssrLoadModule('/shared/board.ts');
  const { TEMPLATES, templateScene } = await server.ssrLoadModule('/shared/templates.ts');
  const { generateStarter, starterToolchains } = await server.ssrLoadModule('/shared/starter/index.ts');
  const boards = Object.values(BOARDS).filter((b) => starterToolchains(b).includes('pico-sdk') && (!only.length || only.includes(b.id)));
  if (!boards.length) throw new Error(`no Pico SDK board matches ${only.join(', ') || '(all)'}`);
  for (const board of boards) {
    for (const tpl of TEMPLATES) {
      const scene = templateScene(tpl, board, PARTS);
      const project = generateStarter('pico-sdk', scene, board, PARTS, { name: tpl.name });
      const dir = join(out, board.id, tpl.id);
      mkdirSync(dir, { recursive: true });
      for (const f of project.files) writeFileSync(join(dir, f.name), f.text);
      for (const n of project.notes) console.log(`  note ${board.id}/${tpl.id}: ${n}`);
      console.log(`${board.id}/${tpl.id} (PICO_BOARD=${board.toolchain.picoBoard})`);
      count++;
    }
  }
} finally {
  await server.close();
}
console.log(`${count} projects in ${out}`);
