// Register maps: decode bytes read from a chip into datasheet fields and their meaning.
// Pure functions, no I/O. The data lives in the part files (the "registers" field), each register
// with its datasheet section. A value the datasheet does not describe is reported as undocumented,
// never guessed.

import type { PartDef, RegAccess, RegisterDef, RegisterField, RegisterMapDef } from './types';

/** Parse "0x3C" / "3C" into a number, or null. */
export function parseHex(s: string | undefined): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(?:0x)?([0-9a-f]+)$/i.exec(s.trim());
  return m ? parseInt(m[1], 16) : null;
}

/** 0x27 → "0x27"; digits = minimum hex digits. */
export function hex(n: number, digits = 2): string {
  return '0x' + n.toString(16).toUpperCase().padStart(digits, '0');
}

/** Bytes from an agent i2c_read reply (["0x60"]), or null if any entry is not a byte. */
export function bytesFromAgent(data: readonly string[]): number[] | null {
  const out: number[] = [];
  for (const d of data) {
    const n = parseHex(d);
    if (n === null || n > 0xff) return null;
    out.push(n);
  }
  return out;
}

/** The register map of a part, following registersFrom (same chip on another module). */
export function registerMapFor(def: PartDef | undefined, parts: Record<string, PartDef>): RegisterMapDef | undefined {
  if (!def) return undefined;
  if (def.registers) return def.registers;
  const from = def.registersFrom ? parts[def.registersFrom] : undefined;
  return from?.registers;
}

export const regLen = (r: RegisterDef) => r.len ?? 1;
export const isReadable = (r: RegisterDef) => r.access !== 'w';

/** Bits of a field as a number: fieldValue(0x27, [7, 5]) = 1. */
export function fieldValue(byte: number, bits: [number, number]): number {
  const [hi, lo] = bits;
  const width = hi - lo + 1;
  return (byte >> lo) & ((1 << width) - 1);
}

export interface DecodedField {
  name: string;
  bits: [number, number];
  access: RegAccess;
  /** English description from the datasheet data (translate with t()); empty for undescribed bits. */
  text: string;
  value: number;
  /** The field bits as written in datasheets: "001". */
  bin: string;
  /** English meaning of this value (translate with t()), or null when the datasheet table has no entry for it. */
  meaning: string | null;
  /** Bits this map does not describe (reserved in the datasheet, or not covered here). Never interpreted. */
  undescribed: boolean;
}

export interface DecodedRegister {
  reg: RegisterDef;
  bytes: number[];
  /** Combined, shifted value (signed when the register is signed). */
  value: number;
  /** Hex of the combined, shifted, unsigned value, e.g. "0x27", "0x80000". */
  hex: string;
  /** Meaning of the whole value (chip id…), or null when undocumented. */
  meaning: string | null;
  /** Bit fields, highest bit first, including undescribed bit ranges. Only for 1-byte registers. */
  fields: DecodedField[];
  /** true when the value equals the datasheet reset value; undefined when no reset value is known. */
  isReset?: boolean;
}

const bin = (v: number, width: number) => v.toString(2).padStart(width, '0');

/** Hex digits used to show a register value (at least 2). */
function valueDigits(r: RegisterDef): number {
  const bits = regLen(r) * 8 - (r.shift ?? 0);
  return Math.max(2, Math.ceil(bits / 4));
}

/** Look up a meaning keyed by hex ("0x60") comparing numerically, so "0x8000" matches 0x8000. */
function valueMeaning(values: Record<string, string> | undefined, v: number): string | null {
  if (!values) return null;
  for (const [k, text] of Object.entries(values)) if (parseHex(k) === v) return text;
  return null;
}

function decodeFields(fields: RegisterField[], byte: number): DecodedField[] {
  const out: DecodedField[] = [];
  const sorted = [...fields].sort((a, b) => b.bits[0] - a.bits[0]);
  let next = 7;
  const gap = (hi: number, lo: number) => {
    const bits: [number, number] = [hi, lo];
    const v = fieldValue(byte, bits);
    out.push({ name: '', bits, access: 'r', text: '', value: v, bin: bin(v, hi - lo + 1), meaning: null, undescribed: true });
  };
  for (const f of sorted) {
    if (f.bits[0] < next) gap(next, f.bits[0] + 1);
    const v = fieldValue(byte, f.bits);
    out.push({
      name: f.name,
      bits: f.bits,
      access: f.access,
      text: f.text,
      value: v,
      bin: bin(v, f.bits[0] - f.bits[1] + 1),
      meaning: f.reserved ? null : f.values?.[String(v)] ?? null,
      undescribed: !!f.reserved,
    });
    next = f.bits[1] - 1;
  }
  if (next >= 0) gap(next, 0);
  return out;
}

