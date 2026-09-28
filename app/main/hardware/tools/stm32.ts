// STM32 boards: STMicroelectronics STM32CubeProgrammer CLI when installed (SWD through the
// on-board ST-LINK, or the USB DFU bootloader), otherwise the open-source stlink tools (st-info,
// st-flash) for SWD and dfu-util for DFU. Internal flash starts at 0x08000000 (STM32F4 reference
// manual RM0368 / RM0383, "Memory map").

import { join } from 'node:path';
import type { ChipInfo } from '@shared/types';
import { DriverError } from '../errors';
import { t } from '@shared/i18n';
import { commonToolError, findTool, lastLines, percentFromLine, runTool, type ChipTool, type Tool, type ToolCtx } from './proc';

const FLASH_BASE = 0x08000000;

export function parseCubeProgrammerInfo(out: string): { name: string | null; deviceId: string | null; flashBytes: number | null } {
  const name = /Device name\s*:\s*(.+)/i.exec(out)?.[1]?.trim() ?? null;
  const deviceId = /Device ID\s*:\s*(0x[0-9a-f]+)/i.exec(out)?.[1] ?? null;
  const fs = /Flash size\s*:\s*(\d+)\s*(KBytes|MBytes|Kbytes|Mbytes)/i.exec(out);
  const flashBytes = fs ? Number(fs[1]) * (/^M/i.test(fs[2]) ? 1024 * 1024 : 1024) : null;
  return { name, deviceId, flashBytes };
}

export function parseStInfo(out: string): { descr: string | null; chipId: string | null; flashBytes: number | null; serial: string | null } {
  return {
    descr: /descr:\s*(.+)/i.exec(out)?.[1]?.trim() ?? null,
    chipId: /chipid:\s*(0x[0-9a-f]+)/i.exec(out)?.[1] ?? null,
    flashBytes: /flash:\s*(\d+)/i.exec(out) ? Number(/flash:\s*(\d+)/i.exec(out)?.[1]) : null,
    serial: /serial:\s*([0-9A-F]+)/i.exec(out)?.[1] ?? null,
  };
}

/** dfu-util -l lists the flash layout, e.g. "@Internal Flash  /0x08000000/04*016Kg,01*064Kg,03*128Kg". */
export function parseDfuFlashBytes(out: string): number | null {
  const m = /@Internal Flash\s*\/0x08000000\/([0-9*KMg,a-z]+)/i.exec(out);
  if (!m) return null;
  let total = 0;
  for (const part of m[1].split(',')) {
    const x = /(\d+)\*(\d+)([KM])/i.exec(part);
    if (x) total += Number(x[1]) * Number(x[2]) * (x[3].toUpperCase() === 'M' ? 1024 * 1024 : 1024);
  }
  return total || null;
}

function classify(out: string, tool: string): DriverError {
  const common = commonToolError(out);
  if (common) return common;
  if (/No ST-?LINK|No debug probe|Couldn't find any ST-Link|ST-LINK error|No DFU capable USB device|DEV_USB_COMM_ERR|No STM32 target found|Unable to get core ID/i.test(out)) {
    return new DriverError(
      'no_probe',
      t('The app could not reach the STM32 chip.'),
      t('Check the USB cable. For a Black Pill over USB: hold BOOT0, press and release NRST, then release BOOT0 and try again.'),
    );
  }
  if (/read out protection|RDP|protected/i.test(out)) {
    return new DriverError('read_protected', t('The chip’s memory is read-protected, so it cannot be read or backed up.'), t('Removing the protection erases the chip. Do it only if you do not need the program on it.'));
  }
  return new DriverError('stm32_failed', t('{tool} reported a problem: {detail}', { tool, detail: lastLines(out) }), t('Unplug the board, plug it back in and try again.'));
}

const CUBE_DIRS =
  process.platform === 'darwin'
    ? ['/Applications/STMicroelectronics/STM32Cube/STM32CubeProgrammer/STM32CubeProgrammer.app/Contents/MacOs/bin']
    : process.platform === 'win32'
      ? ['C:\\Program Files\\STMicroelectronics\\STM32Cube\\STM32CubeProgrammer\\bin']
      : [join(process.env.HOME ?? '', 'STMicroelectronics/STM32Cube/STM32CubeProgrammer/bin')];

const MISSING = {
  message: t('The app could not find a tool that talks to STM32 chips.'),
  hint:
    process.platform === 'darwin'
      ? t('Install STM32CubeProgrammer from st.com, or open Terminal and run: brew install stlink dfu-util. Then restart BoardPilot.')
      : t('Install STM32CubeProgrammer from st.com, then restart BoardPilot.'),
};

type Backend = { kind: 'cube'; tool: Tool } | { kind: 'stlink'; info: Tool; flash: Tool } | { kind: 'dfu'; tool: Tool };

