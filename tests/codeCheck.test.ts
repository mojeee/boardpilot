import { describe, expect, it } from 'vitest';
import { checkCode } from '@shared/codeCheck';
import { getBoard, PARTS } from '@shared/board';
import type { Scene } from '@shared/types';

const esp = getBoard();

/** BME280 on D21 (SDA) / D22 (SCL) and an LED on D13, like the new-project demo. */
const scene: Scene = {
  board: esp.id,
  parts: [
    { id: 'bme1', partId: 'bme280-gy', position: [-60, 0, 60] },
    { id: 'led1', partId: 'led-resistor', position: [60, 0, 60] },
  ],
  wires: [
    { id: 'w1', from: { part: 'board', pin: 'D21' }, to: { part: 'bme1', pin: 'SDA' }, color: '#3FB6E8' },
    { id: 'w2', from: { part: 'board', pin: 'D22' }, to: { part: 'bme1', pin: 'SCL' }, color: '#9ADCF7' },
    { id: 'w3', from: { part: 'board', pin: '3V3' }, to: { part: 'bme1', pin: 'VIN' }, color: '#FF6B5E' },
    { id: 'w4', from: { part: 'board', pin: 'GND1' }, to: { part: 'bme1', pin: 'GND' }, color: '#8A96A3' },
    { id: 'w5', from: { part: 'board', pin: 'D13' }, to: { part: 'led1', pin: 'A' }, color: '#5CCB8F' },
    { id: 'w6', from: { part: 'board', pin: 'GND2' }, to: { part: 'led1', pin: 'K' }, color: '#8A96A3' },
  ],
};
const check = (code: string, opts = {}) => checkCode(code, scene, esp, PARTS, opts);
const rules = (code: string, opts = {}) => check(code, opts).map((f) => f.rule);

const GOOD = `
#include <Wire.h>
#define LED_PIN 13
const int SDA_PIN = 21, SCL_PIN = 22;
void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  pinMode(LED_PIN, OUTPUT);
}
void loop() {
  digitalWrite(LED_PIN, HIGH);  // blink
  delay(500);
}
`;

describe('code vs wiring checker', () => {
  it('finds nothing wrong in code that matches the drawing', () => {
    expect(check(GOOD, { monitorBaud: 115200 })).toEqual([]);
  });

  it('flags Wire.begin with SDA and SCL the other way round, on the right line', () => {
    const f = check(GOOD.replace('Wire.begin(SDA_PIN, SCL_PIN)', 'Wire.begin(22, 21)'));
    expect(f[0]).toMatchObject({ rule: 'code_i2c_pins', severity: 'error', line: 7 });
    expect(f[0].targets).toEqual(expect.arrayContaining(['pin:D21', 'pin:D22']));
    expect(f[0].hint).toContain('Wire.begin(21, 22)');
    expect(f[0].source).toMatch(/not a measurement/);
  });

  it('flags Wire.begin() on default pins when the drawing uses others', () => {
    const moved: Scene = { ...scene, wires: scene.wires.map((w) => (w.id === 'w1' ? { ...w, from: { part: 'board', pin: 'D32' } } : w)) };
    const f = checkCode(GOOD.replace('Wire.begin(SDA_PIN, SCL_PIN)', 'Wire.begin()'), moved, esp, PARTS);
    expect(f.find((x) => x.rule === 'code_i2c_pins')?.severity).toBe('warning');
  });

  it('flags an output on an input-only pin', () => {
    const f = check(GOOD + '\nvoid extra() { pinMode(34, OUTPUT); }\n');
    expect(f.find((x) => x.rule === 'code_output_on_input_only')).toMatchObject({ severity: 'error', targets: ['pin:D34'] });
  });

  it('flags a pull-up on a pin that has none', () => {
    expect(rules(GOOD + '\nvoid b() { pinMode(34, INPUT_PULLUP); }\n')).toContain('code_no_pullup');
  });

  it('flags analogRead on ADC2 with Wi-Fi, and on a pin with no ADC', () => {
    const wifi = GOOD + '\nvoid w() { WiFi.begin("net", "pass"); int v = analogRead(25); }\n';
    expect(rules(wifi)).toContain('code_adc2_wifi');
    expect(rules(GOOD + '\nint v() { return analogRead(25); }\n')).not.toContain('code_adc2_wifi');
    expect(rules(GOOD + '\nint v() { return analogRead(21); }\n')).toContain('code_not_adc');
  });

  it('spots the LED wired to D13 while the code toggles D12', () => {
    const f = check(GOOD.replace('#define LED_PIN 13', '#define LED_PIN 12'));
    const nw = f.find((x) => x.rule === 'code_pin_not_wired');
    expect(nw?.message).toMatch(/D12/);
    expect(nw?.message).toMatch(/D13/);
    expect(nw?.targets).toEqual(['pin:D12', 'pin:D13']);
    expect(f.some((x) => x.rule === 'code_wired_pin_unused')).toBe(false);
  });

  it('compares Serial.begin with the monitor speed', () => {
    const f = check(GOOD.replace('115200', '9600'), { monitorBaud: 115200 });
    expect(f.find((x) => x.rule === 'code_baud')).toMatchObject({ line: 6, severity: 'warning' });
  });

  it('ignores comments and strings', () => {
    expect(check(GOOD + '\n// pinMode(34, OUTPUT);\n/* analogRead(21); */\nconst char* s = "digitalWrite(34, 1)";\n')).toEqual([]);
  });

  it('flags a pin that is not on the header', () => {
    expect(rules(GOOD + '\nvoid x() { pinMode(7, OUTPUT); }\n')).toContain('code_unknown_pin');
  });

  it('reads STM32 pin names and header numbers', () => {
    const nucleo = getBoard('nucleo-f401re');
    const led = nucleo.pins.find((p) => p.id === 'D13');
    expect(led).toBeTruthy();
    const s: Scene = {
      board: nucleo.id,
      parts: [{ id: 'led1', partId: 'led-resistor', position: [60, 0, 60] }],
      wires: [{ id: 'w1', from: { part: 'board', pin: 'D13' }, to: { part: 'led1', pin: 'A' }, color: '#5CCB8F' }],
    };
    const code = (pin: string) => `void setup(){ pinMode(${pin}, OUTPUT); } void loop(){ digitalWrite(${pin}, 1); }`;
    expect(checkCode(code('13'), s, nucleo, PARTS)).toEqual([]);
    expect(checkCode(code('D13'), s, nucleo, PARTS)).toEqual([]);
    expect(checkCode(code(led?.chipPin ?? 'PA5'), s, nucleo, PARTS)).toEqual([]);
    expect(checkCode(code('12'), s, nucleo, PARTS).map((f) => f.rule)).toContain('code_pin_not_wired');
  });
});
