#!/usr/bin/env node
// Builds a single-file esptool with PyInstaller into resources/esptool/<mac|win>/, so users do not
// need Python. Run it on the OS you are packaging for (macOS for the .dmg, Windows for the .exe);
// PyInstaller cannot cross-compile. The release workflow runs it when the repository variable
// BUNDLE_ESPTOOL is "true". findEsptool() (app/main/hardware/esptool.ts) prefers this copy.
//
//   node scripts/build-esptool.mjs            (needs Python 3.9+ with pip)
//   ESPTOOL_VERSION=5.0.2 node scripts/build-esptool.mjs
//
// Not tested on a real board from this repository's CI yet: after the first build, run the binary
// with "version" and then connect a board once (docs/hardware-setup.md).

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OS_DIR = { win32: 'win', darwin: 'mac' }[process.platform];
if (!OS_DIR) {
  console.error('The bundled esptool is only built on macOS and Windows.');
  process.exit(1);
}
const exe = process.platform === 'win32' ? 'esptool.exe' : 'esptool';
const py = process.platform === 'win32' ? 'python' : 'python3';
const version = process.env.ESPTOOL_VERSION ?? '5.0.2';
const work = join(ROOT, 'build', 'esptool-pyinstaller');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) {
    console.error(`Failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

rmSync(work, { recursive: true, force: true });
run(py, ['-m', 'pip', 'install', '--upgrade', 'pyinstaller', `esptool==${version}`]);
run(py, [
  '-m', 'PyInstaller', '--onefile', '--clean', '--noconfirm',
  '--name', 'esptool',
  '--collect-all', 'esptool',
  '--distpath', join(work, 'dist'),
  '--workpath', join(work, 'work'),
  '--specpath', work,
  join(ROOT, 'scripts', 'esptool_entry.py'),
]);
const built = join(work, 'dist', exe);
if (!existsSync(built)) {
  console.error('PyInstaller did not produce ' + built);
  process.exit(1);
}
const dest = join(ROOT, 'resources', 'esptool', OS_DIR);
mkdirSync(dest, { recursive: true });
copyFileSync(built, join(dest, exe));
run(join(dest, exe), ['version']);
console.log(`Bundled esptool ${version} written to resources/esptool/${OS_DIR}/${exe}`);
