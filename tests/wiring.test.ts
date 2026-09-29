import { describe, expect, it } from 'vitest';
import { checkWiring } from '@shared/wiring';
import { getBoard, PARTS } from '@shared/board';
import type { Scene } from '@shared/types';

const board = getBoard();
const bme = (wires: [string, string][]): Scene => ({
  board: board.id,
  parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 0] }],
  wires: wires.map(([bp, pp], i) => ({ id: `w${i}`, from: { part: 'board', pin: bp }, to: { part: 'bme1', pin: pp }, color: '#fff' })),
});
const rules = (s: Scene) => checkWiring(s, board, PARTS).map((f) => f.rule);

describe('wiring rule checker', () => {
  it('accepts a correct BME280 wiring', () => {
    expect(checkWiring(bme([['D21', 'SDA'], ['D22', 'SCL'], ['3V3', 'VIN'], ['GND1', 'GND']]), board, PARTS)).toEqual([]);
  });

  it('flags SDA/SCL crossed against the default pins', () => {
    const f = checkWiring(bme([['D22', 'SDA'], ['D21', 'SCL'], ['3V3', 'VIN'], ['GND1', 'GND']]), board, PARTS);
    expect(f.map((x) => x.rule)).toContain('i2c_swapped');
    expect(f.find((x) => x.rule === 'i2c_swapped')?.targets).toContain('wire:w0');
  });

  it('flags a 3.3 V part on the 5 V pin', () => {
    const f = checkWiring(bme([['D21', 'SDA'], ['D22', 'SCL'], ['VIN', 'VIN'], ['GND1', 'GND']]), board, PARTS);
    expect(f[0]).toMatchObject({ rule: 'voltage_mismatch', severity: 'error' });
  });

  it('flags missing ground', () => {
    expect(rules(bme([['D21', 'SDA'], ['D22', 'SCL'], ['3V3', 'VIN']]))).toContain('missing_ground');
  });

  it('flags I2C on input-only pins', () => {
    expect(rules(bme([['D34', 'SDA'], ['D35', 'SCL'], ['3V3', 'VIN'], ['GND1', 'GND']]))).toContain('output_on_input_only');
  });

  it('flags strapping pins, GPIO 12 with a pulled-up bus as an error', () => {
    const f = checkWiring(bme([['D12', 'SDA'], ['D22', 'SCL'], ['3V3', 'VIN'], ['GND1', 'GND']]), board, PARTS);
    expect(f.find((x) => x.rule === 'strapping_pin')?.severity).toBe('error');
  });

  it('flags an LED on an input-only pin', () => {
    const s: Scene = {
      board: board.id,
      parts: [{ id: 'led1', partId: 'led-resistor', position: [0, 0, 0] }],
      wires: [
        { id: 'a', from: { part: 'board', pin: 'D34' }, to: { part: 'led1', pin: 'A' }, color: '#fff' },
        { id: 'k', from: { part: 'board', pin: 'GND1' }, to: { part: 'led1', pin: 'K' }, color: '#fff' },
      ],
    };
    expect(rules(s)).toEqual(['output_on_input_only']);
  });

  it('flags a potentiometer on a pin without ADC and ADC2 pins as info', () => {
    const pot = (pin: string): Scene => ({
      board: board.id,
      parts: [{ id: 'p', partId: 'potentiometer', position: [0, 0, 0] }],
      wires: [
        { id: 'o', from: { part: 'board', pin }, to: { part: 'p', pin: 'OUT' }, color: '#fff' },
        { id: 'v', from: { part: 'board', pin: '3V3' }, to: { part: 'p', pin: 'VCC' }, color: '#fff' },
        { id: 'g', from: { part: 'board', pin: 'GND2' }, to: { part: 'p', pin: 'GND' }, color: '#fff' },
      ],
    });
    expect(rules(pot('D23'))).toEqual(['not_adc']);
    expect(rules(pot('D25'))).toEqual(['adc2_wifi']);
    expect(rules(pot('D34'))).toEqual([]);
  });

  it('flags two different signals sharing one pin', () => {
    const s: Scene = {
      board: board.id,
      parts: [
        { id: 'led1', partId: 'led-resistor', position: [0, 0, 0] },
        { id: 'btn1', partId: 'push-button', position: [0, 0, 0] },
      ],
      wires: [
        { id: 'a', from: { part: 'board', pin: 'D25' }, to: { part: 'led1', pin: 'A' }, color: '#fff' },
        { id: 'b', from: { part: 'board', pin: 'D25' }, to: { part: 'btn1', pin: '1' }, color: '#fff' },
        { id: 'c', from: { part: 'board', pin: 'GND1' }, to: { part: 'led1', pin: 'K' }, color: '#fff' },
        { id: 'd', from: { part: 'board', pin: 'GND2' }, to: { part: 'btn1', pin: '2' }, color: '#fff' },
      ],
    };
    expect(rules(s)).toEqual(['shared_pin_conflict']);
  });

  it('flags ground wired to a power pin as a short', () => {
    expect(checkWiring(bme([['D21', 'SDA'], ['D22', 'SCL'], ['3V3', 'VIN'], ['3V3', 'GND']]), board, PARTS)[0]).toMatchObject({
      rule: 'voltage_mismatch',
      severity: 'error',
    });
  });
});

