// Validation for part definitions: user-imported parts are data from outside the app,
// so every field is checked before the part enters the library.

import type { PartDef, PartGotcha, PartPinRole, PartShape, Result } from './types';
import { t } from './i18n';

export const PIN_ROLES: PartPinRole[] = [
  'power', 'ground', 'i2c_sda', 'i2c_scl', 'spi_mosi', 'spi_miso', 'spi_sck', 'spi_cs',
  'digital_in', 'digital_out', 'analog_out', 'onewire', 'int', 'passive',
];
export const SHAPES: PartShape[] = ['breakout', 'module', 'chip', 'oled', 'led', 'button', 'pot', 'dht', 'motor', 'relay'];
export const CATEGORIES: PartDef['category'][] = ['sensor', 'display', 'output', 'input'];
export const BUSES: NonNullable<PartDef['bus']>[] = ['i2c', 'spi', 'onewire', 'gpio', 'analog'];

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

  const def: PartDef = {
    id,
    name,
    category,
    pins,
    voltage,
    model: { shape, size, color },
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
  if (bus === 'i2c' && (!pins.some((p) => p.role === 'i2c_sda') || !pins.some((p) => p.role === 'i2c_scl'))) {
    return bad('An I2C part needs one pin with role SDA and one with role SCL.');
  }
  return { ok: true, value: def };
}

function clamp(v: number | undefined, min: number, max: number, dflt: number) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
}
