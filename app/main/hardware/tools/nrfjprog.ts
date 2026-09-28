// Nordic nRF52 development kits through their on-board SEGGER J-Link, with nrfjprog (nRF Command
// Line Tools). DEVICEID lives in FICR at 0x10000060 (nRF52840 Product Specification, "FICR —
// Factory information configuration registers").

import type { ChipInfo } from '@shared/types';
import { DriverError } from '../errors';
import { t } from '@shared/i18n';
import { commonToolError, findTool, lastLines, percentFromLine, runTool, type ChipTool, type Tool, type ToolCtx } from './proc';

export function parseNrfDeviceVersion(out: string): string | null {
  return /\b(NRF\d{5}_[A-Z0-9]+_REV\w+|NRF\d{5}_[A-Z0-9]+)\b/i.exec(out)?.[1]?.toUpperCase() ?? null;
}

export function parseNrfDeviceId(out: string): string | null {
  const m = /0x10000060:\s*([0-9A-F]{8})\s+([0-9A-F]{8})/i.exec(out);
  return m ? `${m[1]}${m[2]}`.toUpperCase() : null;
}

function classify(out: string): DriverError {
  const common = commonToolError(out);
  if (common) return common;
  if (/access protection is enabled|APPROTECT|ERROR: The operation attempted is unavailable due to readback protection/i.test(out)) {
    return new DriverError('read_protected', t('The chip’s memory is read-protected, so it cannot be read or backed up.'), t('Removing the protection erases the chip. Do it only if you do not need the program on it.'));
  }
  if (/no debuggers were discovered|There is no debugger connected|Unable to connect to a debugger|JLinkARM DLL/i.test(out)) {
    return new DriverError('no_probe', t('The app could not reach the board’s J-Link debugger.'), t('Check that the board is switched on and the USB cable is in the port marked for the debugger (J2 on the nRF52840 DK).'));
  }
  return new DriverError('nrfjprog_failed', t('nrfjprog reported a problem: {detail}', { detail: lastLines(out) }), t('Unplug the board, plug it back in and try again.'));
}

const DIRS =
  process.platform === 'win32'
    ? ['C:\\Program Files\\Nordic Semiconductor\\nrf-command-line-tools\\bin']
    : ['/usr/local/bin', '/opt/nrf-command-line-tools/bin', '/Applications/Nordic Semiconductor/nrf-command-line-tools/bin'];

async function tool(): Promise<Tool> {
  return findTool('nrfjprog', ['nrfjprog'], DIRS, ['--version'], {
    message: t('The app could not find nrfjprog, the tool that talks to Nordic boards.'),
    hint: t('Install the nRF Command Line Tools from nordicsemi.com (they include nrfjprog and the SEGGER J-Link software). Then restart BoardPilot.'),
  });
}

/** The J-Link's USB serial number selects the right board when several are plugged in. */
function snr(ctx: ToolCtx): string[] {
  const s = ctx.portInfo?.serialNumber?.replace(/^0+/, '');
  return s && /^\d+$/.test(s) ? ['--snr', s] : [];
}

async function exec(ctx: ToolCtx, args: string[], timeoutMs: number, onProgress?: (pct: number) => void): Promise<string> {
  const tl = await tool();
  const r = await runTool(tl, [...args, ...snr(ctx)], {
    timeoutMs,
    onLine: (l) => {
      const p = percentFromLine(l);
      if (p !== null) onProgress?.(p);
    },
  });
  if (r.code !== 0) throw classify(r.out);
  return r.out;
}

export const nrfjprogTool: ChipTool = {
  name: 'nrfjprog',
  canBackup: true,
  backupExt: '.hex',

  async identify(ctx) {
    const ver = parseNrfDeviceVersion(await exec(ctx, ['--deviceversion'], 30000));
    const id = parseNrfDeviceId(await exec(ctx, ['--memrd', '0x10000060', '--n', '8'], 30000));
    return {
      port: ctx.port,
      chip: ver ?? ctx.board.chip,
      features: [ctx.board.cpu],
      mac: `NRF-${id ?? ctx.portInfo?.serialNumber ?? ctx.port.replace(/\W+/g, '')}`,
      flashSize: ctx.board.flashBytes ? `${Math.round(ctx.board.flashBytes / 1024 / 1024)}MB` : 'unknown',
      flashBytes: ctx.board.flashBytes,
      bridge: ctx.portInfo?.bridge ?? 'J-Link',
      toolVersion: 'nrfjprog',
    } satisfies ChipInfo;
  },

  async backup(ctx, _chip, path, onProgress) {
    await exec(ctx, ['--readcode', path], 5 * 60 * 1000, onProgress);
  },

  async restore(ctx, path, onProgress) {
    await exec(ctx, ['--program', path, '--chiperase', '--verify', '--reset'], 5 * 60 * 1000, onProgress);
  },

  async flash(ctx, file, _offset, onProgress) {
    if (!/\.hex$/i.test(file)) throw new DriverError('format', t('This board needs a .hex file.'), t('Export a .hex file from your build and pick that one.'));
    await exec(ctx, ['--program', file, '--sectorerase', '--verify', '--reset'], 5 * 60 * 1000, onProgress);
  },
};
