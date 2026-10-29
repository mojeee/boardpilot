// Validation for part definitions: user-imported parts are data from outside the app,
// so every field is checked before the part enters the library.

import type { CommandDef, PartComponent, PartDef, PartDisplay, PartGotcha, PartKind, PartPinRole, PartShape, RegAccess, RegisterDef, RegisterField, RegisterMapDef, Result } from './types';
import { t } from './i18n';

export const PIN_ROLES: PartPinRole[] = [
  'power', 'ground', 'i2c_sda', 'i2c_scl', 'spi_mosi', 'spi_miso', 'spi_sck', 'spi_cs',
  'digital_in', 'digital_out', 'analog_out', 'onewire', 'int', 'passive',
];
export const SHAPES: PartShape[] = ['breakout', 'module', 'chip', 'oled', 'led', 'button', 'pot', 'dht', 'motor', 'relay'];
export const KINDS: PartKind[] = [
  'led', 'rgb-led', 'buzzer', 'piezo', 'ldr', 'flex', 'fsr', 'led-bar', 'pixel',
  'tactile', 'tactile-cap', 'arcade', 'slide', 'limit', 'reed', 'tilt', 'touch',
  'dip', 'to92', 'soic', 'seg7', 'probe',
  'servo', 'stepper', 'stepper-28byj', 'dc-motor', 'gear-motor', 'fan', 'speaker', 'pump', 'encoder',
  'relay-module', 'solenoid', 'valve', 'ssr', 'box',
];
export const COMPONENT_TYPES: PartComponent['type'][] = [
  'chip', 'crystal', 'transducer', 'dome', 'terminal', 'relay', 'trimpot', 'led', 'smd', 'capacitor', 'jst', 'button',
  'can', 'shield', 'antenna', 'socket', 'inductor', 'lens', 'mic', 'knob', 'usb', 'diode', 'resistor', 'digits', 'battery', 'coil', 'patch', 'heatsink', 'block',
];
const PACKAGES: NonNullable<PartComponent['package']>[] = ['qfn', 'lga', 'soic', 'tssop', 'msop', 'sot23', 'sot223', 'dip', 'lqfp'];
const DISPLAY_COLORS: PartDisplay['color'][] = ['mono', 'gray4', 'rgb565', 'rgb666', 'epaper', 'lcd', 'led'];
export const CATEGORIES: PartDef['category'][] = ['sensor', 'display', 'output', 'input'];
export const BUSES: NonNullable<PartDef['bus']>[] = ['i2c', 'spi', 'onewire', 'gpio', 'analog', 'parallel8', 'rgb'];

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'part';
}