async function backend(ctx: ToolCtx): Promise<Backend> {
  try {
    return { kind: 'cube', tool: await findTool('STM32_Programmer_CLI', ['STM32_Programmer_CLI'], CUBE_DIRS, ['--version'], MISSING, true) };
  } catch {
    /* fall back to open-source tools */
  }
  if (ctx.board.toolchain.link === 'usb-bootloader' && ctx.portInfo?.productId?.toLowerCase() !== '374b') {
    try {
      return { kind: 'dfu', tool: await findTool('dfu-util', ['dfu-util'], [], ['--version'], MISSING, true) };
    } catch {
      /* try SWD */
    }
  }
  const info = await findTool('st-info', ['st-info'], [], ['--version'], MISSING, true);
  const flash = await findTool('st-flash', ['st-flash'], [], ['--version'], MISSING, true);
  return { kind: 'stlink', info, flash };
}

function cubePort(ctx: ToolCtx): string[] {
  return ['-c', ctx.board.toolchain.link === 'usb-bootloader' && ctx.portInfo?.vendorId === '0483' && ctx.portInfo.productId === 'df11' ? 'port=USB1' : 'port=SWD'];
}

async function exec(tl: Tool, args: string[], timeoutMs: number, onProgress?: (pct: number) => void): Promise<string> {
  const r = await runTool(tl, args, {
    timeoutMs,
    onLine: (l) => {
      const p = percentFromLine(l);
      if (p !== null) onProgress?.(p);
    },
  });
  if (r.code !== 0 || /Error:|ERROR/.test(r.out.split('\n').slice(-4).join('\n'))) throw classify(r.out, tl.name);
  return r.out;
}

export const stm32Tool: ChipTool = {
  name: 'STM32',
  canBackup: true,
  backupExt: '.bin',

  async identify(ctx) {
    const b = await backend(ctx);
    let chip = ctx.board.chip;
    let flashBytes = ctx.board.flashBytes ?? null;
    let serial = ctx.portInfo?.serialNumber ?? null;
    let toolVersion = b.kind === 'cube' ? 'STM32CubeProgrammer' : b.kind;
    if (b.kind === 'cube') {
      const out = await exec(b.tool, cubePort(ctx), 30000);
      const i = parseCubeProgrammerInfo(out);
      chip = i.name ?? chip;
      flashBytes = i.flashBytes ?? flashBytes;
    } else if (b.kind === 'stlink') {
      const out = await exec(b.info, ['--probe'], 30000);
      const i = parseStInfo(out);
      if (!i.chipId) throw classify(out, 'st-info');
      chip = i.descr ? `STM32 ${i.descr} (${i.chipId})` : chip;
      flashBytes = i.flashBytes ?? flashBytes;
      serial = i.serial ?? serial;
      toolVersion = 'stlink';
    } else {
      const out = await exec(b.tool, ['-l'], 20000);
      if (!/Found DFU/i.test(out)) throw classify('No DFU capable USB device', 'dfu-util');
      flashBytes = parseDfuFlashBytes(out) ?? flashBytes;
      toolVersion = 'dfu-util';
    }
    return {
      port: ctx.port,
      chip,
      features: [ctx.board.cpu],
      mac: `STM32-${serial ?? ctx.port.replace(/\W+/g, '')}`,
      flashSize: flashBytes ? `${Math.round(flashBytes / 1024)}KB` : 'unknown',
      flashBytes: flashBytes ?? undefined,
      bridge: ctx.portInfo?.bridge ?? 'unknown',
      toolVersion,
    } satisfies ChipInfo;
  },

  async backup(ctx, chip, path, onProgress) {
    const size = chip.flashBytes ?? ctx.board.flashBytes ?? 512 * 1024;
    const b = await backend(ctx);
    if (b.kind === 'cube') await exec(b.tool, [...cubePort(ctx), '-u', `0x${FLASH_BASE.toString(16)}`, `0x${size.toString(16)}`, path], 5 * 60 * 1000, onProgress);
    else if (b.kind === 'stlink') await exec(b.flash, ['read', path, `0x${FLASH_BASE.toString(16)}`, String(size)], 5 * 60 * 1000, onProgress);
    else await exec(b.tool, ['-a', '0', '-s', `0x${FLASH_BASE.toString(16)}:${size}`, '-U', path], 5 * 60 * 1000, onProgress);
  },

  async restore(ctx, path, onProgress) {
    await stm32Tool.flash(ctx, path, FLASH_BASE, onProgress);
  },

  async flash(ctx, file, offset, onProgress) {
    const addr = `0x${(offset || FLASH_BASE).toString(16)}`;
    const hex = /\.hex$/i.test(file);
    const b = await backend(ctx);
    if (b.kind === 'cube') await exec(b.tool, [...cubePort(ctx), '-w', file, ...(hex ? [] : [addr]), '-v', '-rst'], 5 * 60 * 1000, onProgress);
    else if (b.kind === 'stlink') await exec(b.flash, ['--reset', ...(hex ? ['--format', 'ihex', 'write', file] : ['write', file, addr])], 5 * 60 * 1000, onProgress);
    else {
      if (hex) throw new DriverError('format', t('dfu-util can only write .bin files.'), t('Export a .bin file from your build, or install STM32CubeProgrammer.'));
      await exec(b.tool, ['-a', '0', '-s', `${addr}:leave`, '-D', file], 5 * 60 * 1000, onProgress);
    }
  },
};
