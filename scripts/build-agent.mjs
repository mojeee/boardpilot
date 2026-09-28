#!/usr/bin/env node
// Builds the BoardPilot diagnostic agent (firmware/agent) for every board that has a board file,
// and writes the flashable images to resources/agent/<boardId>/ with a manifest.json, plus
// resources/agent/index.json. Called by scripts/build-agent.sh (npm run build:agent).
//
//   node scripts/build-agent.mjs                      every board in boards/*.json
//   node scripts/build-agent.mjs rpi-pico arduino-uno-r3
//   node scripts/build-agent.mjs --install-cores      also install missing arduino-cli cores
//
// For each board it copies the sketch to firmware/agent/build/<id>/agent/, writes a bp_board.h
// generated from the board file (scripts/gen-agent-board.mjs), compiles it with arduino-cli using
// the board's toolchain.fqbn, and copies the images.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkBoard } from './check-boards.mjs';
import { generate } from './gen-agent-board.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKETCH = join(ROOT, 'firmware', 'agent');
const BUILD = join(SKETCH, 'build');
const OUT = join(ROOT, 'resources', 'agent');
const BOARDS = join(ROOT, 'boards');

const AGENT_VER = /#define AGENT_VER "([^"]+)"/.exec(readFileSync(join(SKETCH, 'bp_config.h'), 'utf8'))?.[1] ?? '0.0';

/**
 * Build options the agent needs on top of the board's toolchain.fqbn, keyed by board id
 * ("key=value", added only when the fqbn does not set that key already).
 * Black Pill: no ST-Link, so Serial must be the native USB CDC port.
 */
const FQBN_EXTRA = {
  'blackpill-f411ce': 'usb=CDCgen',
};

/** Flash offsets for esptool, per chip, with the core's default partition table
 *  (ESP-IDF "Bootloader" docs: the second-stage bootloader is at 0x1000 on ESP32 and 0x0 on
 *  ESP32-S3/C3; partition table at 0x8000; otadata (boot_app0) at 0xe000; app at 0x10000). */
const ESP_BOOTLOADER_OFFSET = { esp32: '0x1000', esp32s3: '0x0', esp32c3: '0x0', esp32s2: '0x1000' };

const say = (s) => process.stdout.write(s + '\n');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? ''), error: r.error };
}

function installedCores() {
  const r = run('arduino-cli', ['core', 'list', '--json']);
  const map = {};
  try {
    const j = JSON.parse(r.out);
    for (const p of j.platforms ?? j ?? []) {
      const id = p.id ?? p.ID;
      const ver = p.installed_version ?? p.installed ?? p.Installed;
      if (id && ver) map[id] = ver;
    }
  } catch {
    for (const line of r.out.split('\n')) {
      const m = /^(\S+:\S+)\s+(\S+)/.exec(line);
      if (m && m[1] !== 'ID') map[m[1]] = m[2];
    }
  }
  return map;
}

function withExtra(fqbn, extra) {
  if (!extra) return fqbn;
  const key = extra.split('=')[0];
  const parts = fqbn.split(':');
  if (parts.length > 3 && parts[3].split(',').some((o) => o.split('=')[0] === key)) return fqbn;
  return parts.length > 3 ? `${fqbn},${extra}` : `${fqbn}:${extra}`;
}

function arduinoDataDir() {
  const r = run('arduino-cli', ['config', 'get', 'directories.data']);
  const d = r.code === 0 ? r.out.trim() : '';
  return [d, join(homedir(), 'Library', 'Arduino15'), join(homedir(), '.arduino15'), join(homedir(), 'AppData', 'Local', 'Arduino15')].filter(Boolean);
}

function findBootApp0(coreVersion) {
  for (const dir of arduinoDataDir()) {
    const p = join(dir, 'packages', 'esp32', 'hardware', 'esp32', coreVersion, 'tools', 'partitions', 'boot_app0.bin');
    if (existsSync(p)) return p;
  }
  return null;
}

function parseSizes(out) {
  const flash = /Sketch uses (\d+) bytes .*?Maximum is (\d+) bytes/.exec(out);
  const ram = /Global variables use (\d+) bytes .*?leaving (-?\d+) bytes .*?Maximum is (\d+) bytes/.exec(out);
  // Teensy prints its own summary ("FLASH: code:N, data:N, headers:N ... RAM1: variables:N, code:N,
  // padding:N   free for local variables:N").
  const tf = /FLASH: code:(\d+), data:(\d+), headers:(\d+)\s+free for files:(\d+)/.exec(out);
  const tr = /RAM1: variables:(\d+), code:(\d+), padding:(\d+)\s+free for local variables:(\d+)/.exec(out);
  if (!flash && tf && tr) {
    const used = Number(tf[1]) + Number(tf[2]) + Number(tf[3]);
    const ram1 = Number(tr[1]) + Number(tr[2]) + Number(tr[3]);
    return { flashBytes: used, flashMax: used + Number(tf[4]), ramBytes: Number(tr[1]), ramFree: Number(tr[4]), ramMax: ram1 + Number(tr[4]) };
  }
  return {
    flashBytes: flash ? Number(flash[1]) : null,
    flashMax: flash ? Number(flash[2]) : null,
    ramBytes: ram ? Number(ram[1]) : null,
    ramFree: ram ? Number(ram[2]) : null,
    ramMax: ram ? Number(ram[3]) : null,
  };
}

