import { describe, expect, it } from 'vitest';
import { checkCode } from '@shared/codeCheck';
import { checkProject } from '@shared/codeProject';
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

  it('offers a one-line fix for Wire.begin with plain numbers, keeping the rest of the line', () => {
    const f = check(GOOD.replace('Wire.begin(SDA_PIN, SCL_PIN)', 'Wire.begin(22, 21, 400000)'));
    expect(f[0].fix).toEqual({ text: '  Wire.begin(21, 22, 400000);' });
  });

  it('offers no fix when the pins are named constants (the user changes the constant)', () => {
    const f = check(GOOD.replace('Wire.begin(SDA_PIN, SCL_PIN)', 'Wire.begin(I2C_A, I2C_B)').replace('#include <Wire.h>', '#include <Wire.h>\n#define I2C_A 22\n#define I2C_B 21'));
    expect(f[0].rule).toBe('code_i2c_pins');
    expect(f[0].fix).toBeUndefined();
  });

  it('offers a fix for Serial.begin at the wrong speed', () => {
    const f = check(GOOD.replace('Serial.begin(115200)', 'Serial.begin(9600)'), { monitorBaud: 115200 });
    expect(f.find((x) => x.rule === 'code_baud')?.fix).toEqual({ text: '  Serial.begin(115200);' });
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

/** An ILI9341 display on the ESP32 DevKit's default VSPI pins: MOSI D23, MISO D19, SCK D18, CS D5, DC D2, RESET D4. */
const tftScene: Scene = {
  board: esp.id,
  parts: [{ id: 'tft1', partId: 'ili9341-tft-28', position: [0, 0, 60] }],
  wires: [
    ['D23', 'SDI(MOSI)'],
    ['D19', 'SDO(MISO)'],
    ['D18', 'SCK'],
    ['D5', 'CS'],
    ['D2', 'DC'],
    ['D4', 'RESET'],
  ].map(([pin, to], i) => ({ id: `t${i}`, from: { part: 'board', pin }, to: { part: 'tft1', pin: to }, color: '#fff' })),
};
const SETUP = (over: Record<string, string> = {}) => {
  const d = { TFT_MOSI: '23', TFT_MISO: '19', TFT_SCLK: '18', TFT_CS: '5', TFT_DC: '2', TFT_RST: '4', ...over };
  return `#define ILI9341_DRIVER\n${Object.entries(d).map(([k, v]) => `#define ${k} ${v}`).join('\n')}\n#include <TFT_eSPI.h>\nTFT_eSPI tft;\nvoid setup() { tft.init(); }\n`;
};
const spi = (code: string, scene = tftScene) => checkCode(code, scene, esp, PARTS).filter((f) => f.rule === 'code_spi_pins');

describe('SPI and display pins (TFT_eSPI, LovyanGFX, SPI.begin)', () => {
  it('accepts display pins that match the drawing', () => {
    expect(checkCode(SETUP(), tftScene, esp, PARTS)).toEqual([]);
  });

  it('flags clock and MOSI swapped against the drawing as an error, once', () => {
    const f = spi(SETUP({ TFT_SCLK: '23', TFT_MOSI: '18' }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', line: 2 });
    expect(f[0].message).toMatch(/reverse of the drawing/);
    expect(f[0].targets).toEqual(expect.arrayContaining(['pin:D23', 'pin:D18']));
    expect(f[0].source).toMatch(/not a measurement/);
  });

  it('flags a chip select, DC or reset that is not where the drawing has it', () => {
    const f = spi(SETUP({ TFT_CS: '15', TFT_DC: '27', TFT_RST: '26' }));
    expect(f.map((x) => x.severity)).toEqual(['warning', 'warning', 'warning']);
    expect(f.map((x) => x.line)).toEqual([5, 6, 7]);
    expect(f[0].message).toContain('chip select');
    expect(f[0].hint).toContain('5');
  });

  it('reads LovyanGFX cfg.pin_* blocks, with the touch chip select compared to the drawn chip selects', () => {
    const lgfx = `#include <LovyanGFX.hpp>
class LGFX : public lgfx::LGFX_Device {
  lgfx::Bus_SPI _bus_instance;
  lgfx::Panel_ILI9341 _panel_instance;
public:
  LGFX() {
    { auto cfg = _bus_instance.config();
      cfg.pin_sclk = 18; cfg.pin_mosi = 23; cfg.pin_miso = 12; cfg.pin_dc = 2;
      _bus_instance.config(cfg); }
    { auto cfg = _panel_instance.config();
      cfg.pin_cs = 5; cfg.pin_rst = 4;
      _panel_instance.config(cfg); }
  }
};`;
    const f = spi(lgfx);
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('data in (MISO)');
    expect(f[0].line).toBe(8);
  });

  it('checks SPI.begin(sck, miso, mosi) and a plain SPI.begin() against the drawing', () => {
    expect(spi('void setup(){ SPI.begin(18, 19, 23, 5); }')).toEqual([]);
    expect(spi('void setup(){ SPI.begin(14, 12, 13); }').map((f) => f.line)).toEqual([1, 1, 1]);
    // the DevKit's default VSPI pins are what the drawing uses
    expect(spi('void setup(){ SPI.begin(); }')).toEqual([]);
    const moved: Scene = { ...tftScene, wires: tftScene.wires.map((w) => (w.from.pin === 'D18' ? { ...w, from: { part: 'board', pin: 'D14' } } : w)) };
    const f = spi('void setup(){ SPI.begin(); }', moved);
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('SPI.begin()');
  });

  it('says nothing about SPI when the drawing has no SPI part, but still stops flash and input-only pins', () => {
    const none: Scene = { board: esp.id, parts: [], wires: [] };
    expect(spi(SETUP({ TFT_CS: '15' }), none)).toEqual([]);
    const flash = checkCode(SETUP({ TFT_SCLK: '6' }), none, esp, PARTS);
    expect(flash.map((f) => f.rule)).toContain('code_unknown_pin'); // GPIO 6 is not on the 30-pin header
    const input = checkCode(SETUP({ TFT_DC: '34' }), none, esp, PARTS);
    expect(input.find((f) => f.rule === 'code_output_on_input_only')).toMatchObject({ severity: 'error', line: 6 });
  });

  it('counts display pins as used, so a wired DC pin is not reported as unused', () => {
    expect(checkCode(SETUP(), tftScene, esp, PARTS).map((f) => f.rule)).not.toContain('code_wired_pin_unused');
  });

  it('reads PlatformIO -D flags and User_Setup.h across project files, mapped to their own file and line', () => {
    const sketch = {
      name: 'main.ino',
      text: '#include <TFT_eSPI.h>\nTFT_eSPI tft;\nvoid setup(){ tft.init(); }\n',
      files: [
        { name: 'platformio.ini', text: '[env:esp32dev]\nbuild_flags =\n  -D ILI9341_DRIVER=1\n  -D TFT_MOSI=18\n  -D TFT_SCLK=23\n  -D TFT_CS=5\n' },
      ],
    };
    const f = checkProject(sketch, tftScene, esp, PARTS).filter((x) => x.rule === 'code_spi_pins');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', file: 'platformio.ini', line: 4 });
  });
});
