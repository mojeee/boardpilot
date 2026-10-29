// Display Studio: pictures and fonts that come from outside the studio.
// - Bitmaps: an image (decoded to RGBA by the app: the browser's canvas reads PNG, JPEG, GIF) becomes
//   a 1-bit mask (drawn in one colour, like an icon) or an RGB565 picture. The bytes are kept in the
//   spec as base64 and written to the sketch as PROGMEM arrays.
// - Fonts: a ready-made Adafruit GFX font header (the FreeSans9pt7b.h files that ship with Adafruit
//   GFX, or made with fontconvert) is read into data. BoardPilot does not convert TrueType fonts (that
//   would need a font library); the built-in 5x7 font can be scaled 1x to 8x instead.

import { t } from './i18n';

/* ---------------- bitmaps ---------------- */

export type BitmapFormat = 'mono' | 'rgb565';

export interface DisplayBitmap {
  /** the name the drawing uses, e.g. "logo" */
  id: string;
  w: number;
  h: number;
  format: BitmapFormat;
  /**
   * mono: rows of ceil(w / 8) bytes, bit 7 = leftmost pixel (Adafruit drawBitmap).
   * rgb565: w * h pixels, two bytes each, high byte first (Adafruit drawRGBBitmap).
   * Base64.
   */
  data: string;
}

/** Biggest picture the studio takes, in pixels per side. */
export const MAX_BITMAP_SIDE = 480;

export const bitmapRowBytes = (w: number) => Math.ceil(w / 8);
/** Bytes the picture takes in the board's flash. */
export const bitmapSize = (bm: Pick<DisplayBitmap, 'w' | 'h' | 'format'>) => (bm.format === 'mono' ? bitmapRowBytes(bm.w) * bm.h : bm.w * bm.h * 2);

export function bytesToBase64(bytes: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 255);
  return btoa(s);
}

export function base64ToBytes(b64: string): number[] {
  try {
    const s = atob(b64);
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  } catch {
    return [];
  }
}

export interface BitmapOptions {
  /** mono: light pixels (luminance at or above this, 0-255) are set. Default 128. */
  threshold?: number;
  /** mono: set the dark pixels instead */
  invert?: boolean;
  /** rgb565: transparent parts are mixed with this colour (default black) */
  background?: [number, number, number];
}

/**
 * A picture from RGBA pixels (4 bytes each, row by row). Mono: a pixel is set when it is opaque enough
 * (alpha 128 or more) and light enough (luminance (3r + 6g + b) / 10 at or above the threshold), the
 * same luminance rule the studio uses for one-colour panels. RGB565: alpha is mixed with the background.
 */
export function bitmapFromRgba(id: string, rgba: ArrayLike<number>, w: number, h: number, format: BitmapFormat, opts: BitmapOptions = {}): DisplayBitmap {
  const bytes: number[] = [];
  const bg = opts.background ?? [0, 0, 0];
  const th = opts.threshold ?? 128;
  if (format === 'mono') {
    const rb = bitmapRowBytes(w);
    for (let y = 0; y < h; y++) {
      for (let bx = 0; bx < rb; bx++) {
        let byte = 0;
        for (let k = 0; k < 8; k++) {
          const x = bx * 8 + k;
          if (x >= w) continue;
          const i = (y * w + x) * 4;
          const opaque = rgba[i + 3] >= 128;
          const light = (rgba[i] * 3 + rgba[i + 1] * 6 + rgba[i + 2]) / 10 >= th;
          if (opaque && (opts.invert ? !light : light)) byte |= 0x80 >> k;
        }
        bytes.push(byte);
      }
    }
  } else {
    for (let p = 0; p < w * h; p++) {
      const a = rgba[p * 4 + 3] / 255;
      const mix = (c: number, b: number) => Math.round(rgba[p * 4 + c] * a + b * (1 - a));
      const r = mix(0, bg[0]);
      const g = mix(1, bg[1]);
      const b = mix(2, bg[2]);
      const v = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
      bytes.push(v >> 8, v & 255);
    }
  }
  return { id, w, h, format, data: bytesToBase64(bytes) };
}

const decoded = new WeakMap<object, number[]>();
/** The decoded bytes of a picture or a font, remembered per object (the preview draws 30 frames a second). */
export function dataOf(o: DisplayBitmap | DisplayFont): number[] {
  let d = decoded.get(o);
  if (!d) {
    d = base64ToBytes('data' in o ? o.data : o.bitmap);
    decoded.set(o, d);
  }
  return d;
}

