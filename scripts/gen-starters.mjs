// Writes the starter project of every template on every board that offers a toolchain into a
// folder, one subfolder per board and template (<out>/<board>/<template>/). Used by the nightly
// firmware job (.github/workflows/nightly-firmware.yml), which then builds each one with the real
// SDK: scripts/build-starters.sh (Pico SDK), build-starters-esp-idf.sh, build-starters-stm32.sh.
//
//   node scripts/gen-starters.mjs <out-dir> [--toolchain pico-sdk|esp-idf|stm32-hal] [board-id ...]
//
// The toolchain defaults to pico-sdk. Templates that do not fit a board (templateFits) are skipped.
// The generator is TypeScript that uses import.meta.glob (boards, parts, templates), so it is
// loaded through Vite's SSR module loader (Vite is already a dev dependency), with the same
// aliases as vitest.config.ts.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tcAt = args.indexOf('--toolchain');
const toolchain = tcAt >= 0 ? args[tcAt + 1] : 'pico-sdk';
if (tcAt >= 0) args.splice(tcAt, 2);
const out = resolve(args[0] ?? join(root, 'out', 'starters'));
const only = args.slice(1);

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
  const { TEMPLATES, templateScene, templateFits } = await server.ssrLoadModule('/shared/templates.ts');
  const { generateStarter, starterToolchains, isSafeProjectPath } = await server.ssrLoadModule('/shared/starter/index.ts');
  if (!['pico-sdk', 'esp-idf', 'stm32-hal'].includes(toolchain)) throw new Error(`unknown toolchain ${toolchain}`);
  const boards = Object.values(BOARDS).filter((b) => starterToolchains(b).includes(toolchain) && (!only.length || only.includes(b.id)));
  if (!boards.length) throw new Error(`no ${toolchain} board matches ${only.join(', ') || '(all)'}`);
  for (const board of boards) {
    for (const tpl of TEMPLATES) {
      if (templateFits(tpl, board)) continue;
      const scene = templateScene(tpl, board, PARTS);
      const project = generateStarter(toolchain, scene, board, PARTS, { name: tpl.name });
      const dir = join(out, board.id, tpl.id);
      for (const f of project.files) {
        if (!isSafeProjectPath(f.name)) throw new Error(`unsafe file name ${f.name}`);
        mkdirSync(dirname(join(dir, f.name)), { recursive: true });
        writeFileSync(join(dir, f.name), f.text);
      }
      for (const n of project.notes) console.log(`  note ${board.id}/${tpl.id}: ${n}`);
      const detail = { 'pico-sdk': `PICO_BOARD=${board.toolchain.picoBoard}`, 'esp-idf': `IDF target ${board.toolchain.idfTarget}`, 'stm32-hal': board.toolchain.stm32Hal?.device }[toolchain];
      console.log(`${board.id}/${tpl.id} (${detail})`);
      count++;
    }
  }
} finally {
  await server.close();
}
console.log(`${count} ${toolchain} projects in ${out}`);
