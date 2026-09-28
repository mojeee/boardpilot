// picotool for Raspberry Pi RP2040 / RP2350 boards (Pico, Pico W, Pico 2). The chip must be in its
// USB bootloader (BOOTSEL); picotool's -f flag asks a running Arduino/Pico SDK program to reboot
// there and back. As a fallback we use the Arduino "1200 baud touch" (arduino-pico core: opening
// the port at 1200 baud reboots into BOOTSEL).

import type { ChipInfo } from '@shared/types';
import { DriverError } from '../errors';
import { t } from '@shared/i18n';
import { openPort } from '../agentClient';
import { arduinoToolDirs, commonToolError, findTool, lastLines, percentFromLine, runTool, sleep, type ChipTool, type Tool, type ToolCtx } from './proc';

export function parsePicotoolInfo(out: string): { type: string | null; flashBytes: number | null; flashId: string | null } {
  const type = /\btype:\s*(RP\d{4})/i.exec(out)?.[1]?.toUpperCase() ?? null;
  const size = /flash size:\s*(\d+)\s*([KM])/i.exec(out);
  const flashBytes = size ? Number(size[1]) * (size[2].toUpperCase() === 'M' ? 1024 * 1024 : 1024) : null;
  const flashId = /flash id:\s*(0x[0-9a-f]+)/i.exec(out)?.[1]?.toUpperCase().replace('0X', '0x') ?? null;
  return { type, flashBytes, flashId };
}

const NO_DEVICE = /No accessible RP-series devices|No accessible RP2040 devices|no devices? (found|in BOOTSEL)|Unable to connect/i;

export function classifyPicotoolError(out: string): DriverError {
  const common = commonToolError(out);
  if (common) return common;
  if (NO_DEVICE.test(out)) {
    return new DriverError(
      'no_bootsel',
      t('The board could not be switched to its USB bootloader.'),
      t('Unplug the board, hold the BOOTSEL button while plugging it back in, then release it and try again.'),
    );
  }
  return new DriverError('picotool_failed', t('picotool reported a problem: {detail}', { detail: lastLines(out) }), t('Unplug the board, plug it back in and try again.'));
}

async function tool(): Promise<Tool> {
  return findTool(
    'picotool',
    ['picotool'],
    [...arduinoToolDirs('rp2040', 'pqt-picotool'), ...arduinoToolDirs('rp2040', 'picotool')],
    ['version'],
    {
      message: t('The app could not find picotool, the tool that talks to Raspberry Pi Pico boards.'),
      hint:
        process.platform === 'darwin'
          ? t('Open Terminal and run: brew install picotool (or install the Raspberry Pi Pico core in the Arduino IDE). Then restart BoardPilot.')
          : t('Install the Raspberry Pi Pico core in the Arduino IDE (it includes picotool), then restart BoardPilot.'),
    },
    true,
  );
}

/** Arduino convention: opening the port at 1200 baud and closing it reboots the Pico into BOOTSEL. */
async function touch1200(port: string) {
  try {
    const sp = await openPort(port, 1200);
    await new Promise<void>((r) => sp.close(() => r()));
  } catch {
    /* the port may already be gone because the board rebooted */
  }
  await sleep(2500);
}

async function pico(ctx: ToolCtx, args: string[], timeoutMs: number, onProgress?: (pct: number) => void): Promise<string> {
  const tl = await tool();
  const go = () =>
    runTool(tl, args, {
      timeoutMs,
      onLine: (l) => {
        const p = percentFromLine(l);
        if (p !== null) onProgress?.(p);
      },
    });
  let r = await go();
  if (r.code !== 0 && NO_DEVICE.test(r.out)) {
    await touch1200(ctx.port);
    r = await go();
  }
  if (r.code !== 0) throw classifyPicotoolError(r.out);
  return r.out;
}

export const picotoolTool: ChipTool = {
  name: 'picotool',
  canBackup: true,
  backupExt: '.bin',

  async identify(ctx) {
    const out = await pico(ctx, ['info', '-d', '-f'], 30000);
    const info = parsePicotoolInfo(out);
    const flashBytes = info.flashBytes ?? ctx.board.flashBytes;
    return {
      port: ctx.port,
      chip: info.type ?? ctx.board.chip,
      features: [ctx.board.cpu],
      // The flash chip's unique id identifies the board for backups.
      mac: info.flashId ? `RP-${info.flashId}` : `RP-${ctx.portInfo?.serialNumber ?? ctx.port.replace(/\W+/g, '')}`,
      flashSize: flashBytes ? `${Math.round(flashBytes / 1024 / 1024)}MB` : 'unknown',
      flashBytes: flashBytes ?? undefined,
      bridge: ctx.portInfo?.bridge ?? 'RP2040 native USB',
      toolVersion: 'picotool',
    } satisfies ChipInfo;
  },

  async backup(_ctx, _chip, path, onProgress) {
    await pico(_ctx, ['save', '-a', path, '-f'], 5 * 60 * 1000, onProgress);
  },

  async restore(ctx, path, onProgress) {
    // XIP flash starts at 0x10000000 on RP2040 and RP2350 (RP2040 datasheet, "Address Map").
    await pico(ctx, ['load', path, '-t', 'bin', '-o', '0x10000000', '-v', '-x', '-f'], 5 * 60 * 1000, onProgress);
  },

  async flash(ctx, file, offset, onProgress) {
    const args = /\.uf2$/i.test(file)
      ? ['load', file, '-v', '-x', '-f']
      : ['load', file, '-t', 'bin', '-o', `0x${(offset || 0x10000000).toString(16)}`, '-v', '-x', '-f'];
    await pico(ctx, args, 5 * 60 * 1000, onProgress);
  },
};
