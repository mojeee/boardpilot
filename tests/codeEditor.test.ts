// The Code panel's logic: project files, the checker over several files, pin references in code,
// completions, reading compiler output and linking serial output back to the code.

import { describe, expect, it } from 'vitest';
import { getBoard, PARTS } from '@shared/board';
import type { Scene } from '@shared/types';
import { checkCode } from '@shared/codeCheck';
import { checkProject, combineSources, fileNameProblem, newFileText, projectFiles, renamedFile, withFile, withoutFile } from '@shared/codeProject';
import { pinCodeName, pinFacts, pinRefAt, pinRefs } from '@shared/codeRefs';
import { completionContext, memberOptions, pinConstantOptions, pinOptions } from '@shared/codeComplete';
import { compileSummary, explainCompilerMessage, libraryForHeader, parseCompileOutput } from '@shared/compileOutput';
import { printSites, siteForOutput } from '@shared/serialLink';

const esp = getBoard();
const scene: Scene = {
  board: esp.id,
  parts: [
    { id: 'bme1', partId: 'bme280-gy', position: [-60, 0, 60] },
    { id: 'led1', partId: 'led-resistor', position: [60, 0, 60] },
  ],
  wires: [
    { id: 'w1', from: { part: 'board', pin: 'D21' }, to: { part: 'bme1', pin: 'SDA' }, color: '#3FB6E8' },
    { id: 'w2', from: { part: 'board', pin: 'D22' }, to: { part: 'bme1', pin: 'SCL' }, color: '#9ADCF7' },
    { id: 'w5', from: { part: 'board', pin: 'D13' }, to: { part: 'led1', pin: 'A' }, color: '#5CCB8F' },
  ],
};

const SKETCH = `#include "pins.h"
void setup() {
  Wire.begin(I2C_SDA, I2C_SCL);
  pinMode(LED_PIN, OUTPUT);
}
void loop() {
  digitalWrite(LED_PIN, HIGH);
}
`;
const PINS_H = `#ifndef PINS_H
#define PINS_H
#define I2C_SDA 22
#define I2C_SCL 21
#define LED_PIN 13
#endif
`;

describe('project files', () => {
  const sk = { name: 'blink.ino', text: SKETCH };
  it('lists the main sketch first, then the other files', () => {
    const two = withFile(sk, 'pins.h', PINS_H);
    expect(projectFiles(two).map((f) => f.name)).toEqual(['blink.ino', 'pins.h']);
    expect(withFile(two, 'blink.ino', 'x').text).toBe('x');
    expect(withFile(two, 'pins.h', 'y').files).toEqual([{ name: 'pins.h', text: 'y' }]);
  });
  it('removes and renames files, never the main sketch', () => {
    const two = withFile(sk, 'pins.h', PINS_H);
    expect(withoutFile(two, 'blink.ino')).toBe(two);
    expect(withoutFile(two, 'pins.h')).toEqual(sk);
    expect(renamedFile(two, 'pins.h', 'board_pins.h').files?.[0].name).toBe('board_pins.h');
    expect(renamedFile(two, 'blink.ino', 'main.ino').name).toBe('main.ino');
  });
  it('checks new file names: safe, unique', () => {
    expect(fileNameProblem(sk, '')).toBe('empty');
    expect(fileNameProblem(sk, '../evil.h')).toBe('unsafe');
    expect(fileNameProblem(sk, 'Blink.INO')).toBe('taken');
    expect(fileNameProblem(sk, 'display.cpp')).toBeNull();
    expect(newFileText('pins.h')).toContain('#ifndef PINS_H');
  });
  it('maps combined lines back to their file', () => {
    const { at } = combineSources([{ name: 'blink.ino', text: SKETCH }, { name: 'pins.h', text: PINS_H }], 'blink.ino');
    // pins.h goes first (7 lines with the final newline), the sketch after it
    expect(at(3)).toEqual({ file: 'pins.h', line: 3 });
    expect(at(8 + 2)).toEqual({ file: 'blink.ino', line: 3 });
  });
});

describe('checker over several files', () => {
  it('knows the #defines of pins.h and reports the line in the sketch', () => {
    const f = checkProject(withFile({ name: 'blink.ino', text: SKETCH }, 'pins.h', PINS_H), scene, esp, PARTS);
    const i2c = f.find((x) => x.rule === 'code_i2c_pins');
    expect(i2c).toMatchObject({ severity: 'error', file: 'blink.ino', line: 3 });
    expect(i2c?.message).toMatch(/^Line 3 \(blink\.ino\):/);
  });
  it('checks a single sketch exactly as before', () => {
    const one = SKETCH.replace('#include "pins.h"', PINS_H);
    expect(checkProject({ name: 'a.ino', text: one }, scene, esp, PARTS)).toEqual(checkCode(one, scene, esp, PARTS));
  });
  it('gives the column and length of the call a finding is about', () => {
    const code = 'void setup() {\n  pinMode(34, OUTPUT);\n}\n';
    const f = checkCode(code, scene, esp, PARTS).find((x) => x.rule === 'code_output_on_input_only');
    expect(f?.span).toEqual({ col: 2, len: 'pinMode(34, OUTPUT)'.length });
  });
});