/** Is the picture's data the right size for its width, height and format? */
export const bitmapValid = (bm: DisplayBitmap) => bm.w > 0 && bm.h > 0 && bm.w <= MAX_BITMAP_SIDE && bm.h <= MAX_BITMAP_SIDE && base64ToBytes(bm.data).length === bitmapSize(bm);

/* ---------------- fonts in the Adafruit GFX format ---------------- */

export interface GfxGlyph {
  /** offset of the glyph's bits in the font's bitmap */
  offset: number;
  w: number;
  h: number;
  xAdvance: number;
  xOffset: number;
  yOffset: number;
}

/** An Adafruit GFXfont: glyphs for the characters first..last, bits packed row by row, no padding between rows. */
export interface DisplayFont {
  id: string;
  /** name in the header, e.g. FreeSans9pt7b */
  name: string;
  first: number;
  last: number;
  yAdvance: number;
  glyphs: GfxGlyph[];
  /** the bitmap bytes, base64 */
  bitmap: string;
}

const numOf = (s: string) => (/^-?0x/i.test(s.trim()) ? parseInt(s.trim(), 16) : parseInt(s.trim(), 10));

/**
 * Reads an Adafruit GFX font header (FreeSans9pt7b.h and the like): the Bitmaps array, the Glyphs table and
 * the GFXfont line with the first and last character and yAdvance. Returns an error in plain words when
 * the text is not such a header.
 */
export function parseGfxFont(src: string): { font: DisplayFont } | { error: string } {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const bm = /(\w+)Bitmaps\s*\[\s*\]\s*(?:PROGMEM\s*)?=\s*\{([^}]*)\}/.exec(text);
  const gl = /(\w+)Glyphs\s*\[\s*\]\s*(?:PROGMEM\s*)?=\s*\{([\s\S]*?)\}\s*;/.exec(text);
  const fontLine = /GFXfont\s+(\w+)\s*(?:PROGMEM\s*)?=\s*\{\s*\(\s*uint8_t\s*\*\s*\)\s*\w+\s*,\s*\(\s*GFXglyph\s*\*\s*\)\s*\w+\s*,\s*([-\w]+)\s*,\s*([-\w]+)\s*,\s*([-\w]+)\s*\}/.exec(text);
  if (!bm || !gl || !fontLine) return { error: t('This is not an Adafruit GFX font header: it needs the Bitmaps array, the Glyphs table and the GFXfont line.') };
  const bits = bm[2].split(',').map((x) => x.trim()).filter(Boolean).map(numOf);
  if (bits.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return { error: t('The bitmap data of this font has values that are not bytes.') };
  const glyphs: GfxGlyph[] = [];
  for (const m of gl[2].matchAll(/\{([^{}]*)\}/g)) {
    const v = m[1].split(',').map((x) => x.trim()).filter(Boolean).map(numOf);
    if (v.length !== 6 || v.some((n) => !Number.isFinite(n))) return { error: t('A glyph in this font does not have the six numbers (offset, width, height, advance, x offset, y offset).') };
    glyphs.push({ offset: v[0], w: v[1], h: v[2], xAdvance: v[3], xOffset: v[4], yOffset: v[5] });
  }
  const first = numOf(fontLine[2]);
  const last = numOf(fontLine[3]);
  const yAdvance = numOf(fontLine[4]);
  if (![first, last, yAdvance].every(Number.isFinite) || last < first || glyphs.length !== last - first + 1) return { error: t('The character range of this font does not match its glyph table.') };
  for (const g of glyphs) if (g.offset + Math.ceil((g.w * g.h) / 8) > bits.length) return { error: t('A glyph points past the end of the font’s bitmap data.') };
  return { font: { id: fontLine[1].replace(/[^A-Za-z0-9_]/g, '_'), name: fontLine[1], first, last, yAdvance, glyphs, bitmap: bytesToBase64(bits) } };
}

/** Is a font consistent (the shape normalizeSpec and the generator rely on)? */
export function fontValid(f: DisplayFont): boolean {
  const bits = base64ToBytes(f.bitmap);
  return f.glyphs.length === f.last - f.first + 1 && f.glyphs.length > 0 && f.glyphs.every((g) => g.offset + Math.ceil((g.w * g.h) / 8) <= bits.length);
}

/** Width in pixels of one line of text in a font at an integer scale (the sum of the advances; unknown characters are skipped, like Adafruit GFX). */
export function fontLineWidth(f: DisplayFont, s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= f.first && c <= f.last) w += f.glyphs[c - f.first].xAdvance * size;
  }
  return w;
}
