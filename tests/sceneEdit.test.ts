// Project changes asked for by an AI (in-app assistant and MCP): checked against the board and
// part files, applied to a copy, wiring rules on the result.

import { describe, expect, it } from 'vitest';
import { PARTS } from '@shared/board';
import { IT } from '@shared/i18n';
import { CHANGE_TEXT, applySceneOps, describeChange, parseSceneOps } from '@shared/sceneEdit';
import type { Scene } from '@shared/types';

const base: Scene = {
  board: 'esp32-devkitc-30',
  parts: [{ id: 'led1', partId: 'led-resistor', position: [-2, 0, -40], label: 'LED' }],
  wires: [{ id: 'w1', from: { part: 'board', pin: 'D25' }, to: { part: 'led1', pin: 'A' }, color: '#5CCB8F' }],
};

describe('project edits', () => {
  it('adds a part and wires it in one change list, without touching the input', () => {
    const r = applySceneOps(base, parseSceneOps([{ op: 'add_part', partId: 'bme280-gy', id: 'bme1' }, { op: 'add_wire', from: { part: 'bme1', pin: 'SDA' }, to: { part: 'board', pin: 'D21' } }]), PARTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.scene.parts.map((p) => p.id)).toEqual(['led1', 'bme1']);
    // The board end comes first, and the color follows the part pin's role.
    expect(r.value.scene.wires[1]).toMatchObject({ from: { part: 'board', pin: 'D21' }, to: { part: 'bme1', pin: 'SDA' }, color: '#3FB6E8' });
    expect(base.parts).toHaveLength(1);
    expect(r.value.changes.map((c) => describeChange(c))).toEqual(['Add GY-BME280 breakout as bme1.', 'Wire D21 to GY-BME280 SDA.']);
  });

  it('refuses unknown parts, pins and ids with a plain reason', () => {
    const bad = (ops: unknown[]) => {
      const r = applySceneOps(base, parseSceneOps(ops), PARTS);
      return r.ok ? '' : r.error.humanMessage;
    };
    expect(bad([{ op: 'add_part', partId: 'flux-capacitor' }])).toMatch(/no part "flux-capacitor"/);
    expect(bad([{ op: 'add_wire', from: { part: 'board', pin: 'D99' }, to: { part: 'led1', pin: 'A' } }])).toMatch(/no pin "D99"/);
    expect(bad([{ op: 'add_wire', from: { part: 'board', pin: 'D26' }, to: { part: 'led1', pin: 'X' } }])).toMatch(/has no pin "X"/);
    expect(bad([{ op: 'add_wire', from: { part: 'board', pin: 'D25' }, to: { part: 'led1', pin: 'A' } }])).toMatch(/already wired/);
    expect(bad([{ op: 'remove_part', id: 'nope' }])).toMatch(/no part "nope"/);
    expect(() => parseSceneOps([{ op: 'format_disk' }])).toThrow(/unknown op/);
    expect(() => parseSceneOps([])).toThrow();
  });

  it('removes a part with its wires, and reports new wiring findings', () => {
    const removed = applySceneOps(base, [{ op: 'remove_part', id: 'led1' }], PARTS);
    expect(removed.ok && removed.value.scene.wires).toEqual([]);
    // Driving an LED from an input-only pin is a new finding.
    const r = applySceneOps(base, [{ op: 'add_part', partId: 'led-resistor', id: 'led2' }, { op: 'add_wire', from: { part: 'board', pin: 'D34' }, to: { part: 'led2', pin: 'A' } }], PARTS);
    expect(r.ok && r.value.newFindings.some((f) => f.rule === 'output_on_input_only')).toBe(true);
  });

  it('writes the code into the project', () => {
    const r = applySceneOps(base, parseSceneOps([{ op: 'set_code', name: 'blink.ino', text: 'void setup() {}\nvoid loop() {}\n' }]), PARTS);
    expect(r.ok && r.value.scene.sketch).toEqual({ name: 'blink.ino', text: 'void setup() {}\nvoid loop() {}\n' });
    expect(applySceneOps(base, [{ op: 'set_code', name: '../evil.sh', text: 'x' }], PARTS).ok).toBe(false);
  });

  it('has Italian for every change line', () => {
    for (const text of Object.values(CHANGE_TEXT)) expect(IT[text], text).toBeTruthy();
  });
});
