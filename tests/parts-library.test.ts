// Built-in parts library: every file in /parts must be a valid part definition that the app
// can load as-is (shared/board.ts imports the raw JSON without re-validating it).

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validatePartDef } from '@shared/partSchema';
import type { PartDef } from '@shared/types';
import { IT } from '@shared/i18n';
import { PARTS, getBoard, gotchasFor } from '@shared/board';

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

describe('part gotchas', () => {
  const withGotchas = RAW.filter(({ raw }) => Array.isArray((raw as { gotchas?: unknown[] }).gotchas));

  it('covers the most used parts', () => expect(withGotchas.length).toBeGreaterThanOrEqual(25));

  it('every gotcha has a source, a known condition and an Italian translation', () => {
    for (const { file, raw } of withGotchas) {
      for (const g of (raw as { gotchas: { text: string; when?: string; source?: { title?: string; section?: string } }[] }).gotchas) {
        expect(g.source?.title, file).toBeTruthy();
        expect(g.source?.section, file).toBeTruthy();
        expect([undefined, 'logic3v3', 'logic5v', 'avr', 'esp32'], file).toContain(g.when);
        expect(IT[g.text], `${file}: ${g.text}`).toBeTruthy();
      }
    }
  });

  it('keeps gotchas when a user part is validated', () => {
    const r = validatePartDef({ ...PARTS['hc-sr04'], id: 'my-sonar' });
    expect(r.ok && r.value.gotchas?.length).toBe(PARTS['hc-sr04'].gotchas?.length);
  });

  it('shows board-specific gotchas only on the boards they are about', () => {
    const esp = getBoard('esp32-devkitc-30');
    const uno = getBoard('arduino-uno-r3');
    const divider = (b: typeof esp) => gotchasFor(PARTS['hc-sr04'], b).some((g) => /divider/.test(g.text));
    expect(divider(esp)).toBe(true);
    expect(divider(uno)).toBe(false);
    const ram = (b: typeof esp) => gotchasFor(PARTS['ssd1306-i2c'], b).some((g) => /RAM/.test(g.text));
    expect(ram(uno)).toBe(true);
    expect(ram(esp)).toBe(false);
  });
});
