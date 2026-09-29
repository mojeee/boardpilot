import { describe, expect, it } from 'vitest';
import { getBoard } from '@shared/board';
import { parseIntelHex, preflightImage } from '@shared/preflight';

/** An ESP32 app image header (esp_image_header_t) followed by padding. */
function espImage(chipId: number, size = 200_000, flashCode = 2): Uint8Array {
  const b = new Uint8Array(size);
  b[0] = 0xe9;
  b[1] = 3;
  b[3] = (flashCode << 4) | 0x0f;
  b[12] = chipId & 0xff;
  b[13] = chipId >> 8;
  return b;
}

/** Intel HEX from [address, bytes] chunks, with correct checksums (and extended linear records). */
function hex(chunks: [number, number][]): string {
  const rec = (type: number, addr: number, data: number[]) => {
    const raw = [data.length, (addr >> 8) & 0xff, addr & 0xff, type, ...data];
    const sum = (0x100 - (raw.reduce((a, b) => a + b, 0) & 0xff)) & 0xff;
    return ':' + [...raw, sum].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join('');
  };
  const lines: string[] = [];
  for (const [start, len] of chunks) {
    lines.push(rec(4, 0, [(start >>> 24) & 0xff, (start >>> 16) & 0xff]));
    for (let o = 0; o < len; o += 16) lines.push(rec(0, (start + o) & 0xffff, new Array(Math.min(16, len - o)).fill(0x55)));
  }
  lines.push(rec(1, 0, []));
  return lines.join('\n');
}
const enc = (s: string) => new TextEncoder().encode(s);

/** A UF2 file of n blocks of 256 bytes from 0x10000000 with a family id. */
function uf2(family: number, blocks = 4): Uint8Array {
  const b = new Uint8Array(512 * blocks);
  const dv = new DataView(b.buffer);
  for (let i = 0; i < blocks; i++) {
    const o = i * 512;
    dv.setUint32(o, 0x0a324655, true);
    dv.setUint32(o + 4, 0x9e5d5157, true);
    dv.setUint32(o + 8, 0x2000, true);
    dv.setUint32(o + 12, 0x10000000 + i * 256, true);
    dv.setUint32(o + 16, 256, true);
    dv.setUint32(o + 20, i, true);
    dv.setUint32(o + 24, blocks, true);
    dv.setUint32(o + 28, family, true);
    dv.setUint32(o + 508, 0x0ab16f30, true);
  }
  return b;
}

describe('flash pre-flight check', () => {
  const esp32 = getBoard('esp32-devkitc-30');
  const s3 = getBoard('esp32-s3-devkitc-1');

  it('accepts a matching ESP32 app image', () => {
    const r = preflightImage(espImage(0x0000), 'sketch.ino.bin', esp32);
    expect(r.ok).toBe(true);
    expect(r.items.every((i) => i.severity === 'ok')).toBe(true);
  });

  it('blocks an ESP32-S3 image on a classic ESP32, and the other way round', () => {
    const r = preflightImage(espImage(0x0009), 'sketch.ino.bin', esp32);
    expect(r.ok).toBe(false);
    expect(r.items[0].text).toMatch(/ESP32-S3/);
    expect(preflightImage(espImage(0x0000), 'sketch.ino.bin', s3).ok).toBe(false);
  });

  it('blocks a file that is not an image, an empty file and the wrong format', () => {
    expect(preflightImage(new Uint8Array(1000), 'notes.bin', esp32).ok).toBe(false);
    expect(preflightImage(new Uint8Array(0), 'x.bin', esp32).ok).toBe(false);
    expect(preflightImage(espImage(0), 'sketch.hex', esp32).items[0].text).toMatch(/\.bin/);
  });

  it('warns about a flash size bigger than the board and an app bigger than the default partition', () => {
    expect(preflightImage(espImage(0x0000, 200_000, 4), 'a.bin', esp32).items.some((i) => i.severity === 'warning' && /16384 KB/.test(i.text))).toBe(true);
    expect(preflightImage(espImage(0x0000, 1_500_000), 'a.bin', esp32).items.some((i) => i.severity === 'warning' && /Partition/.test(i.text))).toBe(true);
  });

  it('finds the bootloader of a merged image at 0x1000 on the classic ESP32', () => {
    const merged = new Uint8Array(0x20000).fill(0xff);
    merged.set(espImage(0x0000, 64), 0x1000);
    expect(preflightImage(merged, 'sketch.ino.merged.bin', esp32).ok).toBe(true);
  });

  it('checks Intel HEX checksums and size on the Uno', () => {
    const uno = getBoard('arduino-uno-r3');
    const small = preflightImage(enc(hex([[0, 4000]])), 'blink.ino.hex', uno);
    expect(small.ok).toBe(true);
    expect(small.programBytes).toBe(4000);
    const big = preflightImage(enc(hex([[0, 40000]])), 'big.hex', uno);
    expect(big.ok).toBe(false);
    const nearBoot = preflightImage(enc(hex([[0, 31500]])), 'full.hex', uno);
    expect(nearBoot.items.some((i) => i.severity === 'warning' && /bootloader/.test(i.text))).toBe(true);
    const broken = hex([[0, 32]]).replace(/.$/m, (c) => (c === '0' ? '1' : '0'));
    expect(preflightImage(enc(broken), 'bad.hex', uno).ok).toBe(false);
  });

  it('ignores nRF52 UICR records when checking the size', () => {
    const dk = getBoard('nrf52840-dk');
    expect(preflightImage(enc(hex([[0, 8000], [0x10001014, 4]])), 'app.hex', dk).ok).toBe(true);
    expect(parseIntelHex(hex([[0, 16], [0x10001014, 4]]), 0x10000000).bytes).toBe(16);
  });

  it('checks the UF2 family on Pico boards', () => {
    const pico = getBoard('rpi-pico');
    const pico2 = getBoard('rpi-pico-2');
    expect(preflightImage(uf2(0xe48bff56), 'blink.uf2', pico).ok).toBe(true);
    const wrong = preflightImage(uf2(0xe48bff59), 'blink.uf2', pico);
    expect(wrong.ok).toBe(false);
    expect(wrong.items[0].text).toMatch(/RP2350/);
    expect(preflightImage(uf2(0xe48bff59), 'blink.uf2', pico2).ok).toBe(true);
    expect(preflightImage(uf2(0xe48bff56), 'blink.uf2', pico2).ok).toBe(false);
  });

  it('checks the STM32 vector table', () => {
    const nucleo = getBoard('nucleo-f401re');
    const img = new Uint8Array(20000);
    const dv = new DataView(img.buffer);
    dv.setUint32(0, 0x20018000, true);
    dv.setUint32(4, 0x08000199, true);
    expect(preflightImage(img, 'blink.bin', nucleo).ok).toBe(true);
    dv.setUint32(4, 0x00000199, true); // linked for address 0: not this board's flash
    expect(preflightImage(img, 'blink.bin', nucleo).ok).toBe(false);
  });
});
