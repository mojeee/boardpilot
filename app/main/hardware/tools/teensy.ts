// Teensy boards (PJRC) with teensy_loader_cli. The Teensy bootloader (HalfKay) can only write:
// there is no way to read the program back (PJRC, "Teensy Loader" documentation), so no backup
// is possible. The app says so in the confirmation before any write.

import type { ChipInfo } from '@shared/types';
import { DriverError } from '../errors';
import { t } from '@shared/i18n';
import { arduinoToolDirs, commonToolError, findTool, lastLines, runTool, type ChipTool, type Tool, type ToolCtx } from './proc';

async function tool(): Promise<Tool> {
  return findTool(
    'teensy_loader_cli',
    ['teensy_loader_cli'],
    arduinoToolDirs('teensy', 'teensy-tools'),
    ['--list-mcus'],
    {
      message: t('The app could not find teensy_loader_cli, the tool that programs Teensy boards.'),
      hint:
        process.platform === 'darwin'
          ? t('Open Terminal and run: brew install teensy_loader_cli (or install Teensyduino). Then restart BoardPilot.')
          : t('Install Teensyduino from pjrc.com, then restart BoardPilot.'),
    },
    true,
  );
}

/** "teensy:avr:teensy41" → "TEENSY41" (the --mcu name teensy_loader_cli expects). */
export function teensyMcu(fqbn: string): string {
  return (fqbn.split(':')[2] ?? 'teensy41').toUpperCase();
}

export const teensyTool: ChipTool = {
  name: 'teensy_loader_cli',
  canBackup: false,
  backupExt: '.hex',

  async identify(ctx: ToolCtx): Promise<ChipInfo> {
    // Nothing to ask the chip without writing: the identity comes from the USB descriptor.
    if (!ctx.portInfo || ctx.portInfo.vendorId?.toLowerCase() !== '16c0') {
      throw new DriverError('not_teensy', t('This port does not look like a Teensy.'), t('Pick the port that appears when the Teensy is plugged in, or press its program button once.'));
    }
    return {
      port: ctx.port,
      chip: ctx.board.chip,
      features: [ctx.board.cpu],
      mac: `TEENSY-${ctx.portInfo.serialNumber ?? ctx.port.replace(/\W+/g, '')}`,
      flashSize: ctx.board.flashBytes ? `${Math.round(ctx.board.flashBytes / 1024 / 1024)}MB` : 'unknown',
      flashBytes: ctx.board.flashBytes,
      bridge: 'Teensy USB',
      toolVersion: 'USB descriptor',
    };
  },

  async backup() {
    throw new DriverError(
      'backup_unsupported',
      t('Teensy boards cannot read their program back, so no backup is possible.'),
      t('Keep a copy of your own firmware file to put it back later.'),
    );
  },

  async restore() {
    throw new DriverError('backup_unsupported', t('Teensy boards cannot read their program back, so there is no backup to restore.'), t('Flash your own firmware file instead.'));
  },

  async flash(ctx, file, _offset, onProgress) {
    if (!/\.hex$/i.test(file)) throw new DriverError('format', t('This board needs a .hex file.'), t('Export a .hex file from your build and pick that one.'));
    const tl = await tool();
    onProgress?.(5);
    // -w waits for the bootloader, -s asks a running Teensyduino program to reboot into it.
    const r = await runTool(tl, [`--mcu=${teensyMcu(ctx.board.toolchain.fqbn)}`, '-w', '-s', '-v', file], { timeoutMs: 90000 });
    if (r.code !== 0) {
      throw (
        commonToolError(r.out) ??
        new DriverError('teensy_failed', t('teensy_loader_cli reported a problem: {detail}', { detail: lastLines(r.out) }), t('Press the white program button on the Teensy once and try again.'))
      );
    }
    onProgress?.(100);
  },
};
