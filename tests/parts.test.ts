import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePartDef, slugify } from '@shared/partSchema';
import { guessPartFromText } from '@shared/partHeuristics';
import { PARTS, BUILTIN_PART_IDS } from '@shared/board';
import { htmlToText } from '../app/main/parts/importer';
import { UserParts } from '../app/main/parts/userParts';
import { partPinOffset } from '../app/renderer/three/geometry';

describe('part validation', () => {
  it('accepts a good part and cleans it', () => {
    const r = validatePartDef({
      name: 'HC-SR04 ultrasonic',
      category: 'sensor',
      bus: 'gpio',
      voltage: '5',
      pins: [
        { name: 'vcc', role: 'power' },
        { name: 'TRIG', role: 'digital_in' },
        { name: 'ECHO', role: 'digital_out' },
        { name: 'GND', role: 'ground' },
      ],
      model: { shape: 'module', size: [45, 20, 15], color: '#1f4fa8' },
      extra: 'dropped',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe('hc-sr04-ultrasonic');
      expect(r.value.pins[0].name).toBe('VCC');
      expect(r.value.pins[1].needsOutput).toBe(true);
      expect('extra' in r.value).toBe(false);
    }
  });
  it('rejects duplicate pins, missing names and incomplete I2C', () => {
    expect(validatePartDef({ name: 'x', pins: [{ name: 'A' }, { name: 'a' }] }).ok).toBe(false);
    expect(validatePartDef({ pins: [{ name: 'A' }] }).ok).toBe(false);
    expect(validatePartDef({ name: 'x', bus: 'i2c', pins: [{ name: 'SDA', role: 'i2c_sda' }] }).ok).toBe(false);
  });
  it('makes the part wide enough for its pins and drops invalid addresses', () => {
    const r = validatePartDef({ name: 'x', bus: 'i2c', addresses: ['0x3c', '0x99', 'nope'], pins: Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, role: i === 0 ? 'i2c_sda' : i === 1 ? 'i2c_scl' : 'passive' })), model: { size: [5, 10, 2] } });
    expect(r.ok && r.value.model.size[0]).toBeGreaterThan(8 * 2.54);
    expect(r.ok && r.value.addresses).toEqual(['0x3C']);
  });
  it('slugifies names', () => expect(slugify('GY-521 (MPU6050)!')).toBe('gy-521-mpu6050'));
});

describe('import from a link without AI', () => {
  it('extracts text from HTML and guesses an I2C part', () => {
    const { title, text } = htmlToText(
      '<html><head><title>VL53L0X Time-of-Flight Distance Sensor | Shop</title><script>evil()</script></head><body><h1>VL53L0X</h1><p>I2C interface, address 0x29. Pins: VIN, GND, SCL, SDA, XSHUT. Works at 3.3V and 5V.</p></body></html>',
    );
    expect(text).not.toContain('evil');
    const g = guessPartFromText(title, text, 'https://example.com/vl53');
    const v = validatePartDef(g.draft);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.name).toBe('VL53L0X Time-of-Flight Distance Sensor');
      expect(v.value.bus).toBe('i2c');
      expect(v.value.addresses).toEqual(['0x29']);
      expect(v.value.voltage).toBe('3.3-5');
      expect(v.value.pins.map((p) => p.role)).toEqual(expect.arrayContaining(['power', 'ground', 'i2c_sda', 'i2c_scl']));
    }
    expect(g.notes.join(' ')).toContain('Check every pin');
  });
});

describe('user parts library', () => {
  it('saves, renames on conflict, refuses to delete built-ins', async () => {
    const lib = new UserParts(mkdtempSync(join(tmpdir(), 'bp-parts-')));
    const a = await lib.save({ name: 'GY-BME280 breakout', pins: [{ name: 'VCC', role: 'power' }] });
    expect(a.ok && a.value.id).toBe('gy-bme280-breakout');
    const b = await lib.save({ id: 'bme280-gy', name: 'Clone', pins: [{ name: 'VCC', role: 'power' }] });
    expect(b.ok && b.value.id).toBe('bme280-gy-2');
    expect(PARTS['bme280-gy-2']).toBeDefined();
    expect((await lib.remove('bme280-gy')).ok).toBe(false);
    expect(BUILTIN_PART_IDS.has('bme280-gy')).toBe(true);
    await lib.remove('bme280-gy-2');
    expect(PARTS['bme280-gy-2']).toBeUndefined();
  });
});

describe('part rotation', () => {
  it('rotating a part moves its pins with it', () => {
    const def = PARTS['bme280-gy'];
    const a = partPinOffset({ id: 'b', partId: 'bme280-gy', position: [0, 0, 40], rotation: 0 }, def, 'VIN')!;
    const b = partPinOffset({ id: 'b', partId: 'bme280-gy', position: [0, 0, 40], rotation: 180 }, def, 'VIN')!;
    expect(b.x).toBeCloseTo(-a.x);
    expect(b.z).toBeCloseTo(-a.z);
    const c = partPinOffset({ id: 'b', partId: 'bme280-gy', position: [0, 0, 40], rotation: 90 }, def, 'VIN')!;
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(Math.hypot(a.x, a.z));
  });
});