describe('pin references in code', () => {
  const code = `#define LED_PIN 13   // the LED
const int SDA_PIN = 21;
void setup() {
  pinMode(LED_PIN, OUTPUT);
  Wire.begin(SDA_PIN, 22);
  analogRead(34);
  int count = 25; // not a pin
  Serial.println("pin 4");
}`;
  const refs = pinRefs(code, esp);
  const texts = refs.map((r) => `${code.slice(r.from, r.to)}=${r.pin.id}`);
  it('finds constants, their values and literal pins in pin calls', () => {
    expect(texts).toEqual(['LED_PIN=D13', '13=D13', 'SDA_PIN=D21', '21=D21', 'LED_PIN=D13', 'SDA_PIN=D21', '22=D22', '34=D34']);
  });
  it('ignores numbers that are not pins, comments and strings', () => {
    expect(texts.some((x) => x.startsWith('25') || x.startsWith('4='))).toBe(false);
  });
  it('finds the reference under the mouse', () => {
    const at = code.indexOf('analogRead(34') + 'analogRead('.length + 1;
    expect(pinRefAt(refs, at)?.pin.id).toBe('D34');
  });
  it('describes the pin from the board file and the drawing', () => {
    const f = pinFacts(esp.pins.find((p) => p.id === 'D21')!, esp, scene, PARTS);
    expect(f.title).toBe('D21 (GPIO 21)');
    expect(f.role).toBe('sda');
    expect(f.wired).toEqual([{ partId: 'bme1', part: 'GY-BME280 breakout', pin: 'SDA', role: 'i2c_sda' }]);
    const d34 = pinFacts(esp.pins.find((p) => p.id === 'D34')!, esp, scene, PARTS);
    expect(d34.cautions.join(' ')).toMatch(/Input only/);
  });
  it('writes pins the way each core expects', () => {
    const nucleo = getBoard('nucleo-f401re');
    expect(pinCodeName(nucleo, nucleo.pins.find((p) => p.id === 'D2')!)).toBe('PA10');
    expect(pinCodeName(esp, esp.pins.find((p) => p.id === 'D21')!)).toBe('21');
  });
});

describe('completions', () => {
  it('knows when the cursor is in a pin argument', () => {
    expect(completionContext('  digitalWrite(', esp)).toEqual({ kind: 'pin', fn: 'digitalWrite', arg: 0 });
    expect(completionContext('  Wire.begin(21, ', esp)).toEqual({ kind: 'pin', fn: 'Wire.begin', arg: 1 });
    expect(completionContext('  digitalWrite(13, ', esp)).toMatchObject({ kind: 'word' });
    expect(completionContext('  bme1.read', esp)).toEqual({ kind: 'member', object: 'bme1', prefix: 'read' });
    expect(completionContext('  delay(', esp)).toMatchObject({ kind: 'word' });
  });
  it('offers wired pins first, never flash pins, and warns on input-only outputs', () => {
    const opts = pinOptions('digitalWrite', 0, esp, scene, PARTS);
    expect(opts[0].label).toBe('13');
    expect(opts[0].detail).toContain('LED');
    expect(opts.some((o) => ['6', '7', '8', '9', '10', '11'].includes(o.label))).toBe(false);
    const d34 = opts.find((o) => o.label === '34');
    expect(d34?.info).toMatch(/cannot be an output/);
    expect(d34!.boost).toBeLessThan(0);
  });
  it('offers the drawn SDA pin first for Wire.begin and only analog pins for analogRead', () => {
    expect(pinOptions('Wire.begin', 0, esp, scene, PARTS)[0].label).toBe('21');
    expect(pinOptions('Wire.begin', 1, esp, scene, PARTS)[0].label).toBe('22');
    const adc = pinOptions('analogRead', 0, esp, scene, PARTS);
    expect(adc.every((o) => esp.pins.find((p) => p.id === o.pinId)?.flags.some((f) => f.startsWith('adc')))).toBe(true);
  });
  it('knows the members of library objects declared in the code', () => {
    const src = '#include <Adafruit_BME280.h>\nAdafruit_BME280 bme1;\nvoid setup() {}';
    expect(memberOptions('bme1', src)?.lib.members.map((m) => m.name)).toContain('readHumidity');
    expect(memberOptions('Serial', src)?.lib.header).toBe('HardwareSerial.h');
    expect(memberOptions('nothing', src)).toBeNull();
  });
  it('lists the pin constants of the code', () => {
    expect(pinConstantOptions(PINS_H, esp).map((c) => `${c.name}=${c.pin.id}`)).toEqual(['I2C_SDA=D22', 'I2C_SCL=D21', 'LED_PIN=D13']);
  });
});