const bad = (msg: string): Result<PartDef> => ({
  ok: false,
  error: { code: 'invalid_part', humanMessage: msg, hint: 'Fix the field and save again.' },
});

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Returns a clean PartDef or a plain-language error. Unknown fields are dropped. */
export function validatePartDef(raw: unknown): Result<PartDef> {
  if (typeof raw !== 'object' || raw === null) return bad('The part is empty.');
  const o = raw as Record<string, unknown>;
  const name = str(o.name, 80);
  if (!name) return bad('The part needs a name.');
  const id = str(o.id, 60) ? slugify(str(o.id, 60)) : slugify(name);
  const category = CATEGORIES.includes(o.category as PartDef['category']) ? (o.category as PartDef['category']) : 'sensor';
  const bus = BUSES.includes(o.bus as NonNullable<PartDef['bus']>) ? (o.bus as PartDef['bus']) : undefined;

  if (!Array.isArray(o.pins) || o.pins.length === 0) return bad('The part needs at least one pin.');
  if (o.pins.length > 24) return bad('Parts can have at most 24 pins in this version.');
  const pins: PartDef['pins'] = [];
  const seen = new Set<string>();
  for (const p of o.pins) {
    const po = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
    const pname = str(po.name, 12).toUpperCase();
    if (!pname) return bad('Every pin needs a name, like VCC or SDA.');
    if (seen.has(pname)) return bad(t('Two pins are called {name}. Pin names must be different.', { name: pname }));
    seen.add(pname);
    const role = PIN_ROLES.includes(po.role as PartPinRole) ? (po.role as PartPinRole) : 'passive';
    const pin: PartDef['pins'][number] = { name: pname, role };
    if (po.needsOutput === true || role === 'digital_in') pin.needsOutput = true;
    const notes = str(po.notes, 160);
    if (notes) pin.notes = notes;
    pins.push(pin);
  }

  const voltage = /^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(str(o.voltage, 12)) ? str(o.voltage, 12) : '3.3';
  const addresses = Array.isArray(o.addresses)
    ? o.addresses.map((a) => str(a, 6)).filter((a) => /^0x[0-7][0-9a-f]$/i.test(a)).map((a) => '0x' + a.slice(2).toUpperCase())
    : undefined;

  const m = (typeof o.model === 'object' && o.model !== null ? o.model : {}) as Record<string, unknown>;
  const shape = SHAPES.includes(m.shape as PartShape) ? (m.shape as PartShape) : 'breakout';
  const sizeRaw = Array.isArray(m.size) ? m.size.map(Number) : [];
  const size: [number, number, number] = [
    clamp(sizeRaw[0], 3, 150, 15),
    clamp(sizeRaw[1], 3, 150, 15),
    clamp(sizeRaw[2], 0.5, 120, 1.6),
  ];
  // the pin row must fit on the part
  size[0] = Math.max(size[0], pins.length * 2.54 + 1);
  for (let i = 0; i < 3; i++) size[i] = Math.round(size[i] * 10) / 10;
  const color = /^#[0-9a-f]{6}$/i.test(str(m.color, 7)) ? str(m.color, 7) : '#2E6FD8';

  const model: PartDef['model'] = { shape, size, color };
  if (KINDS.includes(m.kind as PartKind)) model.kind = m.kind as PartKind;
  if (Array.isArray(m.components)) {
    const comps = m.components.slice(0, 24).map((c) => validateComponent(c, size)).filter((c): c is PartComponent => !!c);
    if (comps.length) model.components = comps;
  }
  if (m.outline === 'probe' || m.outline === 'round') model.outline = m.outline;
  const silk = str(m.silk, 24);
  if (silk) model.silk = silk;
  if (HEX_COLOR.test(str(m.pcb, 7))) model.pcb = str(m.pcb, 7);

  const def: PartDef = {
    id,
    name,
    category,
    pins,
    voltage,
    model,
    keywords: Array.isArray(o.keywords) ? o.keywords.map((k) => str(k, 30).toLowerCase()).filter(Boolean).slice(0, 12) : [name.toLowerCase()],
    sources: Array.isArray(o.sources)
      ? o.sources
          .map((s) => (typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {}))
          .map((s) => ({ title: str(s.title, 120), section: str(s.section, 160) || undefined }))
          .filter((s) => s.title)
          .slice(0, 6)
      : [],
  };
  if (Array.isArray(o.gotchas)) {
    const g = o.gotchas
      .map((x) => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {}))
      .map((x) => {
        const src = (typeof x.source === 'object' && x.source !== null ? x.source : {}) as Record<string, unknown>;
        const when = ['logic3v3', 'logic5v', 'avr', 'esp32'].includes(x.when as string) ? (x.when as PartGotcha['when']) : undefined;
        return { text: str(x.text, 400), ...(when ? { when } : {}), source: { title: str(src.title, 120), section: str(src.section, 160) || undefined } };
      })
      .filter((x) => x.text && x.source.title)
      .slice(0, 8);
    if (g.length) def.gotchas = g;
  }
  const cur = o.current as Record<string, unknown> | undefined;
  if (cur && typeof cur.typMa === 'number' && cur.typMa >= 0 && cur.typMa < 10000) {
    const src = (typeof cur.source === 'object' && cur.source !== null ? cur.source : {}) as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === 'number' && v >= 0 && v < 10000 ? v : undefined);
    if (str(src.title)) {
      def.current = { typMa: cur.typMa, note: str(cur.note, 300), source: { title: str(src.title, 120), section: str(src.section, 200) || undefined } };
      if (n(cur.sleepMa) !== undefined) def.current.sleepMa = n(cur.sleepMa);
      if (n(cur.peakMa) !== undefined) def.current.peakMa = n(cur.peakMa);
    }
  }
  if (bus) def.bus = bus;
  if (addresses?.length) def.addresses = addresses;
  if (Array.isArray(o.measures)) def.measures = o.measures.map((x) => str(x, 30)).filter(Boolean).slice(0, 8);
  if (o.pullupsOnBoard === true) def.pullupsOnBoard = true;
  const ic = o.idCheck as Record<string, unknown> | undefined;
  if (ic && /^0x[0-9a-f]{1,2}$/i.test(str(ic.register)) && /^0x[0-9a-f]{1,2}$/i.test(str(ic.expect))) {
    def.idCheck = { register: str(ic.register), expect: str(ic.expect).toLowerCase() };
  }
  if (typeof o.image === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(o.image) && o.image.length < 120000) {
    def.image = o.image;
  }
  const origin = o.origin as Record<string, unknown> | undefined;
  if (origin) {
    const url = str(origin.url, 500);
    def.origin = {
      url: /^https?:\/\//i.test(url) ? url : undefined,
      importedAt: str(origin.importedAt, 40) || new Date().toISOString(),
      method: origin.method === 'ai' ? 'ai' : 'manual',
    };
  }
  const display = validateDisplay(o.display);
  if (display) def.display = display;
  const regs = validateRegisterMap(o.registers);
  if (regs) def.registers = regs;
  const regFrom = str(o.registersFrom, 60);
  if (regFrom && !regs) def.registersFrom = slugify(regFrom);
  if (bus === 'i2c' && (!pins.some((p) => p.role === 'i2c_sda') || !pins.some((p) => p.role === 'i2c_scl'))) {
    return bad('An I2C part needs one pin with role SDA and one with role SCL.');
  }
  return { ok: true, value: def };
}

