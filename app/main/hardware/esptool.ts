// esptool wrapper: finds the tool, runs it as a child process, parses its output.
// Supports esptool v5 (`esptool`, hyphenated commands like `flash-id`) and v4 (`esptool.py`, `flash_id`).

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { readdirSync, existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { ChipInfo, UsbBridge } from '@shared/types';
import { DriverError } from './errors';
import { t } from '@shared/i18n';

export interface EsptoolCommand {
  cmd: string;
  baseArgs: string[];
  major: number;
  version: string;
}

const IS_WIN = process.platform === 'win32';

/** Where pip puts Python scripts on Windows: %APPDATA%\Python\Python3xx\Scripts and the per-user install. */
function windowsPythonDirs(): string[] {
  const dirs: string[] = [];
  const roots = [
    process.env.APPDATA && join(process.env.APPDATA, 'Python'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Python'),
  ].filter((x): x is string => !!x);
  for (const r of roots) {
    if (!existsSync(r)) continue;
    for (const v of readdirSync(r)) {
      dirs.push(join(r, v, 'Scripts'), join(r, v));
    }
  }
  return dirs;
}

/** Apps started from Finder / the Start menu get a minimal PATH; add the usual places pip and Homebrew install to. */
export function toolPath(): string {
  const extra: string[] = [];
  if (IS_WIN) {
    extra.push(...windowsPythonDirs());
  } else {
    extra.push('/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin'));
    const pyUser = join(homedir(), 'Library/Python');
    if (existsSync(pyUser)) {
      for (const v of readdirSync(pyUser)) extra.push(join(pyUser, v, 'bin'));
    }
  }
  return [...extra, process.env.PATH ?? process.env.Path ?? ''].join(delimiter);
}

/** Install hint for the current operating system. */
export function esptoolInstallHint(): string {
  return IS_WIN
    ? t('Install Python from python.org (tick “Add python.exe to PATH”), then open Command Prompt and run: py -m pip install esptool. Then restart BoardPilot.')
    : t('Open Terminal and run: pip3 install esptool (or brew install esptool). Then restart BoardPilot.');
}

interface RunResult {
  code: number | null;
  out: string;
}

function run(cmd: string, args: string[], timeoutMs: number, onLine?: (l: string) => void): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let out = '';
    let tail = '';
    const child = spawn(cmd, args, { env: { ...process.env, PATH: toolPath() }, windowsHide: true });
    const timer = setTimeout(() => {
      child.kill(IS_WIN ? undefined : 'SIGKILL');
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
      if (e.code === 'ENOENT') reject(new DriverError('esptool_missing', t('esptool is not installed.'), esptoolInstallHint()));
      else reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

let cached: EsptoolCommand | null = null;

/** Folder name under resources/esptool/ for the current OS (PyInstaller builds, see docs/hardware-setup.md). */
export function bundledEsptoolDir(platform: NodeJS.Platform = process.platform): string | null {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  return null;
}

/**
 * Path of the esptool binary shipped with the app, or null when this copy has none.
 * Packaged: <resources>/esptool/<os>/esptool(.exe). Development: resources/esptool/<os>/.
 */
export function bundledEsptoolPath(
  opts: { platform?: NodeJS.Platform; resourcesPath?: string; appPath?: string; exists?: (p: string) => boolean } = {},
): string | null {
  const platform = opts.platform ?? process.platform;
  const dir = bundledEsptoolDir(platform);
  if (!dir) return null;
  const exists = opts.exists ?? existsSync;
  const exe = platform === 'win32' ? 'esptool.exe' : 'esptool';
  const resources = opts.resourcesPath ?? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const roots = [
    resources && join(resources, 'esptool'),
    opts.appPath && join(opts.appPath, 'resources', 'esptool'),
    join(process.cwd(), 'resources', 'esptool'),
  ].filter((x): x is string => !!x);
  for (const r of roots) {
    const p = join(r, dir, exe);
    if (exists(p)) return p;
  }
  return null;
}

export async function findEsptool(): Promise<EsptoolCommand> {
  if (cached) return cached;
  // Node's spawn does not add .exe on Windows, so list the Windows names explicitly.
  const bundled = bundledEsptoolPath();
  const candidates: { cmd: string; baseArgs: string[] }[] = IS_WIN
    ? [
        { cmd: 'esptool.exe', baseArgs: [] },
        { cmd: 'py.exe', baseArgs: ['-m', 'esptool'] },
        { cmd: 'python.exe', baseArgs: ['-m', 'esptool'] },
      ]
    : [
        { cmd: 'esptool', baseArgs: [] },
        { cmd: 'esptool.py', baseArgs: [] },
        { cmd: 'python3', baseArgs: ['-m', 'esptool'] },
      ];
  // A copy shipped with the app comes first, so users do not need Python.
  if (bundled) candidates.unshift({ cmd: bundled, baseArgs: [] });
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
    esptoolInstallHint(),
  );
}

/** v5 uses hyphenated command names; v4 uses underscores. */
export function commandName(tool: EsptoolCommand, name: 'flash-id' | 'read-flash' | 'write-flash' | 'chip-id' | 'get-security-info'): string {
  return tool.major >= 5 ? name : name.replace(/-/g, '_');
}

/** Map esptool's error output to a plain-language error. */
export function classifyEsptoolError(out: string): DriverError {
  if (/Resource busy|exclusively lock|Errno 16|port is busy|PermissionError\(13|Access is denied/i.test(out)) {
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
  if (/could not open port|No such file or directory|device not configured|FileNotFoundError|The system cannot find the file/i.test(out)) {
    return new DriverError('port_gone', t('The board disappeared while the app was talking to it.'), t('Check the USB cable is firmly plugged in, then search for boards again.'));
  }
  if (/Permission denied/i.test(out)) {
    return new DriverError('permission', t('macOS did not allow the app to open the port.'), t('Unplug and replug the board. If you installed a driver, allow it in System Settings → Privacy & Security.'));
  }
  const last = out.trim().split('\n').slice(-2).join(' ').slice(0, 300);
  return new DriverError('esptool_failed', t('esptool reported a problem: {detail}', { detail: last }), t('Unplug the board, plug it back in and try again.'));
}

/** Flash size in bytes from esptool's "Detected flash size: 4MB" line, or undefined when it is not there. */
export function parseFlashBytes(out: string): number | undefined {
  const m = /Detected flash size:\s*(\d+)\s*(MB|KB)/i.exec(out);
  return m ? Number(m[1]) * (m[2].toUpperCase() === 'MB' ? 1024 * 1024 : 1024) : undefined;
}

/**
 * What `get-security-info` says about the chip. null means the output did not say (older chips such
 * as the original ESP32 may not support the command), which is not the same as "off".
 */
export interface SecurityInfo {
  secureBoot: boolean | null;
  flashEncryption: boolean | null;
  secureDownload: boolean | null;
}

/** Parses esptool v4 and v5 output of get_security_info / get-security-info. */
export function parseSecurityInfo(out: string): SecurityInfo {
  const flag = (re: RegExp): boolean | null => {
    const m = re.exec(out);
    return m ? /^enabled$/i.test(m[1]) : null;
  };
  let flashEncryption = flag(/Flash Encryption:\s*(Enabled|Disabled)/i);
  if (flashEncryption === null) {
    // ESP32-S3 / C3 style: SPI_BOOT_CRYPT_CNT with an odd number of bits set means encryption is on.
    const c = /SPI Boot Crypt Count[^:\n]*:\s*(0x[0-9a-f]+|\d+)/i.exec(out);
    if (c) {
      let n = Number(c[1]);
      let bits = 0;
      while (n > 0) {
        bits += n % 2;
        n = Math.floor(n / 2);
      }
      flashEncryption = bits % 2 === 1;
    }
  }
  return {
    secureBoot: flag(/Secure Boot:\s*(Enabled|Disabled)/i),
    flashEncryption,
    secureDownload: flag(/Secure Download Mode:\s*(Enabled|Disabled)/i),
  };
}

/** The refusal for a locked chip, or null when nothing in the output says it is locked. */
export function securityRefusal(info: SecurityInfo): DriverError | null {
  if (!info.secureBoot && !info.flashEncryption && !info.secureDownload) return null;
  const what = [
    info.secureBoot ? t('secure boot') : null,
    info.flashEncryption ? t('flash encryption') : null,
    info.secureDownload ? t('secure download mode') : null,
  ]
    .filter((x): x is string => !!x)
    .join(', ');
  return new DriverError(
    'chip_locked',
    t('This chip has {what} turned on, so the app cannot safely back it up or write to it.', { what }),
    t('Nothing was changed. Use the tools of whoever set up this board (for example their signing key), or use a board that is not locked.'),
  );
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
  const flashBytes = parseFlashBytes(out);
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

/**
 * Reads the chip's security state. A chip that does not support the command (older ESP32) gives
 * a result with unknown (null) fields; any other failure, such as a busy port, is passed on.
 */
export async function readSecurityInfo(port: string): Promise<SecurityInfo> {
  const tool = await findEsptool();
  try {
    const out = await esptool(port, [commandName(tool, 'get-security-info')], { timeoutMs: 30000 });
    return parseSecurityInfo(out);
  } catch (e) {
    if (e instanceof DriverError && e.code === 'esptool_failed') return { secureBoot: null, flashEncryption: null, secureDownload: null };
    throw e;
  }
}

/** Refuses with a plain message when secure boot or flash encryption is on. Call before any backup or write. */
export async function assertChipUnlocked(port: string): Promise<void> {
  const refusal = securityRefusal(await readSecurityInfo(port));
  if (refusal) throw refusal;
}

/** Flash size in bytes as the chip reports it now; refuses when it cannot be read, instead of guessing. */
export async function detectFlashBytes(port: string): Promise<number> {
  const tool = await findEsptool();
  const out = await esptool(port, [commandName(tool, 'flash-id')], { timeoutMs: 30000 });
  const bytes = parseFlashBytes(out);
  if (!bytes) {
    throw new DriverError(
      'flash_size_unknown',
      t('The app could not tell how big the flash memory on this board is.'),
      t('Nothing was changed. Unplug the board, plug it back in and try again. If it repeats, the flash chip may be unusual or damaged.'),
    );
  }
  return bytes;
}
