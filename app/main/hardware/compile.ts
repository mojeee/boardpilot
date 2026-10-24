// "Check with compiler" in the Code panel: the project's files are written to a temporary sketch
// folder and compiled with arduino-cli for the board's FQBN. Read-only for the board (nothing is
// uploaded) and for the user's files (only the app's temp folder is written). arduino-cli is
// optional: without it the Code panel still checks the code against the drawing.

import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BoardDef, ProjectFile } from '@shared/types';
import { isSafeProjectPath } from '@shared/starter/common';
import { parseCompileOutput, type CompileReport } from '@shared/compileOutput';
import { t } from '@shared/i18n';
import { DriverError } from './errors';
import { findTool, runTool } from './tools/proc';

const IS_WIN = process.platform === 'win32';
/** A first ESP32 build compiles the whole core: a few minutes on a slow computer. */
const COMPILE_TIMEOUT_MS = 8 * 60_000;
const MAX_FILES = 40;
const MAX_BYTES = 2 * 1024 * 1024;

/** Where the Arduino IDE 2 keeps its own copy of arduino-cli. */
function ideDirs(): string[] {
  if (process.platform === 'darwin') return ['/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources', join(homedir(), 'Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources')];
  if (IS_WIN) return [join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'Arduino IDE', 'resources', 'app', 'lib', 'backend', 'resources')];
  return ['/usr/lib/arduino-ide/resources/app/lib/backend/resources', '/opt/arduino-ide/resources/app/lib/backend/resources'];
}

function arduinoCli() {
  return findTool('arduino-cli', ['arduino-cli'], ideDirs(), ['version'], {
    message: t('The compiler (arduino-cli) is not installed.'),
    hint: IS_WIN
      ? t('Install the Arduino IDE 2 (it brings arduino-cli), or arduino-cli from arduino.cc, then try again. The check against the drawing works without it.')
      : t('Install it with “brew install arduino-cli”, or install the Arduino IDE 2, then try again. The check against the drawing works without it.'),
  });
}

/** The files as arduino-cli wants them: a folder named like the .ino file. Throws on anything unsafe. */
export function validateProject(files: unknown, main: unknown): { files: ProjectFile[]; main: string } {
  const ok =
    typeof main === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}\.ino$/.test(main) &&
    Array.isArray(files) &&
    files.length > 0 &&
    files.length <= MAX_FILES &&
    files.every((f: unknown) => typeof f === 'object' && f !== null && isSafeProjectPath((f as ProjectFile).name) && typeof (f as ProjectFile).text === 'string') &&
    files.some((f: ProjectFile) => f.name === main) &&
    files.reduce((n: number, f: ProjectFile) => n + f.text.length, 0) <= MAX_BYTES &&
    new Set(files.map((f: ProjectFile) => f.name.toLowerCase())).size === files.length;
  if (!ok)
    throw new DriverError(
      'bad_project',
      t('These files cannot be compiled as an Arduino sketch.'),
      t('The main file must be an .ino file with a simple name (letters, digits, - and _). ESP-IDF, Pico SDK and STM32 projects build with their own tools: see their README.'),
    );
  return { files: files as ProjectFile[], main: main as string };
}

let busy = false;

export async function compileProject(board: BoardDef, rawFiles: unknown, rawMain: unknown): Promise<CompileReport> {
  if (busy) throw new DriverError('busy', t('The compiler is already running.'), t('Wait for it to finish, then try again.'));
  busy = true;
  try {
    return await compile(board, rawFiles, rawMain);
  } finally {
    busy = false;
  }
}

async function compile(board: BoardDef, rawFiles: unknown, rawMain: unknown): Promise<CompileReport> {
  const { files, main } = validateProject(rawFiles, rawMain);
  const fqbn = board.toolchain.fqbn;
  if (!fqbn) throw new DriverError('no_fqbn', t('This board has no Arduino board name, so it cannot be compiled here.'), t('Build it with the board’s own tools.'));
  const tool = await arduinoCli();
  const root = join(tmpdir(), 'boardpilot-build');
  const dir = join(root, main.replace(/\.ino$/, ''));
  rmSync(dir, { recursive: true, force: true });
  for (const f of files) {
    const path = join(dir, ...f.name.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.text);
  }
  // The compiler prints real paths (/private/var/… on macOS, where the temp folder is a link).
  const real = realpathSync(dir);
  const started = Date.now();
  let r;
  try {
    r = await runTool(tool, ['compile', '--fqbn', fqbn, '--build-path', join(root, '.build', board.id), '--warnings', 'default', '--no-color', real], {
      timeoutMs: COMPILE_TIMEOUT_MS,
    });
  } catch (e) {
    if (e instanceof DriverError && e.code === 'timeout')
      throw new DriverError('timeout', t('The compiler did not finish in time.'), t('The first build for a board takes longest. Try again: later builds are faster.'));
    throw e;
  }
  const parsed = parseCompileOutput(r.out, real, files.map((f) => f.name), fqbn);
  return { ok: r.code === 0, ms: Date.now() - started, ...parsed };
}