function clamp(v: number | undefined, min: number, max: number, dflt: number) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 1000) / 1000 : undefined);
const pair = (v: unknown, min: number, max: number): [number, number] | undefined => {
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const a = num(v[0], min, max);
  const b = num(v[1], min, max);
  return a !== undefined && b !== undefined ? [a, b] : undefined;
};

/** A component on the part's PCB; dropped when it is unknown or outside the part. */
function validateComponent(raw: unknown, size: [number, number, number]): PartComponent | null {
  const c = obj(raw);
  if (!COMPONENT_TYPES.includes(c.type as PartComponent['type'])) return null;
  const at = pair(c.at, -150, 150);
  if (!at || Math.abs(at[0]) > size[0] / 2 + 1 || Math.abs(at[1]) > size[1] / 2 + 1) return null;
  const sz = Array.isArray(c.size) ? c.size.map((v) => num(v, 0.2, 150)) : [];
  if (sz.length < 2 || sz.length > 3 || sz.some((v) => v === undefined)) return null;
  const comp: PartComponent = { type: c.type as PartComponent['type'], at, size: sz as [number, number] | [number, number, number] };
  const label = str(c.label, 24);
  if (label) comp.label = label;
  if (PACKAGES.includes(c.package as NonNullable<PartComponent['package']>)) comp.package = c.package as PartComponent['package'];
  if (c.metal === true) comp.metal = true;
  if (HEX_COLOR.test(str(c.color, 7))) comp.color = str(c.color, 7);
  const count = num(c.count, 1, 16);
  if (count !== undefined) comp.count = Math.round(count);
  if (c.rot === true) comp.rot = true;
  return comp;
}

/** The display's resolution and active area; dropped unless complete and sourced. */
export function validateDisplay(raw: unknown): PartDisplay | undefined {
  const d = obj(raw);
  const widthPx = num(d.widthPx, 1, 4096);
  const heightPx = num(d.heightPx, 1, 4096);
  const activeMm = pair(d.activeMm, 1, 400);
  const source = regSource(d.source);
  if (!widthPx || !heightPx || !activeMm || !source.title || !DISPLAY_COLORS.includes(d.color as PartDisplay['color'])) return undefined;
  const out: PartDisplay = { widthPx: Math.round(widthPx), heightPx: Math.round(heightPx), activeMm, color: d.color as PartDisplay['color'], source: { title: source.title, ...(source.section ? { section: source.section } : {}) } };
  const glass = pair(d.glassMm, 1, 400);
  if (glass) out.glassMm = glass;
  const center = pair(d.centerMm, -200, 200);
  if (center) out.centerMm = center;
  const controller = str(d.controller, 20);
  if (/^[A-Za-z0-9]{3,20}$/.test(controller)) out.controller = controller.toUpperCase();
  if (HEX_COLOR.test(str(d.tint, 7))) out.tint = str(d.tint, 7);
  if (HEX_COLOR.test(str(d.glassColor, 7))) out.glassColor = str(d.glassColor, 7);
  if (d.round === true) out.round = true;
  const chars = pair(d.chars, 1, 80);
  if (chars) out.chars = [Math.round(chars[0]), Math.round(chars[1])];
  const digits = num(d.digits, 1, 16);
  if (digits) out.digits = Math.round(digits);
  return out;
}

