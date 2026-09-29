// Flash pre-flight check: before anything is written, read the firmware file and check that it
// fits the selected board. Pure function (bytes in, report out), so it runs the same for real and
// simulated boards and is unit-tested. Every check reads the file's own header, so the findings are
// facts about the file, not guesses.
//
// Formats and where their layout comes from:
// - ESP32 app image: Espressif ESP-IDF Programming Guide, "App Image Format" (esp_image_header_t):
//   magic 0xE9 at byte 0, flash size in the high nibble of byte 3, chip_id (uint16 LE) at byte 12.
// - UF2: Microsoft UF2 specification: 512-byte blocks, magic 0x0A324655 / 0x9E5D5157 at 0 and 4,
//   end magic 0x0AB16F30 at 508, flags at 8 (0x2000 = family id present), family id at 28.
//   Family ids: RP2040 0xE48BFF56; RP2350 0xE48BFF57-0xE48BFF5B (RP2350 datasheet, "UF2 format").
// - Intel HEX: records ":LLAAAATT…CC", checksum = two's complement of the byte sum; record types
//   00 data, 01 end, 02 extended segment address, 04 extended linear address.
// - STM32 .bin: Cortex-M vector table at the image start: word 0 = initial stack pointer (in SRAM,
//   0x20000000), word 1 = reset handler (in flash at 0x08000000, Thumb bit set). RM0368 (STM32F401)
//   and RM0383 (STM32F411), "Memory map" and "Boot configuration".

import type { BoardDef } from './types';
import { t } from './i18n';

export interface PreflightItem {
  severity: 'blocker' | 'warning' | 'ok';
  text: string;
}

export interface PreflightReport {
  /** Nothing may be written while this is false (unless the user explicitly overrides it). */
  ok: boolean;
  items: PreflightItem[];
  /** Bytes of program data in the file (for HEX: the data records, not the text size). */
  programBytes: number;
}

/** ESP32 chip ids in the image header (esp_chip_id_t). */
const ESP_CHIP_IDS: Record<number, string> = { 0x0000: 'esp32', 0x0002: 'esp32s2', 0x0005: 'esp32c3', 0x0009: 'esp32s3', 0x000c: 'esp32c2', 0x000d: 'esp32c6', 0x0010: 'esp32h2', 0x0012: 'esp32p4' };
const ESP_CHIP_NAMES: Record<string, string> = { esp32: 'ESP32', esp32s2: 'ESP32-S2', esp32c3: 'ESP32-C3', esp32s3: 'ESP32-S3', esp32c2: 'ESP32-C2', esp32c6: 'ESP32-C6', esp32h2: 'ESP32-H2', esp32p4: 'ESP32-P4' };
/** Flash size code in the high nibble of header byte 3. */
const ESP_FLASH_SIZES = [1, 2, 4, 8, 16, 32, 64, 128].map((mb) => mb * 1024 * 1024);

const UF2_FAMILY: Record<number, string> = {
  0xe48bff56: 'RP2040',
  0xe48bff57: 'RP2350 (absolute)',
  0xe48bff58: 'RP2350 (data)',
  0xe48bff59: 'RP2350 (Arm secure)',
  0xe48bff5a: 'RP2350 (RISC-V)',
  0xe48bff5b: 'RP2350 (Arm non-secure)',
};

const kb = (n: number) => `${Math.round(n / 1024)} KB`;
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Program data in an Intel HEX file: total data bytes, highest address, and whether every checksum is right. */
export function parseIntelHex(text: string, ignoreFrom = Infinity): { bytes: number; top: number; low: number; valid: boolean; badLine?: number } {
  let base = 0;
  let bytes = 0;
  let top = 0;
  let low = Infinity;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (!/^:[0-9A-Fa-f]{10,}$/.test(l) || l.length % 2 === 0) return { bytes, top, low: 0, valid: false, badLine: i + 1 };
    const raw = l.slice(1).match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
    const len = raw[0];
    if (raw.length !== len + 5) return { bytes, top, low: 0, valid: false, badLine: i + 1 };
    if ((raw.reduce((a, b) => a + b, 0) & 0xff) !== 0) return { bytes, top, low: 0, valid: false, badLine: i + 1 };
    const addr = (raw[1] << 8) | raw[2];
    const type = raw[3];
    if (type === 0) {
      if (base + addr >= ignoreFrom) continue;
      bytes += len;
      top = Math.max(top, base + addr + len);
      low = Math.min(low, base + addr);
    } else if (type === 1) break;
    else if (type === 2) base = ((raw[4] << 8) | raw[5]) * 16;
    else if (type === 4) base = ((raw[4] << 8) | raw[5]) * 65536;
  }
  return { bytes, top, low: low === Infinity ? 0 : low, valid: true };
}

