// Register maps: the data in the part files and the decoder that turns bytes into datasheet fields.
// Worked values come from the datasheets cited in the part files.

import { describe, expect, it } from 'vitest';
import { PARTS } from '@shared/board';
import { IT } from '@shared/i18n';
import { validatePartDef, validateRegisterMap } from '@shared/partSchema';
import { bytesFromAgent, decodeBurst, decodeRegister, fieldValue, parseHex, readPlan, registerMapFor, registerTexts, summarize } from '@shared/regmap';
import type { RegisterDef, RegisterMapDef } from '@shared/types';
import { SimWorld, SCENARIOS } from '../app/main/sim/simWorld';

const mapOf = (id: string): RegisterMapDef => {
  const m = registerMapFor(PARTS[id], PARTS);
  if (!m) throw new Error(`no register map for ${id}`);
  return m;
};
const reg = (id: string, name: string): RegisterDef => {
  const r = mapOf(id).registers.find((x) => x.name === name);
  if (!r) throw new Error(`${id}: no register ${name}`);
  return r;
};
const decode = (id: string, name: string, ...bytes: number[]) => {
  const d = decodeRegister(reg(id, name), bytes);
  if (!d) throw new Error('not decoded');
  return d;
};
const field = (d: ReturnType<typeof decode>, name: string) => d.fields.find((f) => f.name === name);

describe('register map data', () => {
  const ids = ['bme280-gy', 'mpu6050', 'ssd1306-i2c', 'ssd1306-128x32'];

  it.each(ids)('%s has a register map with datasheet sources', (id) => {
    const m = mapOf(id);
    expect(m.registers.length).toBeGreaterThan(0);
    for (const r of m.registers) {
      expect(r.source.title, r.name).toBeTruthy();
      expect(r.source.section, r.name).toBeTruthy();
      expect(parseHex(r.addr), r.name).not.toBeNull();
    }
    for (const c of m.commands ?? []) expect(c.source.section, c.name).toBeTruthy();
  });

  it.each(ids)('%s: fields fit in one byte and do not overlap', (id) => {
    for (const r of mapOf(id).registers) {
      const used = new Set<number>();
      for (const f of r.fields ?? []) {
        expect(f.bits[0]).toBeLessThanOrEqual(7);
        expect(f.bits[1]).toBeGreaterThanOrEqual(0);
        expect(f.bits[0]).toBeGreaterThanOrEqual(f.bits[1]);
        for (let b = f.bits[1]; b <= f.bits[0]; b++) {
          expect(used.has(b), `${r.name}.${f.name} bit ${b}`).toBe(false);
          used.add(b);
        }
        for (const k of Object.keys(f.values ?? {})) expect(Number(k)).toBeLessThan(2 ** (f.bits[0] - f.bits[1] + 1));
      }
    }
  });

  it('survives validation unchanged (so user parts can carry register maps too)', () => {
    for (const id of ['bme280-gy', 'mpu6050', 'ssd1306-i2c']) {
      expect(validateRegisterMap(PARTS[id].registers)).toEqual(PARTS[id].registers);
      const r = validatePartDef(PARTS[id]);
      expect(r.ok && r.value.registers).toEqual(PARTS[id].registers);
    }
    const small = validatePartDef(PARTS['ssd1306-128x32']);
    expect(small.ok && small.value.registersFrom).toBe('ssd1306-i2c');
  });

  it('drops broken entries from imported maps', () => {
    const m = validateRegisterMap({
      registers: [
        { addr: 'zz', name: 'bad', access: 'r', text: '', source: { title: 'x', section: 'y' } },
        { addr: '0x10', name: 'ok', access: 'rw', text: 'fine', source: { title: 'x', section: 'y' }, fields: [{ bits: [9, 0], name: 'toobig', access: 'rw', text: '' }] },
      ],
    });
    expect(m?.registers.map((r) => r.name)).toEqual(['ok']);
    expect(m?.registers[0].fields).toBeUndefined();
    expect(validateRegisterMap({ registers: 'nope' })).toBeUndefined();
  });

  it('has an Italian translation for every text shown from the maps', () => {
    for (const id of ['bme280-gy', 'mpu6050', 'ssd1306-i2c']) {
      const missing = registerTexts(mapOf(id)).filter((s) => !IT[s]);
      expect(missing, id).toEqual([]);
    }
  });
});