function loadBoards(ids) {
  const files = readdirSync(BOARDS).filter((f) => f.endsWith('.json'));
  const all = [];
  for (const f of files) {
    const id = f.replace(/\.json$/, '');
    if (ids.length && !ids.includes(id)) continue;
    let b;
    try {
      b = JSON.parse(readFileSync(join(BOARDS, f), 'utf8'));
    } catch (e) {
      say(`- ${id}: skipped, the board file is not valid JSON (${e.message}).`);
      continue;
    }
    const errs = checkBoard(b);
    if (errs.length) {
      say(`- ${id}: skipped, the board file does not pass scripts/check-boards.mjs (${errs[0]}${errs.length > 1 ? ', ...' : ''}).`);
      continue;
    }
    all.push(b);
  }
  for (const id of ids) if (!all.some((b) => b.id === id) && !existsSync(join(BOARDS, `${id}.json`))) say(`- ${id}: no board file boards/${id}.json.`);
  return all;
}

function buildBoard(b, cores) {
  const tc = b.toolchain;
  const coreVersion = cores[tc.core];
  if (!coreVersion) {
    return { ok: false, why: `core ${tc.core} is not installed (arduino-cli core install ${tc.core}${tc.coreUrl ? ` --additional-urls ${tc.coreUrl}` : ''})` };
  }
  const fqbn = withExtra(tc.fqbn, FQBN_EXTRA[b.id]);
  const work = join(BUILD, b.id);
  const sketch = join(work, 'agent');
  const out = join(work, 'out');
  rmSync(sketch, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
  mkdirSync(sketch, { recursive: true });
  for (const f of readdirSync(SKETCH)) {
    if (/\.(ino|h|cpp|c)$/.test(f) && f !== 'bp_board.h') copyFileSync(join(SKETCH, f), join(sketch, f));
  }
  writeFileSync(join(sketch, 'bp_board.h'), generate(b));

  say(`- ${b.id}: compiling with ${tc.core} ${coreVersion} (${fqbn})...`);
  // UTF-8 locale: the Adafruit nRF52 post-build step (adafruit-nrfutil, Python Click) aborts under
  // an ASCII locale.
  const env = { ...process.env, LC_ALL: process.env.LC_ALL || 'en_US.UTF-8', LANG: process.env.LANG || 'en_US.UTF-8' };
  const r = run('arduino-cli', ['compile', '--fqbn', fqbn, '--build-path', join(work, 'build'), '--output-dir', out, sketch], { env });
  if (r.code !== 0) {
    const errLines = r.out.split('\n').filter((l) => /error/i.test(l)).slice(0, 8).join('\n    ');
    return { ok: false, why: `compile failed:\n    ${errLines || r.out.slice(-800)}` };
  }
  const sizes = parseSizes(r.out);

  const dest = join(OUT, b.id);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const parts = [];
  const take = (src, name, offset) => {
    const p = join(out, src);
    if (!existsSync(p)) throw new Error(`the build did not produce ${src}`);
    copyFileSync(p, join(dest, name));
    parts.push({ offset, file: name });
  };
  try {
    if (tc.flasher === 'esptool') {
      const chip = tc.esptoolChip ?? 'esp32';
      const boot = ESP_BOOTLOADER_OFFSET[chip];
      if (!boot) throw new Error(`unknown esptool chip ${chip}`);
      take('agent.ino.bootloader.bin', 'bootloader.bin', boot);
      take('agent.ino.partitions.bin', 'partitions.bin', '0x8000');
      const bootApp0 = findBootApp0(coreVersion);
      if (bootApp0) {
        copyFileSync(bootApp0, join(dest, 'boot_app0.bin'));
        parts.push({ offset: '0xe000', file: 'boot_app0.bin' });
      } else {
        say(`  Warning: boot_app0.bin was not found in the esp32 core. It is left out of the manifest.`);
      }
      take('agent.ino.bin', 'agent.bin', '0x10000');
    } else if (tc.imageFormat === 'uf2') {
      take('agent.ino.uf2', 'agent.uf2', '0x0');
    } else if (tc.imageFormat === 'hex') {
      take('agent.ino.hex', 'agent.hex', '0x0');
    } else if (tc.imageFormat === 'bin') {
      // STM32: the application starts at the beginning of the internal flash (RM0368 / RM0383,
      // section "Memory map": flash at 0x0800 0000). Other bin targets are flashed from 0 too.
      take('agent.ino.bin', 'agent.bin', tc.flasher === 'stm32' ? '0x08000000' : '0x0');
    } else {
      throw new Error(`unknown image format ${tc.imageFormat}`);
    }
  } catch (e) {
    rmSync(dest, { recursive: true, force: true });
    return { ok: false, why: e.message };
  }

  const manifest = { name: 'bp-agent', ver: AGENT_VER, board: b.id, fqbn, format: tc.imageFormat, parts };
  if (tc.esptoolChip) manifest.chip = tc.esptoolChip;
  writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { ok: true, fqbn, core: tc.core, coreVersion, format: tc.imageFormat, sizes, files: parts.map((p) => p.file) };
}

function main() {
  const args = process.argv.slice(2);
  const ids = args.filter((a) => !a.startsWith('--'));
  const installCores = args.includes('--install-cores');

  if (run('arduino-cli', ['version']).error) {
    say('arduino-cli is not installed, so the agent firmware cannot be built. Install it (brew install arduino-cli) and run this again.');
    say('End users do not need this: the app ships the prebuilt agent in resources/agent/.');
    process.exit(1);
  }

  const boards = loadBoards(ids);
  if (!boards.length) {
    say('No board to build.');
    process.exit(1);
  }

  let cores = installedCores();
  if (installCores) {
    const missing = [...new Map(boards.filter((b) => !cores[b.toolchain.core]).map((b) => [b.toolchain.core, b.toolchain.coreUrl])).entries()];
    const urls = [...new Set(boards.map((b) => b.toolchain.coreUrl).filter(Boolean))].join(',');
    if (missing.length) {
      run('arduino-cli', ['core', 'update-index', ...(urls ? ['--additional-urls', urls] : [])], { stdio: 'inherit' });
      for (const [core] of missing) {
        say(`Installing ${core}...`);
        run('arduino-cli', ['core', 'install', core, ...(urls ? ['--additional-urls', urls] : [])], { stdio: 'inherit' });
      }
      cores = installedCores();
    }
  }

  mkdirSync(OUT, { recursive: true });
  const indexPath = join(OUT, 'index.json');
  let index = { name: 'bp-agent', ver: AGENT_VER, cores: {}, boards: [] };
  if (existsSync(indexPath)) {
    try {
      const old = JSON.parse(readFileSync(indexPath, 'utf8'));
      if (old.ver === AGENT_VER && Array.isArray(old.boards)) index = { ...index, cores: old.cores ?? {}, boards: old.boards };
    } catch {
      /* rebuilt below */
    }
  }

  const failed = [];
  for (const b of boards) {
    const r = buildBoard(b, cores);
    index.boards = index.boards.filter((e) => e.board !== b.id);
    if (!r.ok) {
      say(`- ${b.id}: FAILED: ${r.why}`);
      failed.push(b.id);
      continue;
    }
    const s = r.sizes;
    say(
      `  ok: ${r.files.join(', ')}; flash ${s.flashBytes ?? '?'} of ${s.flashMax ?? '?'} bytes, RAM ${s.ramBytes ?? '?'} of ${s.ramMax ?? '?'} bytes (${s.ramFree ?? '?'} free for the stack)`,
    );
    index.cores[r.core] = r.coreVersion;
    index.boards.push({
      board: b.id,
      ver: AGENT_VER,
      fqbn: r.fqbn,
      core: r.core,
      coreVersion: r.coreVersion,
      format: r.format,
      flashBytes: s.flashBytes,
      ramBytes: s.ramBytes,
      ramFreeBytes: s.ramFree,
    });
  }
  // Keep only boards whose folder is still there.
  index.boards = index.boards.filter((e) => existsSync(join(OUT, e.board, 'manifest.json'))).sort((a, b) => a.board.localeCompare(b.board));
  const usedCores = new Set(index.boards.map((e) => e.core));
  for (const c of Object.keys(index.cores)) if (!usedCores.has(c)) delete index.cores[c];
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');

  // The flat single-board layout of agent 0.1 is replaced by resources/agent/<boardId>/.
  if (existsSync(join(OUT, 'esp32-devkitc-30', 'manifest.json'))) {
    for (const f of ['agent.bin', 'bootloader.bin', 'partitions.bin', 'boot_app0.bin', 'manifest.json']) {
      if (existsSync(join(OUT, f))) {
        rmSync(join(OUT, f));
        say(`Removed the old resources/agent/${f} (now in resources/agent/esp32-devkitc-30/).`);
      }
    }
  }

  say(`Done: ${index.boards.length} board(s) in resources/agent/ (index.json).${failed.length ? ` Failed: ${failed.join(', ')}.` : ''}`);
  process.exit(failed.length ? 2 : 0);
}

main();
