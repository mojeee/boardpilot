// avrdude for Arduino AVR boards (Uno, Nano, Mega) through their serial bootloader.
// Signatures: Microchip ATmega328P datasheet, section "Signature Bytes" (0x1E 0x95 0x0F);
// ATmega2560 datasheet, "Signature Bytes" (0x1E 0x98 0x01).

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ChipInfo } from '@shared/types';
import { DriverError } from '../errors';
import { t } from '@shared/i18n';
import { arduinoToolDirs, commonToolError, findTool, lastLines, percentFromLine, runTool, type ChipTool, type Tool, type ToolCtx } from './proc';

const SIGNATURES: Record<string, string> = {
  '1e950f': 'ATmega328P',
  '1e9516': 'ATmega328PB',
  '1e9514': 'ATmega328',
  '1e9801': 'ATmega2560',
  '1e9703': 'ATmega1280',
  '1e9587': 'ATmega32U4',
};

/**
 * Bootloader area left out when restoring: the serial bootloader cannot overwrite itself.
 * Old Nano bootloader: 2 KB (BOOTSZ 1024 words); Mega stk500v2 bootloader: 8 KB (ATmega2560 datasheet,
 * "Boot Loader Parameters"). Using 2 KB on the 328P also covers Optiboot (512 bytes).
 */
const BOOT_BYTES: Record<string, number> = { m328p: 2048, m328pb: 2048, m2560: 8192 };

export function parseAvrSignature(out: string): { hex: string; chip: string | null } | null {
  const m = /signature\s*=\s*(?:0x)?([0-9a-f]{6}|[0-9a-f]{2}\s[0-9a-f]{2}\s[0-9a-f]{2})/i.exec(out);
  if (!m) return null;
  const hex = m[1].replace(/\s/g, '').toLowerCase();
  return { hex, chip: SIGNATURES[hex] ?? null };
}

export function classifyAvrdudeError(out: string): DriverError {
  const common = commonToolError(out);
  if (common) return common;
  if (/not in sync|programmer is not responding|not responding|protocol expects sync|cannot get into sync/i.test(out)) {
    return new DriverError(
      'no_sync',
      t('The board’s bootloader did not answer.'),
      t('Check that the right board is selected (for a Nano clone try the old bootloader), close other serial monitors, and try again.'),
    );
  }
  if (/Expected signature|double check chip|Device signature.*(invalid|0x000000|0xffffff)/i.test(out)) {
    return new DriverError('wrong_chip', t('The chip on this board is not the one the selected board uses.'), t('Pick the board you really have in the board list.'));
  }
  if (/can't open device|No such file|could not find|does not exist/i.test(out)) {
    return new DriverError('port_gone', t('The board disappeared while the app was talking to it.'), t('Check the USB cable is firmly plugged in, then search for boards again.'));
  }
  return new DriverError('avrdude_failed', t('avrdude reported a problem: {detail}', { detail: lastLines(out) }), t('Unplug the board, plug it back in and try again.'));
}

async function tool(): Promise<Tool> {
  return findTool(
    'avrdude',
    ['avrdude'],
    arduinoToolDirs('arduino', 'avrdude'),
    ['-?'],
    {
      message: t('The app could not find avrdude, the tool that talks to Arduino AVR boards.'),
      hint:
        process.platform === 'darwin'
          ? t('Install the Arduino IDE (it includes avrdude), or open Terminal and run: brew install avrdude. Then restart BoardPilot.')
          : t('Install the Arduino IDE (it includes avrdude), then restart BoardPilot.'),
    },
    true,
  );
}

/** Arduino's packaged avrdude needs its avrdude.conf passed explicitly. */
function confArgs(cmd: string): string[] {
  for (const c of [join(dirname(cmd), '..', 'etc', 'avrdude.conf'), join(dirname(cmd), 'avrdude.conf'), join(dirname(cmd), 'etc', 'avrdude.conf')]) {
    if (existsSync(c)) return ['-C', c];
  }
  return [];
}

function baseArgs(ctx: ToolCtx, cmd: string): string[] {
  const a = ctx.board.toolchain.avrdude;
  if (!a) throw new DriverError('board_config', t('This board has no avrdude settings.'), t('Pick another board, or report this as a bug.'));
  return [...confArgs(cmd), '-p', a.part, '-c', a.programmer, '-P', ctx.port, '-b', String(a.baud)];
}

async function avr(ctx: ToolCtx, args: string[], timeoutMs: number, onProgress?: (pct: number) => void): Promise<string> {
  const tl = await tool();
  const r = await runTool(tl, [...baseArgs(ctx, tl.cmd), ...args], {
    timeoutMs,
    onLine: (l) => {
      const p = percentFromLine(l);
      if (p !== null) onProgress?.(p);
    },
  });
  if (r.code !== 0) throw classifyAvrdudeError(r.out);
  return r.out;
}

export const avrdudeTool: ChipTool = {
  name: 'avrdude',
  canBackup: true,
  backupExt: '.bin',

  async identify(ctx: ToolCtx): Promise<ChipInfo> {
    // -n: no writes at all. Only the signature is read.
    const out = await avr(ctx, ['-n'], 30000);
    const sig = parseAvrSignature(out);
    if (!sig) throw classifyAvrdudeError(out);
    const tl = await tool();
    const ver = /version\s+([\d.]+)/i.exec(out)?.[1];
    return {
      port: ctx.port,
      chip: sig.chip ?? `AVR 0x${sig.hex}`,
      features: [ctx.board.cpu],
      // AVR chips have no unique id readable through the bootloader; the USB serial number (or the port) stands in.
      mac: `AVR-${ctx.portInfo?.serialNumber ?? ctx.port.replace(/\W+/g, '')}`,
      flashSize: ctx.board.flashBytes ? `${Math.round(ctx.board.flashBytes / 1024)}KB` : 'unknown',
      flashBytes: ctx.board.flashBytes,
      bridge: ctx.portInfo?.bridge ?? 'unknown',
      toolVersion: ver ? `avrdude ${ver}` : tl.cmd,
    };
  },

  async backup(ctx, _chip, path, onProgress) {
    await avr(ctx, ['-U', `flash:r:${path}:r`], 3 * 60 * 1000, onProgress);
  },

  async restore(ctx, path, onProgress) {
    const part = ctx.board.toolchain.avrdude?.part ?? '';
    const data = await readFile(path);
    const cap = Math.max(0, data.length - (BOOT_BYTES[part] ?? 0));
    let end = cap;
    while (end > 0 && data[end - 1] === 0xff) end--;
    const trimmed = `${path}.app.bin`;
    await writeFile(trimmed, data.subarray(0, Math.max(end, 2)));
    // -D: do not erase the whole chip (the serial bootloader erases page by page).
    await avr(ctx, ['-D', '-U', `flash:w:${trimmed}:r`], 3 * 60 * 1000, onProgress);
  },

  async flash(ctx, file, _offset, onProgress) {
    const fmt = /\.hex$/i.test(file) ? 'i' : 'r';
    await avr(ctx, ['-D', '-U', `flash:w:${file}:${fmt}`], 3 * 60 * 1000, onProgress);
  },
};