describe('decoder', () => {
  it('reads bit fields', () => {
    expect(fieldValue(0x27, [7, 5])).toBe(1);
    expect(fieldValue(0x27, [4, 2])).toBe(1);
    expect(fieldValue(0x27, [1, 0])).toBe(3);
    expect(fieldValue(0x40, [6, 6])).toBe(1);
  });

  it('BME280 ctrl_meas 0x27: temperature ×1, pressure ×1, normal mode (datasheet 5.4.5)', () => {
    const d = decode('bme280-gy', 'ctrl_meas', 0x27);
    expect(d.hex).toBe('0x27');
    expect(field(d, 'osrs_t')?.bin).toBe('001');
    expect(field(d, 'osrs_t')?.meaning).toBe('Oversampling ×1');
    expect(field(d, 'osrs_p')?.meaning).toBe('Oversampling ×1');
    expect(field(d, 'mode')?.meaning).toMatch(/^Normal mode/);
    expect(summarize(d)).toBe(
      'ctrl_meas = 0x27 → osrs_t: Oversampling ×1, osrs_p: Oversampling ×1, mode: Normal mode: measures again and again, with the standby time from config.',
    );
  });

  it('BME280 ctrl_meas 0xB7 (Adafruit defaults) and 0x00 (after reset: sleep, nothing measured)', () => {
    const lib = decode('bme280-gy', 'ctrl_meas', 0xb7);
    expect(field(lib, 'osrs_t')?.meaning).toBe('Oversampling ×16');
    expect(field(lib, 'mode')?.value).toBe(3);
    const off = decode('bme280-gy', 'ctrl_meas', 0x00);
    expect(field(off, 'mode')?.meaning).toMatch(/^Sleep mode/);
    expect(field(off, 'osrs_t')?.meaning).toMatch(/^Skipped/);
    expect(off.isReset).toBe(true);
    expect(lib.isReset).toBe(false);
  });

  it('BME280 chip id: 0x60 is a BME280, 0x58 a BMP280, anything else is not guessed', () => {
    expect(decode('bme280-gy', 'id', 0x60).meaning).toMatch(/^BME280/);
    expect(decode('bme280-gy', 'id', 0x58).meaning).toMatch(/BMP280: no humidity/);
    expect(decode('bme280-gy', 'id', 0x42).meaning).toBeNull();
  });

  it('BME280 config 0xA0: 1000 ms standby, filter off; bit 1 is left uninterpreted', () => {
    const d = decode('bme280-gy', 'config', 0xa0);
    expect(field(d, 't_sb')?.meaning).toBe('Pause of 1000 ms');
    expect(field(d, 'filter')?.meaning).toBe('Filter off');
    const gap = d.fields.find((f) => f.undescribed);
    expect(gap?.bits).toEqual([1, 1]);
    expect(gap?.meaning).toBeNull();
    expect(d.fields.map((f) => f.bits[0])).toEqual([7, 4, 1, 0]);
  });

  it('BME280 20-bit results: 0x80 0x00 0x00 means no measurement yet (datasheet 5.4.7)', () => {
    const none = decode('bme280-gy', 'press', 0x80, 0x00, 0x00);
    expect(none.hex).toBe('0x80000');
    expect(none.value).toBe(0x80000);
    expect(none.meaning).toMatch(/^No result/);
    const some = decode('bme280-gy', 'temp', 0x7e, 0xed, 0x00);
    expect(some.value).toBe(0x7eed0);
    expect(some.meaning).toBeNull();
    expect(decode('bme280-gy', 'hum', 0x80, 0x00).meaning).toMatch(/^No result/);
  });

  it('MPU6050 WHO_AM_I 0x68, and 0x70 is an MPU6500 clone (RM 4.32)', () => {
    expect(decode('mpu6050', 'WHO_AM_I', 0x68).meaning).toMatch(/^MPU6050/);
    expect(decode('mpu6050', 'WHO_AM_I', 0x70).meaning).toMatch(/MPU6500/);
  });

  it('MPU6050 PWR_MGMT_1 0x40: asleep, and says which bit to clear (RM 4.28)', () => {
    const d = decode('mpu6050', 'PWR_MGMT_1', 0x40);
    expect(field(d, 'SLEEP')?.value).toBe(1);
    expect(field(d, 'SLEEP')?.meaning).toMatch(/asleep.*clear bit 6/);
    expect(field(d, 'CLKSEL')?.meaning).toBe('Internal 8 MHz oscillator.');
    expect(d.isReset).toBe(true);
    const awake = decode('mpu6050', 'PWR_MGMT_1', 0x01);
    expect(field(awake, 'SLEEP')?.meaning).toMatch(/^Awake/);
    expect(field(awake, 'CLKSEL')?.meaning).toMatch(/X axis gyro/);
  });

  it('MPU6050 ranges and signed results', () => {
    expect(field(decode('mpu6050', 'ACCEL_CONFIG', 0x18), 'AFS_SEL')?.meaning).toBe('Range ±16 g');
    expect(field(decode('mpu6050', 'GYRO_CONFIG', 0x08), 'FS_SEL')?.meaning).toBe('Range ±500 °/s');
    // 0xC000 = -16384 = -1 g at ±2 g (RM 4.17)
    const z = decode('mpu6050', 'ACCEL_ZOUT', 0xc0, 0x00);
    expect(z.value).toBe(-16384);
    expect(z.hex).toBe('0xC000');
    expect(decode('mpu6050', 'ACCEL_XOUT', 0x40, 0x00).value).toBe(16384);
    expect(summarize(z)).toBe('ACCEL_ZOUT = 0xC000 → -16384');
  });

  it('SSD1306: only the status byte is read; D6 set means display off', () => {
    const m = mapOf('ssd1306-i2c');
    expect(m.registers.filter((r) => r.access !== 'w').map((r) => r.name)).toEqual(['status']);
    expect(m.commands?.some((c) => c.code === '0xAE-0xAF')).toBe(true);
    const off = decode('ssd1306-i2c', 'status', 0x40);
    expect(field(off, 'ON/OFF')?.meaning).toMatch(/^Display OFF/);
    expect(field(decode('ssd1306-i2c', 'status', 0x00), 'ON/OFF')?.meaning).toBe('Display ON.');
    // bits the datasheet does not describe here are shown but never interpreted
    expect(off.fields.filter((f) => f.undescribed).every((f) => f.meaning === null)).toBe(true);
    expect(mapOf('ssd1306-128x32')).toBe(m);
  });

  it('refuses short reads and bad agent data instead of guessing', () => {
    expect(decodeRegister(reg('bme280-gy', 'press'), [0x80])).toBeNull();
    expect(bytesFromAgent(['0x60', '0x1FF'])).toBeNull();
    expect(bytesFromAgent(['0x60', 'zz'])).toBeNull();
    expect(bytesFromAgent(['0x60', '0x00'])).toEqual([0x60, 0]);
  });
});