/* ---------- register maps ---------- */

const ACCESS: RegAccess[] = ['r', 'rw', 'w'];
const HEX_RE = /^0x[0-9a-f]{1,8}$/i;
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const access = (v: unknown): RegAccess => (ACCESS.includes(v as RegAccess) ? (v as RegAccess) : 'r');
const regSource = (v: unknown) => {
  const s = obj(v);
  return { title: str(s.title, 120), section: str(s.section, 200) };
};
/** Meaning table: keys matching keyRe, non-empty texts. */
function meanings(v: unknown, keyRe: RegExp): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, text] of Object.entries(obj(v)).slice(0, 64)) {
    const t = str(text, 300);
    if (keyRe.test(k) && t) out[k] = t;
  }
  return Object.keys(out).length ? out : undefined;
}

function validateField(raw: unknown): RegisterField | null {
  const f = obj(raw);
  const bits = Array.isArray(f.bits) ? f.bits.map(Number) : [];
  const [hi, lo] = bits;
  if (!Number.isInteger(hi) || !Number.isInteger(lo) || hi > 7 || lo < 0 || hi < lo) return null;
  const name = str(f.name, 40);
  if (!name) return null;
  const field: RegisterField = { bits: [hi, lo], name, text: str(f.text, 300), access: access(f.access) };
  const values = meanings(f.values, /^\d{1,3}$/);
  if (values) field.values = values;
  if (f.reserved === true) field.reserved = true;
  return field;
}

function validateRegister(raw: unknown): RegisterDef | null {
  const r = obj(raw);
  const addr = str(r.addr, 6);
  const name = str(r.name, 40);
  const source = regSource(r.source);
  if (!/^0x[0-9a-f]{1,2}$/i.test(addr) || !name || !source.title) return null;
  const reg: RegisterDef = { addr, name, text: str(r.text, 300), access: access(r.access), source };
  const len = Number(r.len);
  if (Number.isInteger(len) && len >= 2 && len <= 4) reg.len = len;
  const shift = Number(r.shift);
  if (Number.isInteger(shift) && shift >= 1 && shift <= 7) reg.shift = shift;
  if (r.signed === true) reg.signed = true;
  if (HEX_RE.test(str(r.reset, 12))) reg.reset = str(r.reset, 12);
  if (Array.isArray(r.fields)) {
    const fields = r.fields.slice(0, 8).map(validateField).filter((f): f is RegisterField => !!f);
    // fields must not overlap
    const used = new Set<number>();
    const clean = fields.filter((f) => {
      for (let b = f.bits[1]; b <= f.bits[0]; b++) if (used.has(b)) return false;
      for (let b = f.bits[1]; b <= f.bits[0]; b++) used.add(b);
      return true;
    });
    if (clean.length && (reg.len ?? 1) === 1) reg.fields = clean;
  }
  const values = meanings(r.values, HEX_RE);
  if (values) reg.values = values;
  return reg;
}

function validateCommand(raw: unknown): CommandDef | null {
  const c = obj(raw);
  const code = str(c.code, 20);
  const name = str(c.name, 60);
  const source = regSource(c.source);
  if (!/^0x[0-9a-f]{2}([-,/ ]+0x[0-9a-f]{2})?$/i.test(code) || !name || !source.title) return null;
  const cmd: CommandDef = { code, name, text: str(c.text, 300), source };
  const params = Number(c.params);
  if (Number.isInteger(params) && params >= 1 && params <= 8) cmd.params = params;
  return cmd;
}

/** A clean register map, or undefined when there is nothing usable. Invalid entries are dropped. */
export function validateRegisterMap(raw: unknown): RegisterMapDef | undefined {
  const m = obj(raw);
  if (!Array.isArray(m.registers)) return undefined;
  const registers = m.registers.slice(0, 96).map(validateRegister).filter((r): r is RegisterDef => !!r);
  const commands = Array.isArray(m.commands) ? m.commands.slice(0, 64).map(validateCommand).filter((c): c is CommandDef => !!c) : [];
  if (!registers.length && !commands.length) return undefined;
  const map: RegisterMapDef = { registers };
  const note = str(m.note, 400);
  if (note) map.note = note;
  if (commands.length) map.commands = commands;
  return map;
}
