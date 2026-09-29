// Starter projects (shared/starter): the Pico SDK generator on every template and every RP board,
// plus hand-made scenes for the cases a template never hits (bad I2C pair, shared pin, SPI).
// The nightly firmware job compiles the same template projects with the real SDK.

import { describe, expect, it } from 'vitest';
import { BOARDS, PARTS, getBoard, pinById } from '@shared/board';
import { assignPins } from '@shared/assign';
import { checkCode } from '@shared/codeCheck';
import { TEMPLATES, templateScene } from '@shared/templates';
import { generatePicoSdk, generateStarter, isSafeProjectName, starterToolchains } from '@shared/starter';
import { sceneTag } from '@shared/starter/common';
import type { BoardDef, Scene } from '@shared/types';

const rpBoards = Object.values(BOARDS).filter((b) => starterToolchains(b).includes('pico-sdk'));

const file = (p: { files: { name: string; text: string }[] }, name: string) => {
  const f = p.files.find((x) => x.name === name);
  if (!f) throw new Error(`missing ${name}`);
  return f.text;
};

/** GPIOs of every #define NAME_PIN n in main.c, in order (duplicates kept). */
const definedGpios = (main: string) => [...main.matchAll(/^#define \w+_PIN (\d+)\b/gm)].map((m) => Number(m[1]));

/** GPIOs the scene wires to a part signal pin (power, ground and passive pins left out). */
function sceneGpios(scene: Scene, board: BoardDef): number[] {
  const out = new Set<number>();
  for (const w of scene.wires) {
    const b = w.from.part === 'board' ? w.from : w.to;
    const p = w.from.part === 'board' ? w.to : w.from;
    const inst = scene.parts.find((x) => x.id === p.part);
    const role = inst ? PARTS[inst.partId]?.pins.find((x) => x.name === p.pin)?.role : undefined;
    const g = pinById(board, b.pin)?.gpio;
    if (g !== null && g !== undefined && role && !['power', 'ground', 'passive'].includes(role)) out.add(g);
  }
  return [...out].sort((a, b) => a - b);
}

/** Libraries main.c needs, worked out from the scene alone. */
function expectedLibs(scene: Scene): string[] {
  const roles = scene.parts.flatMap((p) => PARTS[p.partId].pins.filter((x) => scene.wires.some((w) => (w.from.part === p.id && w.from.pin === x.name) || (w.to.part === p.id && w.to.pin === x.name))).map((x) => x.role));
  const leds = scene.parts.some((p) => PARTS[p.partId].model.shape === 'led');
  return [
    'pico_stdlib',
    ...(roles.includes('i2c_sda') ? ['hardware_i2c'] : []),
    ...(roles.includes('analog_out') ? ['hardware_adc'] : []),
    ...(leds ? ['hardware_pwm'] : []),
    ...(roles.includes('spi_sck') ? ['hardware_spi'] : []),
  ].sort();
}

const cmakeLibs = (cmake: string) => (/target_link_libraries\(\w+ ([^)]+)\)/.exec(cmake)?.[1] ?? '').split(/\s+/).filter(Boolean).sort();

function wire(id: string, boardPin: string, part: string, pin: string) {
  return { id, from: { part: 'board', pin: boardPin }, to: { part, pin }, color: '#5CCB8F' };
}

describe('starter toolchains', () => {
  it('offers Pico SDK on RP2040 and RP2350 boards only', () => {
    expect(rpBoards.map((b) => b.id).sort()).toEqual(['rpi-pico', 'rpi-pico-2', 'rpi-pico-w']);
    for (const b of Object.values(BOARDS)) {
      const rp = b.family === 'rp2040' || b.family === 'rp2350';
      expect(starterToolchains(b), b.id).toEqual(rp ? ['arduino', 'pico-sdk'] : ['arduino']);
    }
  });

  it('falls back to the Arduino sketch where Pico SDK is not offered', () => {
    const board = getBoard('esp32-devkitc-30');
    const tpl = TEMPLATES.find((x) => x.id === 'blink-button')!;
    const p = generateStarter('pico-sdk', templateScene(tpl, board, PARTS), board, PARTS);
    expect(p.files.map((f) => f.name)).toEqual(['BoardPilotProject.ino']);
    expect(p.folder).toBe('BoardPilotProject');
  });

  it('accepts only plain file names for the save-folder IPC', () => {
    for (const ok of ['main.c', 'CMakeLists.txt', 'pico_sdk_import.cmake', 'README.md', 'weather-station-pico-sdk', 'BoardPilotProject.ino']) expect(isSafeProjectName(ok), ok).toBe(true);
    for (const bad of ['', '.', '..', '../main.c', 'a/b.c', 'a\\b.c', '/etc/passwd', 'C:x', '.hidden', 'a..b', 'x'.repeat(65), 'naïve.c', 'a b.c']) expect(isSafeProjectName(bad), bad).toBe(false);
    expect(isSafeProjectName(42)).toBe(false);
  });
});

describe.each(rpBoards.map((b) => [b.id, b] as const))('Pico SDK starter on %s', (_id, board) => {
  describe.each(TEMPLATES.map((tpl) => [tpl.id, tpl] as const))('%s', (_tid, tpl) => {
    const scene = templateScene(tpl, board, PARTS);
    const p = generatePicoSdk(scene, board, PARTS, { name: tpl.name });
    const main = file(p, 'main.c');
    const cmake = file(p, 'CMakeLists.txt');

    it('writes the four project files, each naming its board and scene', () => {
      expect(p.files.map((f) => f.name)).toEqual(['CMakeLists.txt', 'pico_sdk_import.cmake', 'main.c', 'README.md']);
      for (const f of p.files) {
        expect(f.text, f.name).toContain(board.id);
        expect(f.text, f.name).toContain(sceneTag(scene));
        expect(isSafeProjectName(f.name)).toBe(true);
      }
      expect(isSafeProjectName(p.folder)).toBe(true);
      expect(p.notes).toEqual([]);
    });

    it('uses exactly the GPIOs wired in the scene, each once', () => {
      const gpios = definedGpios(main);
      expect(new Set(gpios).size, 'a GPIO is defined twice').toBe(gpios.length);
      expect([...gpios].sort((a, b) => a - b)).toEqual(sceneGpios(scene, board));
      // Numbers used with pin functions are always the macros, never other literals.
      expect(main).not.toMatch(/gpio_(?:init|set_function|pull_up|put|get|set_dir)\(\d/);
    });

    it('lists the SDK libraries main.c needs', () => {
      expect(cmakeLibs(cmake)).toEqual(expectedLibs(scene));
      expect(cmake).toContain(`set(PICO_BOARD ${board.toolchain.picoBoard} CACHE STRING "Board type")`);
      expect(cmake.indexOf('\ninclude(pico_sdk_import.cmake)')).toBeLessThan(cmake.search(/^project\(/m));
      expect(cmake).toContain('pico_sdk_init()');
      expect(cmake).toContain('pico_enable_stdio_usb(boardpilot_starter 1)');
      for (const lib of cmakeLibs(cmake).filter((l) => l.startsWith('hardware_'))) expect(main).toContain(`#include "hardware/${lib.slice(9)}.h"`);
    });

    it('starts I2C only on a real pair and the ADC only on analog pins', () => {
      for (const m of main.matchAll(/^#define (I2C(\d))_(SDA|SCL)_PIN (\d+)/gm)) {
        const pin = board.pins.find((x) => x.gpio === Number(m[4]) && x.kind === 'gpio')!;
        expect(pin.functions, `${m[1]} ${m[3]}`).toContain(`I2C${m[2]}_${m[3]}`);
        expect(main).toContain(`i2c_init(i2c${m[2]}, 100000);`);
      }
      for (const m of main.matchAll(/^#define \w+_ADC (\d+)/gm)) expect(board.pins.some((x) => x.functions.includes(`ADC${m[1]}`) && board.rules.adcPins.includes(x.id))).toBe(true);
    });

    it('passes the code-vs-drawing checks', () => {
      const bad = checkCode(main, scene, board, PARTS).filter((f) => f.severity !== 'info' || f.rule === 'code_wired_pin_unused');
      expect(bad.map((f) => f.message)).toEqual([]);
    });

    it('cites a source next to every hardware fact it uses', () => {
      if (main.includes('i2c_init(')) expect(main).toMatch(/can be I2C\d: .*[Ff]unction [Ss]elect/);
      if (main.includes('adc_read(')) expect(main).toMatch(/12-bit ADC.*Source: /);
      if (main.includes('pwm_set_wrap(')) expect(main).toMatch(/Sources: .*PWM/);
      if (main.includes('read_reg(')) expect(main).toMatch(/Chip id: register 0x[0-9A-F]{2} reads 0x[0-9A-F]{2}\. Source: /);
    });
  });
});

describe('Pico SDK starter, hand-made scenes', () => {
  const board = getBoard('rpi-pico');
  const at = (x: number) => [x, 0, 60] as [number, number, number];

  it('carries the standard pico_sdk_import.cmake', () => {
    const tpl = TEMPLATES[0];
    const text = file(generatePicoSdk(templateScene(tpl, board, PARTS), board, PARTS), 'pico_sdk_import.cmake');
    expect(text).toContain('# This is a copy of <PICO_SDK_PATH>/external/pico_sdk_import.cmake');
    expect(text).toContain('set(PICO_SDK_PATH $ENV{PICO_SDK_PATH})');
    expect(text).toContain('include(${PICO_SDK_INIT_CMAKE_FILE})');
  });

  it('handles SPI, one-wire, analog and I2C parts together', () => {
    const scene0: Scene = {
      board: board.id,
      parts: ['dht22', 'potentiometer', 'mpu6050', 'bme280-gy', 'push-button', 'led-resistor'].map((partId, i) => ({ id: `p${i}`, partId, position: at(i * 30) })),
      wires: [],
    };
    const assigned = assignPins(scene0, board, PARTS).scene;
    // The SPI part goes on the board's default SPI pins (one SPI block).
    const spi = board.rules.spi!;
    const scene: Scene = {
      ...assigned,
      parts: [...assigned.parts, { id: 'acc1', partId: 'adxl362', position: at(200) }],
      wires: [...assigned.wires, wire('s1', spi.sck, 'acc1', 'SCLK'), wire('s2', spi.mosi, 'acc1', 'MOSI'), wire('s3', spi.miso, 'acc1', 'MISO'), wire('s4', spi.cs, 'acc1', 'CS')],
    };
    const p = generatePicoSdk(scene, board, PARTS);
    expect(p.notes).toEqual([]);
    const main = file(p, 'main.c');
    const gpios = definedGpios(main);
    expect(new Set(gpios).size).toBe(gpios.length);
    expect([...gpios].sort((a, b) => a - b)).toEqual(sceneGpios(scene, board));
    expect(cmakeLibs(file(p, 'CMakeLists.txt'))).toEqual(expectedLibs(scene));
    expect(main).toContain('spi_init(spi');
    expect(main).toMatch(/chip id 0x%02X \(expected 0x68\)/); // MPU6050 WHO_AM_I from its part file
    expect(checkCode(main, scene, board, PARTS).filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('does not start I2C on pins that are not an I2C pair, and says why', () => {
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'bme1', partId: 'bme280-gy', position: at(0) }],
      wires: [wire('w1', 'GP5', 'bme1', 'SDA'), wire('w2', 'GP4', 'bme1', 'SCL'), wire('w3', 'GND1', 'bme1', 'GND')], // swapped
    };
    const p = generatePicoSdk(scene, board, PARTS);
    const main = file(p, 'main.c');
    expect(main).not.toContain('i2c_init(');
    expect(main).not.toContain('read_reg(');
    expect(p.notes.join(' ')).toMatch(/not an I2C pair/);
    expect(definedGpios(main).sort()).toEqual([4, 5]);
  });

  it('uses a pin wired to two parts for the first one only, and says so', () => {
    const scene: Scene = {
      board: board.id,
      parts: [
        { id: 'led1', partId: 'led-resistor', position: at(0) },
        { id: 'led2', partId: 'led-resistor', position: at(30) },
      ],
      wires: [wire('w1', 'GP15', 'led1', 'A'), wire('w2', 'GP15', 'led2', 'A')],
    };
    const p = generatePicoSdk(scene, board, PARTS);
    expect(definedGpios(file(p, 'main.c'))).toEqual([15]);
    expect(p.notes).toHaveLength(1);
  });

  it('reads an analog part on a digital pin as a level, and says so', () => {
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'pot1', partId: 'potentiometer', position: at(0) }],
      wires: [wire('w1', 'GP15', 'pot1', 'OUT')],
    };
    const p = generatePicoSdk(scene, board, PARTS);
    const main = file(p, 'main.c');
    expect(main).not.toContain('adc_read');
    expect(main).toContain('gpio_get(POT1_PIN)');
    expect(p.notes.join(' ')).toMatch(/not an analog pin/);
    expect(cmakeLibs(file(p, 'CMakeLists.txt'))).toEqual(['pico_stdlib']);
  });

  it('keeps part ids and labels from breaking the C code', () => {
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'led-1', partId: 'led-resistor', label: 'My "red" LED */ 100%', position: at(0) }],
      wires: [wire('w1', 'GP15', 'led-1', 'A')],
    };
    const main = file(generatePicoSdk(scene, board, PARTS, { name: 'Test "quote"' }), 'main.c');
    expect(main).toContain('#define LED_1_PIN 15');
    expect(main).not.toMatch(/\*\/ 100%/);
    expect(main).toContain('Test \\"quote\\"');
  });
});