describe('read plan', () => {
  it('BME280: never reads the write-only reset register or the undocumented 0xF6', () => {
    const plan = readPlan(mapOf('bme280-gy'));
    expect(plan.map((b) => [b.addr, b.len])).toEqual([
      [0xd0, 1],
      [0xf2, 4],
      [0xf7, 8],
    ]);
    expect(plan.flatMap((b) => b.regs).some((r) => r.name === 'reset')).toBe(false);
  });

  it('MPU6050: the 14 measurement bytes come in one read', () => {
    const plan = readPlan(mapOf('mpu6050'));
    expect(plan.find((b) => b.addr === 0x3b)?.len).toBe(14);
    expect(plan.every((b) => b.len <= 32)).toBe(true);
  });

  it('splits a burst back into decoded registers', () => {
    const burst = readPlan(mapOf('bme280-gy'))[2];
    const bytes = [0x65, 0x5a, 0xc0, 0x7e, 0xed, 0x00, 0x6e];
    expect(decodeBurst(burst, bytes).map((d) => d.reg.name)).toEqual(['press', 'temp']); // one byte short: hum is not decoded
    const all = decodeBurst(burst, [...bytes, 0x9b]);
    expect(all.map((d) => d.reg.name)).toEqual(['press', 'temp', 'hum']);
    expect(all[2].value).toBe(0x6e9b);
    const ctrl = decodeBurst(readPlan(mapOf('bme280-gy'))[1], [0x05, 0x00, 0xb7, 0x00]);
    expect(ctrl.map((d) => d.reg.name)).toEqual(['ctrl_hum', 'status', 'ctrl_meas', 'config']);
  });
});

describe('simulator answers register reads', () => {
  const world = (id: string) => {
    const w = new SimWorld(id);
    w.agentBoot();
    return w;
  };

  it('a BME280 set up by its library: normal mode, ×16', () => {
    const w = world('healthy');
    const r = w.handle({ cmd: 'i2c_read', sda: 21, scl: 22, addr: '0x76', reg: '0xF4', len: 1 });
    const d = decodeRegister(reg('bme280-gy', 'ctrl_meas'), bytesFromAgent(r.data) ?? []);
    expect(d && field(d, 'mode')?.value).toBe(3);
    const id = w.handle({ cmd: 'i2c_read', sda: 21, scl: 22, addr: '0x76', reg: '0xD0', len: 1 });
    expect(id.data).toEqual(['0x60']);
  });

  it('the "motion sensor reads zeros" bench: MPU6050 asleep, OLED status readable', () => {
    expect(SCENARIOS.some((s) => s.id === 'imu-asleep')).toBe(true);
    const w = world('imu-asleep');
    const pm = w.handle({ cmd: 'i2c_read', sda: 21, scl: 22, addr: '0x68', reg: '0x6B', len: 1 });
    const d = decodeRegister(reg('mpu6050', 'PWR_MGMT_1'), bytesFromAgent(pm.data) ?? []);
    expect(d && field(d, 'SLEEP')?.value).toBe(1);
    const who = w.handle({ cmd: 'i2c_read', sda: 21, scl: 22, addr: '0x68', reg: '0x75', len: 1 });
    expect(who.data).toEqual(['0x68']);
    const st = w.handle({ cmd: 'i2c_read', sda: 21, scl: 22, addr: '0x3C', reg: '0x00', len: 1 });
    expect(st.data).toEqual(['0x00']);
    const scan = w.handle({ cmd: 'i2c_scan', sda: 21, scl: 22 });
    expect(scan.found.sort()).toEqual(['0x3C', '0x68']);
  });
});
