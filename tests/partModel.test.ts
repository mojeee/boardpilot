// The 3D model data of parts: body kinds, PCB components and display specs in parts/*.json, and
// the layout maths in shared/partModel.ts (pin heights, where a display's pixels are).

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validatePartDef, validateDisplay } from '@shared/partSchema';
import { PARTS } from '@shared/board';
import type { PartDef } from '@shared/types';
import { PCB_T, SPACER_H, displayLayout, hasHeader, partComponents, partKind, partPinPoint, pcbTop } from '@shared/partModel';
import { displayArea } from '@shared/partModel';

const DIR = join(__dirname, '..', 'parts');
const RAW = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as PartDef);

/** The display parts named in the 3D realism brief: each one has a sourced `display`. */
const DISPLAYS = [
  'ssd1306-i2c', 'ssd1306-spi', 'ssd1306-128x32', 'sh1106-oled', 'st7789-240', 'st7789-tft-169', 'st7789-tft-20',
  'st7735-tft-096', 'st7735-tft-18', 'ili9341-tft-28', 'ili9488-tft-35', 'st7796-tft-35', 'gc9a01-round',
  'epaper-154', 'epaper-213', 'epaper-29', 'epaper-42', 'lcd1602-i2c', 'lcd1602-parallel', 'lcd2004-i2c',
  'nokia5110-lcd', 'max7219-matrix', 'max7219-7seg', 'lcd12864-st7920',
];

describe('part model data', () => {
  it('keeps kind, components, outline, silk and pcb colour through validation', () => {
    for (const raw of RAW) {
      const r = validatePartDef(raw);
      expect(r.ok, raw.id).toBe(true);
      if (!r.ok) continue;
      expect(r.value.model, raw.id).toEqual({ ...raw.model, size: r.value.model.size });
      expect(r.value.display, raw.id).toEqual(raw.display);
    }
  });

  it('gives the most used parts a recognisable model (a kind or components)', () => {
    const modelled = RAW.filter((p) => p.model.kind || p.model.components?.length || p.display);
    expect(modelled.length).toBeGreaterThanOrEqual(30);
    for (const id of ['bme280-gy', 'hc-sr04', 'hc-sr501', 'relay-1ch', 'servo-sg90', 'soil-moisture-capacitive', 'mq2', 'tm1637-4digit'])
      expect(PARTS[id].model.kind || PARTS[id].model.components, id).toBeTruthy();
  });

  it('puts every component on its part', () => {
    for (const p of RAW)
      for (const c of p.model.components ?? []) {
        const [w, d] = p.model.size;
        expect(Math.abs(c.at[0]) <= w / 2 + 1 && Math.abs(c.at[1]) <= d / 2 + 1, `${p.id} ${c.type}`).toBe(true);
      }
  });

  it('describes every display part with a resolution, an active area and a source', () => {
    for (const id of DISPLAYS) {
      const d = PARTS[id].display;
      expect(d, id).toBeTruthy();
      expect(d!.widthPx * d!.heightPx).toBeGreaterThan(0);
      expect(d!.source.title.length, id).toBeGreaterThan(5);
      expect(d!.source.section?.length ?? 0, id).toBeGreaterThan(5);
    }
    // unconfirmed values say so
    expect(PARTS['nokia5110-lcd'].display!.source.section).toMatch(/^estimate/);
  });
});

describe('display layout', () => {
  it('keeps the active area inside the part and at the panel aspect', () => {
    for (const id of DISPLAYS) {
      const def = PARTS[id];
      const lay = displayLayout(def)!;
      const [w, d] = def.model.size;
      expect(Math.abs(lay.active.x) + lay.active.w / 2, id).toBeLessThanOrEqual(w / 2 + 0.01);
      expect(Math.abs(lay.active.z) + lay.active.d / 2, id).toBeLessThanOrEqual(d / 2 + 0.01);
      const [aw, ad] = def.display!.activeMm;
      expect(lay.active.w / lay.active.d, id).toBeCloseTo(aw / ad, 1);
      expect(lay.top).toBeGreaterThan(PCB_T);
    }
  });

  it('clear of the pin header', () => {
    const def = PARTS['ssd1306-i2c'];
    const lay = displayLayout(def)!;
    const pinZ = partPinPoint(def, 0)[2];
    expect(lay.glass.z - lay.glass.d / 2).toBeGreaterThan(pinZ + 1.2);
  });

  it('is what the display texture hook reports', () => {
    const area = displayArea(PARTS['ssd1306-i2c'])!;
    expect([area.widthPx, area.heightPx]).toEqual([128, 64]);
    expect(area.activeMm).toEqual([21.744, 10.864]);
    expect(displayArea(PARTS['bme280-gy'])).toBeNull();
  });
});

describe('pins on the model', () => {
  it('header parts: the wire plugs on at the top of the spacer', () => {
    for (const id of ['bme280-gy', 'hc-sr04', 'ssd1306-i2c', 'relay-1ch']) {
      const def = PARTS[id];
      expect(hasHeader(def), id).toBe(true);
      expect(partPinPoint(def, 0)[1], id).toBeCloseTo(pcbTop(def) + SPACER_H);
    }
  });

  it('legged parts: the pins end outside the body', () => {
    for (const id of ['led-resistor', 'push-button', 'servo-sg90', 'potentiometer']) {
      const def = PARTS[id];
      expect(hasHeader(def)).toBe(false);
      expect(-partPinPoint(def, 0)[2], id).toBeGreaterThan(def.model.size[1] / 2);
    }
  });

  it('a breakout without components still gets a chip', () => {
    const def = PARTS['ads1115'];
    expect(def.model.components).toBeUndefined();
    expect(partComponents(def).some((c) => c.type === 'chip')).toBe(true);
    expect(partKind(PARTS['ds18b20-to92'])).toBe('to92');
  });
});

describe('validation of user parts', () => {
  it('drops unknown kinds, components off the part and displays without a source', () => {
    const r = validatePartDef({
      name: 'Test',
      pins: [{ name: 'VCC', role: 'power' }],
      model: { shape: 'module', size: [20, 10, 3], color: '#123456', kind: 'spaceship', components: [{ type: 'chip', at: [40, 0], size: [3, 3] }, { type: 'chip', at: [0, 0], size: [3, 3], package: 'qfn' }] },
      display: { widthPx: 128, heightPx: 64, activeMm: [20, 10], color: 'mono' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.model.kind).toBeUndefined();
    expect(r.value.model.components).toEqual([{ type: 'chip', at: [0, 0], size: [3, 3], package: 'qfn' }]);
    expect(r.value.display).toBeUndefined();
    expect(validateDisplay({ widthPx: 8, heightPx: 8, activeMm: [30, 30], color: 'led', source: { title: 'Datasheet', section: '1' } })?.widthPx).toBe(8);
  });
});