export function preflightImage(bytes: Uint8Array, fileName: string, board: BoardDef): PreflightReport {
  const items: PreflightItem[] = [];
  const block = (text: string) => items.push({ severity: 'blocker', text });
  const warn = (text: string) => items.push({ severity: 'warning', text });
  const pass = (text: string) => items.push({ severity: 'ok', text });
  const flash = board.flashBytes ?? 0;
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const fmt = board.toolchain.imageFormat;
  let programBytes = bytes.length;

  const done = (): PreflightReport => ({ ok: !items.some((i) => i.severity === 'blocker'), items, programBytes });

  if (!bytes.length) {
    block(t('The file is empty.'));
    return done();
  }
  // Pico boards also take a plain .bin; the others need their own format.
  const accepted = fmt === 'bin' ? ['bin'] : [fmt, ...(board.toolchain.flasher === 'picotool' || board.toolchain.flasher === 'stm32' ? ['bin'] : [])];
  if (!accepted.includes(ext)) {
    block(t('This board needs a .{fmt} file; this one is .{ext}.', { fmt: accepted.join(t(' or .')), ext: ext || '?' }));
    return done();
  }

  if (ext === 'hex') {
    // nRF52 files often carry UICR settings at 0x10001000: not program flash, left out of the size.
    const hex = parseIntelHex(new TextDecoder().decode(bytes), board.family === 'nrf52' ? 0x10000000 : Infinity);
    if (!hex.valid) {
      block(t('The file is damaged: line {line} is not valid Intel HEX.', { line: hex.badLine ?? '?' }));
      return done();
    }
    programBytes = hex.bytes;
    pass(t('Intel HEX file, checksums correct, {size} of program.', { size: kb(hex.bytes) }));
    // nRF52 and AVR flash start at 0; Teensy 4.1 flash is mapped at 0x60000000 (i.MX RT1062 memory map).
    const origin = board.family === 'imxrt' ? 0x60000000 : 0;
    if (flash && hex.top - origin > flash) block(t('The program ends at {top}, past the end of this board’s {size} flash. It was built for a bigger chip.', { top: `0x${hex.top.toString(16)}`, size: kb(flash) }));
    else if (flash && hex.low < origin) block(t('The program starts at {low}, which is not in this board’s flash. It was built for another chip.', { low: `0x${hex.low.toString(16)}` }));
    else if (flash) pass(t('Fits in the {size} flash ({pct}% used).', { size: kb(flash), pct: Math.round(((hex.top - origin) / flash) * 100) }));
    if (board.family === 'avr' && flash && hex.top > flash - 2048 && hex.top <= flash)
      warn(t('The program reaches the last 2 KB of flash, where the Arduino bootloader lives. Uploading may fail or erase the bootloader.'));
    return done();
  }

  if (ext === 'uf2') {
    if (bytes.length % 512 !== 0 || u32(bytes, 0) !== 0x0a324655 || u32(bytes, 4) !== 0x9e5d5157 || u32(bytes, 508) !== 0x0ab16f30) {
      block(t('This is not a valid UF2 file.'));
      return done();
    }
    const families = new Set<number>();
    let data = 0;
    let top = 0;
    for (let o = 0; o + 512 <= bytes.length; o += 512) {
      const flags = u32(bytes, o + 8);
      const addr = u32(bytes, o + 12);
      const size = u32(bytes, o + 16);
      if (flags & 0x1) continue; // "not main flash"
      if (flags & 0x2000) families.add(u32(bytes, o + 28));
      data += size;
      top = Math.max(top, addr + size);
    }
    programBytes = data;
    const want = board.family === 'rp2040' ? [0xe48bff56] : board.family === 'rp2350' ? [0xe48bff57, 0xe48bff58, 0xe48bff59, 0xe48bff5a, 0xe48bff5b] : [];
    const got = [...families];
    const wrong = got.filter((f) => want.length && !want.includes(f) && f !== 0xe48bff58);
    if (wrong.length) {
      block(t('The file was built for {family}, not for this board’s {chip}.', { family: wrong.map((f) => UF2_FAMILY[f] ?? `0x${f.toString(16)}`).join(', '), chip: board.chip }));
    } else pass(t('UF2 file for {family}, {size} of program.', { family: got.map((f) => UF2_FAMILY[f] ?? `0x${f.toString(16)}`).join(', ') || board.chip, size: kb(data) }));
    // RP2040 / RP2350 flash is mapped at 0x10000000 (datasheet, "Address map").
    if (flash && top - 0x10000000 > flash) block(t('The program ends at {top}, past the end of this board’s {size} flash. It was built for a bigger chip.', { top: `0x${top.toString(16)}`, size: kb(flash) }));
    else if (flash) pass(t('Fits in the {size} flash ({pct}% used).', { size: kb(flash), pct: Math.max(1, Math.round(((top - 0x10000000) / flash) * 100)) }));
    return done();
  }

  // .bin
  if (board.toolchain.flasher === 'esptool') {
    const merged = /merged|factory/i.test(fileName);
    // A merged image holds the bootloader: at 0x1000 on the original ESP32, at 0x0 on newer chips.
    const head = merged && board.toolchain.esptoolChip === 'esp32' ? 0x1000 : 0;
    if (bytes.length < head + 24 || bytes[head] !== 0xe9) {
      block(merged ? t('This does not look like a merged ESP32 image (no image header where the bootloader should be).') : t('This is not an ESP32 app image (it does not start with the image header). Use the .bin from “Export Compiled Binary”.'));
      return done();
    }
    const chip = ESP_CHIP_IDS[bytes[head + 12] | (bytes[head + 13] << 8)];
    const want = board.toolchain.esptoolChip ?? 'esp32';
    if (chip && chip !== want) block(t('The file was built for {family}, not for this board’s {chip}.', { family: ESP_CHIP_NAMES[chip] ?? chip, chip: ESP_CHIP_NAMES[want] ?? want }));
    else pass(t('{chip} image header found.', { chip: ESP_CHIP_NAMES[want] ?? want }));
    const flashCode = bytes[head + 3] >> 4;
    const headerFlash = ESP_FLASH_SIZES[flashCode];
    if (flash && headerFlash && headerFlash > flash)
      warn(t('The image is set up for {img} of flash, but this board has {size}. It may not boot.', { img: kb(headerFlash), size: kb(flash) }));
    const offset = merged ? 0 : 0x10000;
    if (flash && offset + bytes.length > flash) block(t('The file is {file} but only {room} of flash is free from {offset}.', { file: kb(bytes.length), room: kb(flash - offset), offset: `0x${offset.toString(16)}` }));
    else if (!merged && bytes.length > 0x140000)
      warn(t('The app is {file}. The default Arduino partition scheme has 1.25 MB for the app: pick a larger “Partition Scheme” if it does not start.', { file: kb(bytes.length) }));
    else if (flash) pass(t('Fits in the {size} flash ({pct}% used).', { size: kb(flash), pct: Math.max(1, Math.round(((offset + bytes.length) / flash) * 100)) }));
    return done();
  }

  if (board.family === 'stm32' && bytes.length >= 8) {
    const sp = u32(bytes, 0);
    const reset = u32(bytes, 4);
    const ram = board.ramBytes ?? 0;
    const spOk = sp >= 0x20000000 && sp <= 0x20000000 + (ram || 0x100000);
    const resetOk = reset >= 0x08000000 && reset < 0x08000000 + (flash || 0x200000) && (reset & 1) === 1;
    if (!spOk || !resetOk)
      block(t('The start of the file is not a program for this chip (stack at {sp}, start at {reset}). It may be built for another chip or another flash address.', { sp: `0x${sp.toString(16)}`, reset: `0x${reset.toString(16)}` }));
    else pass(t('Program start found (vector table at 0x08000000).'));
  }
  if (flash && bytes.length > flash) block(t('The file is {file} but this board has only {size} of flash.', { file: kb(bytes.length), size: kb(flash) }));
  else if (flash) pass(t('Fits in the {size} flash ({pct}% used).', { size: kb(flash), pct: Math.max(1, Math.round((bytes.length / flash) * 100)) }));
  return done();
}