describe('I2C address conflicts', () => {
  const twoOnBus = (a: string, b: string): Scene => ({
    board: board.id,
    parts: [
      { id: 'p1', partId: a, position: [-60, 0, 60] },
      { id: 'p2', partId: b, position: [60, 0, 60] },
    ],
    wires: ['p1', 'p2'].flatMap((id, k) => {
      const def = PARTS[id === 'p1' ? a : b];
      const pin = (role: string) => def.pins.find((p) => p.role === role)?.name ?? '';
      return [
        { id: `${id}sda`, from: { part: 'board', pin: 'D21' }, to: { part: id, pin: pin('i2c_sda') }, color: '#fff' },
        { id: `${id}scl`, from: { part: 'board', pin: 'D22' }, to: { part: id, pin: pin('i2c_scl') }, color: '#fff' },
        { id: `${id}v`, from: { part: 'board', pin: '3V3' }, to: { part: id, pin: pin('power') }, color: '#fff' },
        { id: `${id}g${k}`, from: { part: 'board', pin: 'GND1' }, to: { part: id, pin: pin('ground') }, color: '#fff' },
      ];
    }),
  });

  it('is an error when neither part can change its address', () => {
    const f = checkWiring(twoOnBus('aht20', 'dht20'), board, PARTS).filter((x) => x.rule === 'i2c_address_conflict');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error' });
    expect(f[0].message).toContain('0x38');
    expect(f[0].targets).toEqual(expect.arrayContaining(['part:p1', 'part:p2']));
  });

  it('is a warning that names the address pin when a part can move', () => {
    // Two BH1750 light sensors: both default to 0x23; ADDR HIGH moves one to 0x5C.
    const f = checkWiring(twoOnBus('bh1750-gy302', 'bh1750-gy302'), board, PARTS).find((x) => x.rule === 'i2c_address_conflict');
    expect(f?.severity).toBe('warning');
    expect(f?.message).toMatch(/0x23/);
    expect(f?.hint).toMatch(/0x5C/);
    expect(f?.hint).toMatch(/ADDR/);
  });

  it('points to the jumper when the address pin is not in the library', () => {
    const f = checkWiring(twoOnBus('mpu6050', 'mpu6050'), board, PARTS).find((x) => x.rule === 'i2c_address_conflict');
    expect(f?.severity).toBe('warning');
    expect(f?.hint).toMatch(/0x69/);
  });

  it('stays quiet for parts on different addresses', () => {
    expect(rules(twoOnBus('aht20', 'bmp180-gy68'))).not.toContain('i2c_address_conflict');
  });
});
