// Shared helpers for the chip tools (avrdude, picotool, STM32 tools, nrfjprog, Teensy loader):
// find the executable, run it with a timeout, stream its output, map failures to plain language.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BoardDef, ChipInfo, PortInfo } from '@shared/types';
import { DriverError } from '../errors';
import { toolPath } from '../esptool';
import { t } from '@shared/i18n';

const IS_WIN = process.platform === 'win32';

export interface Tool {
  /** Name shown in messages, e.g. "avrdude". */
  name: string;
  cmd: string;
  baseArgs: string[];
}

export interface ToolCtx {
  board: BoardDef;
  port: string;
  portInfo?: PortInfo;
}

/** What a flashing tool can do for a board family. The hub checks tokens and backups before calling write methods. */
export interface ChipTool {
  readonly name: string;
  /** False when the hardware cannot read its program back (Teensy). */
  readonly canBackup: boolean;
  /** File extension of backups made by this tool. */
  readonly backupExt: '.bin' | '.hex';
  identify(ctx: ToolCtx): Promise<ChipInfo>;
  backup(ctx: ToolCtx, chip: ChipInfo, path: string, onProgress?: (pct: number) => void): Promise<void>;
  restore(ctx: ToolCtx, path: string, onProgress?: (pct: number) => void): Promise<void>;
  /** Write one image file (bin, uf2 or hex, as the board's toolchain says). offset is used for .bin files. */
  flash(ctx: ToolCtx, file: string, offset: number, onProgress?: (pct: number) => void): Promise<void>;
}

/** The Arduino IDE / arduino-cli data folder, where board cores keep their tools. */
export function arduinoDataDir(): string {
  if (IS_WIN) return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Arduino15');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Arduino15');
  return join(homedir(), '.arduino15');
}

/** Newest version folder of a tool installed by an Arduino core: packages/<vendor>/tools/<tool>/<version>/. */
export function arduinoToolDirs(vendor: string, tool: string): string[] {
  const base = join(arduinoDataDir(), 'packages', vendor, 'tools', tool);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap((v) => [join(base, v), join(base, v, 'bin')]);
}

export interface RunResult {
  code: number | null;
  out: string;
}

export function runTool(
  tool: Tool,
  args: string[],
  opts: { timeoutMs: number; onLine?: (line: string) => void; missingHint?: string },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let out = '';
    let tail = '';
    const child = spawn(tool.cmd, [...tool.baseArgs, ...args], { env: { ...process.env, PATH: toolPath() }, windowsHide: true });
    const timer = setTimeout(() => {
      child.kill(IS_WIN ? undefined : 'SIGKILL');
      reject(
        new DriverError(
          'timeout',
          t('{tool} did not finish in time.', { tool: tool.name }),
          t('Unplug the board, plug it back in and try again.'),
        ),
      );
    }, opts.timeoutMs);
    const onData = (b: Buffer) => {
      const s = b.toString();
      out += s;
      tail += s;
      const parts = tail.split(/\r|\n/);
      tail = parts.pop() ?? '';
      for (const p of parts) if (p.trim()) opts.onLine?.(p);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') reject(new DriverError(`${tool.name}_missing`, t('{tool} is not installed.', { tool: tool.name }), opts.missingHint ?? ''));
      else reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const found = new Map<string, Tool>();

/**
 * Find a tool: first on PATH (plus Homebrew and pip folders), then in the given folders (tools that
 * Arduino cores install). `probeArgs` must make the tool print something and exit 0 (or any code
 * when `anyExit`).
 */
export async function findTool(
  name: string,
  names: string[],
  dirs: string[],
  probeArgs: string[],
  missing: { message: string; hint: string },
  anyExit = false,
): Promise<Tool> {
  const hit = found.get(name);
  if (hit) return hit;
  const exe = (n: string) => (IS_WIN && !n.endsWith('.exe') ? `${n}.exe` : n);
  const candidates: Tool[] = [
    ...names.map((n) => ({ name, cmd: exe(n), baseArgs: [] })),
    ...dirs.flatMap((d) => names.map((n) => ({ name, cmd: join(d, exe(n)), baseArgs: [] }))).filter((c) => existsSync(c.cmd)),
  ];
  for (const c of candidates) {
    try {
      const r = await runTool(c, probeArgs, { timeoutMs: 10000 });
      if (anyExit || r.code === 0) {
        found.set(name, c);
        return c;
      }
    } catch {
      /* next */
    }
  }
  throw new DriverError(`${name}_missing`, missing.message, missing.hint);
}

/** Last useful lines of a tool's output, for "the tool said: …" messages. */
export function lastLines(out: string, n = 2): string {
  return out
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n)
    .join(' ')
    .slice(0, 300);
}

/** Errors every tool reports the same way. Returns null if nothing matched. */
export function commonToolError(out: string): DriverError | null {
  if (/Resource busy|exclusively lock|port is busy|Access is denied|ser_open\(\): can't open device.*busy/i.test(out)) {
    return new DriverError(
      'port_busy',
      t('Another program is using this port, so the app cannot talk to the board.'),
      t('Close any serial monitor (Arduino IDE, PlatformIO, screen, another BoardPilot window) and try again.'),
    );
  }
  if (/Permission denied|LIBUSB_ERROR_ACCESS/i.test(out)) {
    return new DriverError(
      'permission',
      t('The system did not allow the app to open the board.'),
      process.platform === 'linux'
        ? t('Add the udev rules for this board (see the board’s documentation), then unplug and replug it.')
        : t('Unplug and replug the board. If you installed a driver, allow it in the system settings.'),
    );
  }
  return null;
}

/** Progress from lines like "Writing | ####### | 45%" or "[=====     ] 45%". */
export function percentFromLine(line: string): number | null {
  const m = /(\d{1,3})\s?%/.exec(line);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 100 ? n : null;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