describe('compiler output', () => {
  const dir = '/tmp/bp-build/blink';
  const out = `
/tmp/bp-build/blink/blink.ino: In function 'void setup()':
/tmp/bp-build/blink/blink.ino:4:3: error: 'pinmode' was not declared in this scope; did you mean 'pinMode'?
    4 |   pinmode(LED_PIN, OUTPUT);
/tmp/bp-build/blink/pins.h:3:9: warning: "I2C_SDA" redefined
/Users/me/Arduino/libraries/Foo/Foo.cpp:10:1: error: expected ';' before '}' token
/tmp/bp-build/blink/blink.ino:2:10: fatal error: Adafruit_BME280.h: No such file or directory
Error during build: exit status 1
`;
  const r = parseCompileOutput(out, dir, ['blink.ino', 'pins.h'], 'esp32:esp32:esp32');
  it('maps errors and warnings to the project files and lines', () => {
    expect(r.diagnostics[0]).toMatchObject({ file: 'blink.ino', line: 4, col: 3, severity: 'error' });
    expect(r.diagnostics[0].hint).toMatch(/pinmode is used but never defined/);
    expect(r.diagnostics[1]).toMatchObject({ file: 'pins.h', line: 3, severity: 'warning' });
    expect(r.diagnostics[2]).toMatchObject({ external: 'Foo.cpp', line: 10 });
    expect(r.diagnostics[2].file).toBeUndefined();
  });
  it('names the library a missing header usually comes from', () => {
    expect(r.missing).toEqual([{ header: 'Adafruit_BME280.h', library: 'Adafruit BME280 Library' }]);
    expect(libraryForHeader('DHT.h')).toBe('DHT sensor library');
    expect(compileSummary({ ...r, ok: false, ms: 1 })).toMatch(/Adafruit BME280 Library/);
  });
  it('reads the size summary and a missing board package', () => {
    const ok = parseCompileOutput(
      'Sketch uses 289,489 bytes (22%) of program storage space. Maximum is 1,310,720 bytes.\nGlobal variables use 20520 bytes (6%) of dynamic memory, leaving 307160 bytes for local variables. Maximum is 327680 bytes.',
      dir,
      [],
    );
    expect(ok.flash).toEqual({ used: 289489, pct: 22, max: 1310720 });
    expect(ok.ram).toEqual({ used: 20520, pct: 6, max: 327680 });
    expect(compileSummary({ ...ok, ok: true, ms: 1 })).toBe('Compiled without errors (22% of the flash).');
    expect(parseCompileOutput("Error during build: Platform 'esp32:esp32' not found: platform not installed", dir, []).missingCore).toBe('esp32:esp32');
  });
  it('explains common messages in plain words', () => {
    expect(explainCompilerMessage("expected ';' before 'delay'")).toMatch(/semicolon/);
    expect(explainCompilerMessage('something unusual')).toBe('');
  });
});

describe('serial output → code line', () => {
  const files = [
    {
      name: 'a.ino',
      text: `void loop() {
  Serial.println("BME280 not found. Check the wires.");
  Serial.printf("Temp: %.1f C\\n", t);
  Serial.print(F("Hum: "));
  ESP_LOGI(TAG, "Wi-Fi connected to %s", ssid);
  Serial.println(x); // no text
  // Serial.println("commented out");
}`,
    },
  ];
  const sites = printSites(files);
  it('finds the fixed text of each print call', () => {
    expect(sites.map((s) => [s.line, s.text])).toEqual([
      [2, 'BME280 not found. Check the wires.'],
      [3, 'Temp:'],
      [4, 'Hum:'],
      [5, 'Wi-Fi connected to'],
    ]);
  });
  it('links an output line to the call that printed it', () => {
    expect(siteForOutput('Temp: 21.4 C', sites)?.line).toBe(3);
    expect(siteForOutput('I (1234) app: Wi-Fi connected to home', sites)?.line).toBe(5);
    expect(siteForOutput('BME280 not found. Check the wires.', sites)?.line).toBe(2);
    expect(siteForOutput('nothing like it', sites)).toBeNull();
  });
});
