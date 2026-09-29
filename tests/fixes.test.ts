import { describe, expect, it } from 'vitest';
import { PARTS, getBoard } from '@shared/board';
import { checkWiring } from '@shared/wiring';
import { wiringFix } from '@shared/fixes';
import type { Scene } from '@shared/types';

const board = getBoard('esp32-devkitc-30');
const findings = (s: Scene) => checkWiring(s, getBoard(s.board), PARTS);

describe('one-click wiring fixes', () => {
  it('swaps crossed SDA/SCL back at the part', () => {
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 0] }],
      wires: [
        { id: 'w1', from: { part: 'board', pin: 'D21' }, to: { part: 'bme1', pin: 'SCL' }, color: '#9ADCF7' },
        { id: 'w2', from: { part: 'board', pin: 'D22' }, to: { part: 'bme1', pin: 'SDA' }, color: '#3FB6E8' },
        { id: 'w3', from: { part: 'board', pin: '3V3' }, to: { part: 'bme1', pin: 'VIN' }, color: '#FF6B5E' },
        { id: 'w4', from: { part: 'board', pin: 'GND1' }, to: { part: 'bme1', pin: 'GND' }, color: '#8A96A3' },
      ],
    };
    const f = findings(scene).find((x) => x.rule === 'i2c_swapped');
    expect(f).toBeDefined();
    const fix = wiringFix(f!, scene, board, PARTS);
    expect(fix?.text).toMatch(/Swap/);
    expect(findings(fix!.scene).some((x) => x.rule === 'i2c_swapped')).toBe(false);
    // Same board pins, same number of wires: only the part ends changed.
    expect(fix!.scene.wires.length).toBe(scene.wires.length);
  });

  it('moves a wire off a strapping pin to a safe pin, and only that wire', () => {
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'btn1', partId: 'push-button', position: [0, 0, 0] }, { id: 'bme1', partId: 'bme280-gy', position: [40, 0, 0] }],
      wires: [
        { id: 'w1', from: { part: 'board', pin: 'D12' }, to: { part: 'btn1', pin: '1' }, color: '#5CCB8F' },
        { id: 'w2', from: { part: 'board', pin: 'GND1' }, to: { part: 'btn1', pin: '2' }, color: '#8A96A3' },
      ],
    };
    const f = findings(scene).find((x) => x.rule === 'strapping_pin');
    expect(f).toBeDefined();
    const fix = wiringFix(f!, scene, board, PARTS)!;
    expect(fix.text).toMatch(/safe pin/);
    const after = findings(fix.scene);
    expect(after.some((x) => x.rule === 'strapping_pin')).toBe(false);
    // The BME280 is not wired by the fix: it only moves the button's wire.
    expect(fix.scene.wires.filter((w) => w.to.part === 'bme1' || w.from.part === 'bme1')).toEqual([]);
    expect(fix.scene.wires).toHaveLength(2);
  });

  it('adds only the missing ground wire', () => {
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 0] }],
      wires: [
        { id: 'w1', from: { part: 'board', pin: 'D21' }, to: { part: 'bme1', pin: 'SDA' }, color: '#3FB6E8' },
        { id: 'w2', from: { part: 'board', pin: 'D22' }, to: { part: 'bme1', pin: 'SCL' }, color: '#9ADCF7' },
        { id: 'w3', from: { part: 'board', pin: '3V3' }, to: { part: 'bme1', pin: 'VIN' }, color: '#FF6B5E' },
      ],
    };
    const f = findings(scene).find((x) => x.rule === 'missing_ground');
    expect(f).toBeDefined();
    const fix = wiringFix(f!, scene, board, PARTS)!;
    expect(fix.scene.wires).toHaveLength(4);
    expect(findings(fix.scene).some((x) => x.rule === 'missing_ground')).toBe(false);
  });

  it('offers no fix where a person has to decide (voltage, addresses)', () => {
    const scene: Scene = {
      board: 'arduino-uno-r3',
      parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 0] }, { id: 'bme2', partId: 'bme280-gy', position: [40, 0, 0] }],
      wires: [
        { id: 'w1', from: { part: 'board', pin: 'A4' }, to: { part: 'bme1', pin: 'SDA' }, color: '#3FB6E8' },
        { id: 'w2', from: { part: 'board', pin: 'A4' }, to: { part: 'bme2', pin: 'SDA' }, color: '#3FB6E8' },
      ],
    };
    const uno = getBoard('arduino-uno-r3');
    for (const f of findings(scene).filter((x) => x.rule === 'i2c_address_conflict' || x.rule === 'logic_level' || x.rule === 'voltage_mismatch')) {
      expect(wiringFix(f, scene, uno, PARTS)).toBeNull();
    }
  });
});
