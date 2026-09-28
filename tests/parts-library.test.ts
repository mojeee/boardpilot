// Built-in parts library: every file in /parts must be a valid part definition that the app
// can load as-is (shared/board.ts imports the raw JSON without re-validating it).

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validatePartDef } from '@shared/partSchema';
import type { PartDef } from '@shared/types';

const DIR = join(__dirname, '..', 'parts');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const RAW = FILES.map((f) => ({ file: f, raw: JSON.parse(readFileSync(join(DIR, f), 'utf8')) as PartDef }));

describe('built-in parts library', () => {
  it('has at least 90 parts', () => expect(FILES.length).toBeGreaterThanOrEqual(90));

  it('has unique ids', () => {
    const ids = RAW.map((r) => r.raw.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  describe.each(RAW)('$file', ({ file, raw }) => {
    const r = validatePartDef(raw);

    it('passes validation', () => {
      expect(r.ok ? '' : r.error.humanMessage).toBe('');
    });

    it('has an id equal to the file name', () => {
      expect(r.ok && r.value.id).toBe(file.replace(/\.json$/, ''));
      expect(raw.id).toBe(file.replace(/\.json$/, ''));
    });

    it('has pins with uppercase unique names', () => {
      expect(raw.pins.length).toBeGreaterThan(0);
      expect(raw.pins.every((p) => p.name === p.name.toUpperCase())).toBe(true);
      expect(new Set(raw.pins.map((p) => p.name)).size).toBe(raw.pins.length);
      // validation keeps every pin and role, so the raw file is what the app uses
      expect(r.ok && r.value.pins.map((p) => `${p.name}:${p.role}`)).toEqual(raw.pins.map((p) => `${p.name}:${p.role}`));
    });

    it('lists I2C addresses when it is an I2C part', () => {
      if (raw.bus !== 'i2c') return;
      expect(raw.addresses?.length ?? 0).toBeGreaterThan(0);
      expect(raw.addresses?.every((a) => /^0x[0-7][0-9A-F]$/.test(a))).toBe(true);
      expect(r.ok && r.value.addresses).toEqual(raw.addresses);
    });

    it('keeps its data after validation (voltage, model shape and colour, keywords, sources)', () => {
      if (!r.ok) return;
      expect(r.value.voltage).toBe(raw.voltage);
      expect(r.value.model.shape).toBe(raw.model.shape);
      expect(r.value.model.color).toBe(raw.model.color);
      expect(raw.keywords.length).toBeGreaterThan(0);
      expect(raw.sources.length).toBeGreaterThan(0);
    });
  });
});
