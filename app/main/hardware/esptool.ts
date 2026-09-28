// esptool wrapper: finds the tool, runs it as a child process, parses its output.
// Supports esptool v5 (`esptool`, hyphenated commands like `flash-id`) and v4 (`esptool.py`, `flash_id`).

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ChipInfo, UsbBridge } from '@shared/types';
import { DriverError } from './errors';
import { t } from '@shared/i18n';

export interface EsptoolCommand {
  cmd: string;
  baseArgs: string[];
  major: number;
  version: string;
}

/** Apps started from Finder get a minimal PATH; add the usual places pip and Homebrew install to. */
export function toolPath(): string {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')];
  const pyUser = join(homedir(), 'Library/Python');
  if (existsSync(pyUser)) {
    for (const v of readdirSync(pyUser)) extra.push(join(pyUser, v, 'bin'));
  }
  return [...extra, process.env.PATH ?? ''].join(':');
}

interface RunResult {
  code: number | null;
  out: string;
}

function run(cmd: string, args: string[], timeoutMs: number, onLine?: (l: string) => void): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let out = '';
    let tail = '';
    const child = spawn(cmd, args, { env: { ...process.env, PATH: toolPath() } });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new DriverError(
          'timeout',
          t('esptool did not finish in time.'),
          t('Unplug the board, plug it back in and try again. If it keeps happening, hold BOOT while it connects.'),
        ),
      );
    }, timeoutMs);
    const onData = (b: Buffer) => {
      const s = b.toString();
      out += s;
      tail += s;
      const parts = tail.split(/\r|\n/);
      tail = parts.pop() ?? '';
      for (const p of parts) if (p.trim()) onLine?.(p);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') reject(new DriverError('esptool_missing', t('esptool is not installed.'), t('Open Terminal and run: pip3 install esptool')));
      else reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

let cached: EsptoolCommand | null = null;

export async function findEsptool(): Promise<EsptoolCommand> {
  if (cached) return cached;
  const candidates: { cmd: string; baseArgs: string[] }[] = [
    { cmd: 'esptool', baseArgs: [] },
    { cmd: 'esptool.py', baseArgs: [] },
    { cmd: 'python3', baseArgs: ['-m', 'esptool'] },
  ];
  for (const c of candidates) {
    try {
      const r = await run(c.cmd, [...c.baseArgs, 'version'], 15000);
      const m = /esptool(?:\.py)?\s+v?(\d+)\.(\d+)(?:\.(\d+))?/i.exec(r.out);
      if (r.code === 0 && m) {
        cached = { ...c, major: Number(m[1]), version: `${m[1]}.${m[2]}.${m[3] ?? '0'}` };
        return cached;
      }
    } catch {
      /* try the next one */
    }
  }
  throw new DriverError(
    'esptool_missing',
    t('The app could not find esptool, the tool that talks to the ESP32 chip.'),
    t('Open Terminal and run: pip3 install esptool. Then restart BoardPilot.'),
  );
}

/** v5 uses hyphenated command names; v4 uses underscores. */
export function commandName(tool: EsptoolCommand, name: 'flash-id' | 'read-flash' | 'write-flash' | 'chip-id'): string {
  return tool.major >= 5 ? name : name.replace(/-/g, '_');
}

/** Map esptool's error output to a plain-language error. */
export function classifyEsptoolError(out: string): DriverError {
  if (/Resource busy|exclusively lock|Errno 16|port is busy/i.test(out)) {
    return new DriverError(
      'port_busy',
      t('Another program is using this port, so the app cannot talk to the board.'),
      t('Close any serial monitor (Arduino IDE, PlatformIO, screen, another BoardPilot window) and try again.'),
    );
  }
  if (/No serial data received|Wrong boot mode|Timed out waiting for packet header|Failed to connect/i.test(out)) {
    return new DriverError(
      'no_sync',
      t('The board did not answer when the app tried to wake it up.'),
      t('Hold the BOOT button, press and release EN, then release BOOT and try again. Some boards need this every time.'),
    );
  }
  if (/could not open port|No such file or directory|device not configured/i.test(out)) {
    return new DriverError('port_gone', t('The board disappeared while the app was talking to it.'), t('Check the USB cable is firmly plugged in, then search for boards again.'));
  }
  if (/Permission denied/i.test(out)) {
    return new DriverError('permission', t('macOS did not allow the app to open the port.'), t('Unplug and replug the board. If you installed a driver, allow it in System Settings → Privacy & Security.'));
  }
  const last = out.trim().split('\n').slice(-2).join(' ').slice(0, 300);
  return new DriverError('esptool_failed', t('esptool reported a problem: {detail}', { detail: last }), t('Unplug the board, plug it back in and try again.'));
}

/** Parses both v4 and v5 output of flash_id / flash-id. */
export function parseChipInfo(out: string, port: string, bridge: UsbBridge): ChipInfo {
  const chipM = /(?:Chip is|Chip type:)\s*([^\n(]+?)\s*(?:\((revision [^)]+)\))?\s*$/im.exec(out);
  const featM = /Features:\s*(.+)$/im.exec(out);
  const xtalM = /Crystal (?:is|frequency:)\s*(\d+)\s*MHz/i.exec(out);
  const macM = /MAC:\s*([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i.exec(out);
  const flashM = /Detected flash size:\s*(\d+)\s*(MB|KB)/i.exec(out);
  const verM = /esptool(?:\.py)?\s+v?(\d+\.\d+(?:\.\d+)?)/i.exec(out);
  if (!chipM || !macM) {
    throw new DriverError('parse_failed', t('The board answered, but the app could not read its details.'), t('Try again. If it repeats, update esptool: pip3 install -U esptool'));
  }
  const flashBytes = flashM ? Number(flashM[1]) * (flashM[2].toUpperCase() === 'MB' ? 1024 * 1024 : 1024) : undefined;
  return {
    port,
    chip: chipM[1].trim(),
    revision: chipM[2]?.replace(/^revision\s*/i, ''),
    features: featM ? featM[1].split(',').map((s) => s.trim()).filter(Boolean) : [],
    crystalMHz: xtalM ? Number(xtalM[1]) : undefined,
    mac: macM[1].toUpperCase(),
    flashSize: flashM ? `${flashM[1]}${flashM[2].toUpperCase()}` : 'unknown',
    flashBytes,
    bridge,
    toolVersion: verM?.[1],
  };
}

export function parseProgress(line: string): number | null {
  const m = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(line);
  return m ? Math.min(100, Number(m[1])) : null;
}

export async function esptool(
  port: string,
  args: string[],
  opts: { timeoutMs: number; baud?: number; onProgress?: (pct: number) => void },
): Promise<string> {
  const tool = await findEsptool();
  const full = [...tool.baseArgs, '--port', port, ...(opts.baud ? ['--baud', String(opts.baud)] : []), ...args];
  const r = await run(tool.cmd, full, opts.timeoutMs, (l) => {
    const p = parseProgress(l);
    if (p !== null) opts.onProgress?.(p);
  });
  if (r.code !== 0) throw classifyEsptoolError(r.out);
  return r.out;
}