/** Decode the bytes read from one register. Returns null when too few bytes were read. */
export function decodeRegister(reg: RegisterDef, bytes: readonly number[]): DecodedRegister | null {
  const len = regLen(reg);
  if (bytes.length < len) return null;
  const own = bytes.slice(0, len);
  // Multi-byte results are sent high byte first (BME280 5.4.7-5.4.9, MPU-6050 RM 4.17-4.19).
  let raw = 0;
  for (const b of own) raw = raw * 256 + b;
  const unsigned = Math.floor(raw / 2 ** (reg.shift ?? 0));
  const width = len * 8 - (reg.shift ?? 0);
  const value = reg.signed && unsigned >= 2 ** (width - 1) ? unsigned - 2 ** width : unsigned;
  const reset = parseHex(reg.reset);
  return {
    reg,
    bytes: own,
    value,
    hex: hex(unsigned, valueDigits(reg)),
    meaning: valueMeaning(reg.values, unsigned),
    fields: len === 1 && reg.fields?.length ? decodeFields(reg.fields, own[0]) : [],
    isReset: reset === null ? undefined : reset === unsigned,
  };
}

/** One agent read: len bytes starting at addr, covering one or more registers. */
export interface ReadBurst {
  addr: number;
  len: number;
  regs: RegisterDef[];
}

/**
 * Group the readable registers into as few reads as possible: consecutive addresses in one burst,
 * at most maxLen bytes (the agent answers up to 32). Write-only registers are never read.
 */
export function readPlan(map: RegisterMapDef, maxLen = 32): ReadBurst[] {
  const regs = map.registers
    .filter(isReadable)
    .map((r) => ({ r, a: parseHex(r.addr) }))
    .filter((x): x is { r: RegisterDef; a: number } => x.a !== null)
    .sort((x, y) => x.a - y.a);
  const out: ReadBurst[] = [];
  for (const { r, a } of regs) {
    const last = out[out.length - 1];
    if (last && a === last.addr + last.len && last.len + regLen(r) <= maxLen) {
      last.len += regLen(r);
      last.regs.push(r);
    } else out.push({ addr: a, len: regLen(r), regs: [r] });
  }
  return out;
}

/** Split the bytes of a burst back into the registers it covered, decoded. */
export function decodeBurst(burst: ReadBurst, bytes: readonly number[]): DecodedRegister[] {
  const out: DecodedRegister[] = [];
  for (const r of burst.regs) {
    const off = (parseHex(r.addr) ?? 0) - burst.addr;
    const d = decodeRegister(r, bytes.slice(off, off + regLen(r)));
    if (d) out.push(d);
  }
  return out;
}

/**
 * One line for the log: "ctrl_meas = 0x27 → osrs_t: Oversampling ×1, osrs_p: Oversampling ×1, mode: Normal mode…".
 * tr translates the datasheet texts (pass t from shared/i18n); undescribed fields are left out.
 */
export function summarize(d: DecodedRegister, tr: (s: string) => string = (s) => s, undocumented = 'undocumented value'): string {
  const head = `${d.reg.name} = ${d.hex}`;
  const parts = d.fields.filter((f) => !f.undescribed).map((f) => `${f.name}: ${f.meaning ? tr(f.meaning) : tr(undocumented)}`);
  if (d.fields.length === 0 && d.reg.values) parts.push(d.meaning ? tr(d.meaning) : tr(undocumented));
  if (d.reg.signed) parts.unshift(String(d.value));
  return parts.length ? `${head} → ${parts.join(', ')}` : head;
}

/** Every English text of a register map (for the translation test). */
export function registerTexts(map: RegisterMapDef): string[] {
  const out: string[] = [];
  if (map.note) out.push(map.note);
  for (const r of map.registers) {
    out.push(r.text, ...Object.values(r.values ?? {}));
    for (const f of r.fields ?? []) out.push(f.text, ...Object.values(f.values ?? {}));
  }
  for (const c of map.commands ?? []) out.push(c.text);
  return out;
}
