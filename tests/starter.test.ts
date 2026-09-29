// Starter projects (shared/starter): the Pico SDK generator on every template and every RP board,
// plus hand-made scenes for the cases a template never hits (bad I2C pair, shared pin, SPI).
// The nightly firmware job compiles the same template projects with the real SDK.

import { describe, expect, it } from 'vitest';
import { BOARDS, PARTS, getBoard, pinById } from '@shared/board';
import { assignPins } from '@shared/assign';
import { checkCode } from '@shared/codeCheck';
import { TEMPLATES, templateFits, templateScene } from '@shared/templates';
import { generateEspIdf, generatePicoSdk, generateStarter, generateStm32Hal, isSafeProjectName, isSafeProjectPath, starterToolchains } from '@shared/starter';
import { sceneTag } from '@shared/starter/common';
import type { BoardDef, Scene } from '@shared/types';

const rpBoards = Object.values(BOARDS).filter((b) => starterToolchains(b).includes('pico-sdk'));
const espBoards = Object.values(BOARDS).filter((b) => starterToolchains(b).includes('esp-idf'));
const stmBoards = Object.values(BOARDS).filter((b) => starterToolchains(b).includes('stm32-hal'));

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
  it('offers Pico SDK on RP boards, ESP-IDF on ESP32 boards, STM32 HAL on STM32 boards, Arduino first', () => {
    expect(rpBoards.map((b) => b.id).sort()).toEqual(['rpi-pico', 'rpi-pico-2', 'rpi-pico-w']);
    expect(espBoards.map((b) => b.id).sort()).toEqual(['esp32-c3-devkitm-1', 'esp32-devkitc-30', 'esp32-s3-devkitc-1']);
    expect(stmBoards.map((b) => b.id).sort()).toEqual(['blackpill-f411ce', 'nucleo-f401re']);
    for (const b of Object.values(BOARDS)) {
      const rp = b.family === 'rp2040' || b.family === 'rp2350';
      const esp = b.family === 'esp32' || b.family === 'esp32s3' || b.family === 'esp32c3';
      const want = rp ? ['arduino', 'pico-sdk'] : esp ? ['arduino', 'esp-idf'] : b.family === 'stm32' ? ['arduino', 'stm32-hal'] : ['arduino'];
      expect(starterToolchains(b), b.id).toEqual(want);
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

  it('accepts folder paths of up to three plain names, never a way out of the folder', () => {
    for (const ok of ['main.c', 'main/main.c', 'Core/Src/main.c', 'cmake/gcc-arm-none-eabi.cmake']) expect(isSafeProjectPath(ok), ok).toBe(true);
    for (const bad of ['', '/main.c', 'main/', 'main//main.c', '../main.c', 'main/../../x', 'a/b/c/d.c', 'main\\main.c', 'C:/x', './main.c', 'main/.hidden', 'a b/c.c', 'x/'.repeat(2) + 'y'.repeat(200)])
      expect(isSafeProjectPath(bad), bad).toBe(false);
    expect(isSafeProjectPath(null)).toBe(false);
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

/* ------------------------------------------------------------------ ESP-IDF */

/** GPIOs of every #define NAME_PIN GPIO_NUM_n in an ESP-IDF main.c, in order (duplicates kept). */
const espGpios = (main: string) => [...main.matchAll(/^#define \w+_PIN GPIO_NUM_(\d+)\b/gm)].map((m) => Number(m[1]));

/** Roles wired in the scene, and whether an LED-like part is wired. */
function wiredRoles(scene: Scene) {
  const roles = scene.parts.flatMap((p) => PARTS[p.partId].pins.filter((x) => scene.wires.some((w) => (w.from.part === p.id && w.from.pin === x.name) || (w.to.part === p.id && w.to.pin === x.name))).map((x) => x.role));
  const leds = scene.parts.some((p) => PARTS[p.partId].model.shape === 'led' && scene.wires.some((w) => w.from.part === p.id || w.to.part === p.id));
  return { roles, leds };
}

/** ESP-IDF components main.c needs, worked out from the scene alone. */
function expectedComponents(scene: Scene): string[] {
  const { roles, leds } = wiredRoles(scene);
  return [
    ...(roles.some((r) => ['digital_in', 'digital_out', 'onewire', 'int'].includes(r)) ? ['esp_driver_gpio'] : []),
    ...(roles.includes('i2c_sda') ? ['esp_driver_i2c'] : []),
    ...(roles.includes('analog_out') ? ['esp_adc'] : []),
    ...(leds ? ['esp_driver_ledc'] : []),
    ...(roles.includes('spi_sck') ? ['esp_driver_spi'] : []),
  ].sort();
}
const idfRequires = (cmake: string) => (/REQUIRES ([^)]+)\)/.exec(cmake)?.[1] ?? '').split(/\s+/).filter(Boolean).sort();

describe.each(espBoards.map((b) => [b.id, b] as const))('ESP-IDF starter on %s', (_id, board) => {
  describe.each(TEMPLATES.filter((tpl) => !templateFits(tpl, board)).map((tpl) => [tpl.id, tpl] as const))('%s', (_tid, tpl) => {
    const scene = templateScene(tpl, board, PARTS);
    const p = generateEspIdf(scene, board, PARTS, { name: tpl.name });
    const main = file(p, 'main/main.c');
    const cmake = file(p, 'CMakeLists.txt');
    const mainCmake = file(p, 'main/CMakeLists.txt');

    it('writes the idf.py project layout, each file naming its board and scene', () => {
      expect(p.files.map((f) => f.name)).toEqual(['CMakeLists.txt', 'main/CMakeLists.txt', 'main/main.c', 'sdkconfig.defaults', 'README.md']);
      for (const f of p.files) {
        expect(f.text, f.name).toContain(board.id);
        expect(f.text, f.name).toContain(sceneTag(scene));
        expect(isSafeProjectPath(f.name), f.name).toBe(true);
      }
      expect(isSafeProjectName(p.folder)).toBe(true);
      expect(p.notes).toEqual([]);
      expect(cmake.indexOf('include($ENV{IDF_PATH}/tools/cmake/project.cmake)')).toBeLessThan(cmake.search(/^project\(boardpilot_starter\)/m));
      expect(file(p, 'sdkconfig.defaults')).toContain(`CONFIG_IDF_TARGET="${board.toolchain.idfTarget}"`);
      expect(file(p, 'README.md')).toContain(`idf.py set-target ${board.toolchain.idfTarget}`);
      expect(main).toContain('void app_main(void) {');
      expect(main).toContain('vTaskDelay(pdMS_TO_TICKS(');
    });

    it('uses exactly the GPIOs wired in the scene, each once', () => {
      const gpios = espGpios(main);
      expect(new Set(gpios).size, 'a GPIO is defined twice').toBe(gpios.length);
      expect([...gpios].sort((a, b) => a - b)).toEqual(sceneGpios(scene, board));
      // Pin arguments are always the macros, never number literals.
      expect(main).not.toMatch(/gpio_(?:reset_pin|set_direction|set_level|get_level|set_pull_mode)\(\d/);
      expect(main).not.toMatch(/_io_num = \d/);
    });

    it('lists the components main.c needs', () => {
      expect(idfRequires(mainCmake)).toEqual(expectedComponents(scene));
      const header: Record<string, string> = {
        esp_driver_gpio: 'driver/gpio.h',
        esp_driver_i2c: 'driver/i2c_master.h',
        esp_adc: 'esp_adc/adc_oneshot.h',
        esp_driver_ledc: 'driver/ledc.h',
        esp_driver_spi: 'driver/spi_master.h',
      };
      for (const c of idfRequires(mainCmake)) expect(main).toContain(`#include "${header[c]}"`);
    });

    it("never hard-codes an ADC channel and reads only the board's analog pins", () => {
      expect(main).not.toMatch(/ADC_CHANNEL_\d/);
      for (const m of main.matchAll(/adc_oneshot_io_to_channel\((\w+)_PIN,/g)) {
        const g = Number(new RegExp(`^#define ${m[1]}_PIN GPIO_NUM_(\\d+)`, 'm').exec(main)?.[1]);
        const pin = board.pins.find((x) => x.gpio === g && x.kind === 'gpio' && !x.sameAs)!;
        expect(board.rules.adcPins).toContain(pin.id);
      }
      // SDA/SCL and outputs never on input-only pins.
      for (const m of main.matchAll(/^#define (\w+)_PIN GPIO_NUM_(\d+)\b.*(SDA|SCL|output|LEDC)/gm)) expect(board.pins.find((x) => x.gpio === Number(m[2]))?.flags).not.toContain('input_only');
    });

    it('uses the LEDC resolution of the PWM calculator', () => {
      if (!main.includes('ledc_timer_config(')) return;
      const bits = Number(/LEDC_TIMER_(\d+)_BIT/.exec(main)?.[1] ?? 0);
      expect(bits).toBeGreaterThanOrEqual(10);
      expect(bits).toBeLessThanOrEqual(board.family === 'esp32' ? 20 : 14);
      expect(main).toContain('.clk_cfg = LEDC_USE_APB_CLK');
    });

    it('passes the code-vs-drawing checks', () => {
      const bad = checkCode(main, scene, board, PARTS).filter((f) => f.severity !== 'info' || f.rule === 'code_wired_pin_unused');
      expect(bad.map((f) => f.message)).toEqual([]);
    });

    it('cites a source next to every hardware fact it uses', () => {
      if (main.includes('i2c_new_master_bus(')) expect(main).toMatch(/GPIO matrix, so any output-capable pin works: .+\./);
      if (main.includes('adc_oneshot_read(')) expect(main).toMatch(/adc_oneshot_io_to_channel\), not from a table\. Source: .+/);
      if (main.includes('ledc_timer_config(')) expect(main).toMatch(/Sources: .*LED.*; APB_CLK: /);
      if (main.includes('i2c_master_transmit_receive(')) expect(main).toMatch(/Chip id: register 0x[0-9A-F]{2} reads 0x[0-9A-F]{2}\. Source: /);
    });
  });
});

describe('ESP-IDF starter, hand-made scenes', () => {
  const board = getBoard('esp32-devkitc-30');
  const at = (x: number) => [x, 0, 60] as [number, number, number];
  const gen = (scene: Scene) => {
    const p = generateEspIdf(scene, board, PARTS);
    return { p, main: file(p, 'main/main.c'), req: idfRequires(file(p, 'main/CMakeLists.txt')) };
  };

  it('starts SPI on any pins through the GPIO matrix, with the chip select in the driver', () => {
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'acc1', partId: 'adxl362', position: at(0) }],
      wires: [wire('s1', 'D14', 'acc1', 'SCLK'), wire('s2', 'D13', 'acc1', 'MOSI'), wire('s3', 'D27', 'acc1', 'MISO'), wire('s4', 'D4', 'acc1', 'CS')],
    };
    const { p, main, req } = gen(scene);
    expect(p.notes).toEqual([]);
    expect(main).toContain('spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_CH_AUTO)');
    expect(main).toContain('.spics_io_num = ACC1_CS_PIN,');
    expect(req).toEqual(['esp_driver_spi']);
    expect(espGpios(main).sort((a, b) => a - b)).toEqual([4, 13, 14, 27]);
  });

  it('does not drive an input-only pin or put I2C on one, and says why', () => {
    const scene: Scene = {
      board: board.id,
      parts: [
        { id: 'led1', partId: 'led-resistor', position: at(0) },
        { id: 'bme1', partId: 'bme280-gy', position: at(30) },
      ],
      wires: [wire('w1', 'D34', 'led1', 'A'), wire('w2', 'D35', 'bme1', 'SDA'), wire('w3', 'D22', 'bme1', 'SCL')],
    };
    const { p, main } = gen(scene);
    expect(main).not.toContain('ledc_channel_config');
    expect(main).not.toContain('i2c_new_master_bus');
    expect(main).not.toContain('find_part(');
    expect(p.notes.filter((n) => /can only be an input/.test(n))).toHaveLength(2);
    expect(espGpios(main).sort((a, b) => a - b)).toEqual([22, 34, 35]);
  });

  it('reads an analog part on a pin that is not an analog pin of the board as a level, and says so', () => {
    const scene: Scene = { board: board.id, parts: [{ id: 'pot1', partId: 'potentiometer', position: at(0) }], wires: [wire('w1', 'D25', 'pot1', 'OUT')] };
    const { p, main, req } = gen(scene);
    expect(main).not.toContain('adc_oneshot');
    expect(main).toContain('gpio_get_level(POT1_PIN)');
    expect(p.notes.join(' ')).toMatch(/not an analog pin/);
    expect(req).toEqual(['esp_driver_gpio']);
  });

  it('asks for a resistor when a button is on a pin without an internal pull-up', () => {
    const scene: Scene = { board: board.id, parts: [{ id: 'btn1', partId: 'push-button', position: at(0) }], wires: [wire('w1', 'VP', 'btn1', '1')] };
    const { p, main } = gen(scene);
    expect(main).not.toContain('gpio_set_pull_mode(BTN1_PIN');
    expect(p.notes.join(' ')).toMatch(/no internal pull-up/);
  });

  it('leaves flash and PSRAM pins alone (ESP32-S3 octal PSRAM)', () => {
    const s3 = getBoard('esp32-s3-devkitc-1');
    const scene: Scene = { board: s3.id, parts: [{ id: 'led1', partId: 'led-resistor', position: at(0) }], wires: [wire('w1', 'IO35', 'led1', 'A')] };
    const p = generateEspIdf(scene, s3, PARTS);
    expect(file(p, 'main/main.c')).not.toMatch(/gpio_(set_direction|reset_pin)\(LED1_PIN/);
    expect(p.notes.join(' ')).toMatch(/flash or PSRAM/);
  });

  it('uses a pin wired to two parts for the first one only, and says so', () => {
    const scene: Scene = {
      board: board.id,
      parts: [
        { id: 'led1', partId: 'led-resistor', position: at(0) },
        { id: 'led2', partId: 'led-resistor', position: at(30) },
      ],
      wires: [wire('w1', 'D25', 'led1', 'A'), wire('w2', 'D25', 'led2', 'A')],
    };
    const { p, main } = gen(scene);
    expect(espGpios(main)).toEqual([25]);
    expect(p.notes).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ STM32 HAL */

/** GPIOs (port × 16 + pin) of every NAME_PORT / NAME_PIN pair in an STM32 main.c, in order. */
function stmGpios(main: string): number[] {
  const ports = new Map([...main.matchAll(/^#define (\w+)_PORT GPIO([A-K])$/gm)].map((m) => [m[1], m[2].charCodeAt(0) - 65]));
  return [...main.matchAll(/^#define (\w+)_PIN GPIO_PIN_(\d+)\b/gm)].map((m) => (ports.get(m[1]) ?? -99) * 16 + Number(m[2]));
}
const halModules = (cmake: string) => (/set\(HAL_MODULES ([^)]+)\)/.exec(cmake)?.[1] ?? '').split(/\s+/).filter(Boolean).sort();
const BASE_MODULES = ['cortex', 'dma', 'flash', 'flash_ex', 'gpio', 'pwr', 'pwr_ex', 'rcc', 'rcc_ex', 'uart'];

/** HAL modules main.c needs, from the scene and the board file (an LED only gets a timer on a pin with a timer channel). */
function expectedModules(scene: Scene, board: BoardDef): string[] {
  const { roles } = wiredRoles(scene);
  const ledOnTimer = scene.wires.some((w) => {
    const b = w.from.part === 'board' ? w.from : w.to;
    const p = w.from.part === 'board' ? w.to : w.from;
    const inst = scene.parts.find((x) => x.id === p.part);
    const pin = pinById(board, b.pin);
    return !!inst && PARTS[inst.partId].model.shape === 'led' && !!pin?.functions.some((f) => /^TIM\d+_CH\d$/.test(f) && pin.af?.[f] !== undefined);
  });
  return [
    ...BASE_MODULES,
    ...(roles.includes('i2c_sda') ? ['i2c'] : []),
    ...(roles.includes('analog_out') ? ['adc', 'adc_ex'] : []),
    ...(ledOnTimer ? ['tim', 'tim_ex'] : []),
    ...(roles.includes('spi_sck') ? ['spi'] : []),
  ].sort();
}

/** Every pin_init(..., GPIO_AFn_PERIPH) must match the board file's af table for that pin. Returns how many there are. */
function checkAlternateFunctions(main: string, board: BoardDef): number {
  const gpioOf = (name: string) => {
    const port = new RegExp(`^#define ${name}_PORT GPIO([A-K])$`, 'm').exec(main)?.[1];
    const pin = new RegExp(`^#define ${name}(?:_PIN)? GPIO_PIN_(\\d+)\\b`, 'm').exec(main)?.[1];
    return port && pin ? (port.charCodeAt(0) - 65) * 16 + Number(pin) : -1;
  };
  let n = 0;
  for (const m of main.matchAll(/pin_init\((\w+)_PORT, \w+, GPIO_MODE_AF_\w+, \w+, GPIO_AF(\d+)_(\w+)\)/g)) {
    const g = gpioOf(m[1]);
    const pin = board.pins.find((x) => x.gpio === g && x.kind === 'gpio');
    expect(pin, `${m[1]} (GPIO ${g})`).toBeTruthy();
    const periph = m[3].replace(/^USART/, 'UART');
    const fns = Object.entries(pin?.af ?? {}).filter(([f]) => f.startsWith(`${periph}_`));
    expect(fns.length, `${pin?.id} has no ${periph} function in the board file`).toBeGreaterThan(0);
    expect(fns.some(([, af]) => af === Number(m[2])), `${pin?.id}: AF${m[2]} for ${periph}`).toBe(true);
    n++;
  }
  return n;
}

describe.each(stmBoards.map((b) => [b.id, b] as const))('STM32 HAL starter on %s', (_id, board) => {
  const hal = board.toolchain.stm32Hal!;
  describe.each(TEMPLATES.filter((tpl) => !templateFits(tpl, board)).map((tpl) => [tpl.id, tpl] as const))('%s', (_tid, tpl) => {
    const scene = templateScene(tpl, board, PARTS);
    const p = generateStm32Hal(scene, board, PARTS, { name: tpl.name });
    const main = file(p, 'Core/Src/main.c');
    const cmake = file(p, 'CMakeLists.txt');
    const conf = file(p, 'Core/Inc/stm32f4xx_hal_conf.h');

    it('writes the CMake project in CubeMX layout, each file naming its board and scene', () => {
      expect(p.files.map((f) => f.name)).toEqual([
        'CMakeLists.txt',
        'cmake/gcc-arm-none-eabi.cmake',
        `${board.chip}_FLASH.ld`,
        'Core/Inc/stm32f4xx_hal_conf.h',
        'Core/Src/main.c',
        'Core/Src/syscalls.c',
        'README.md',
      ]);
      for (const f of p.files) {
        expect(f.text, f.name).toContain(board.id);
        expect(f.text, f.name).toContain(sceneTag(scene));
        expect(isSafeProjectPath(f.name), f.name).toBe(true);
      }
      expect(isSafeProjectName(p.folder)).toBe(true);
      expect(p.notes).toEqual([]);
      expect(cmake).toContain(`target_compile_definitions(boardpilot_starter PRIVATE USE_HAL_DRIVER ${hal.device})`);
      expect(cmake).toContain(`/Source/Templates/gcc/startup_${hal.device.toLowerCase()}.s`);
      expect(cmake).toMatch(/FetchContent_Declare\(stm32f4xx_hal_driver GIT_REPOSITORY https:\/\/github\.com\/STMicroelectronics\/stm32f4xx-hal-driver\.git GIT_TAG v[\d.]+ /);
      expect(cmake).toContain('STM32CUBE_F4_DIR');
      const ld = file(p, `${board.chip}_FLASH.ld`);
      expect(ld).toContain(`LENGTH = ${board.flashBytes! / 1024}K`);
      expect(ld).toContain(`LENGTH = ${board.ramBytes! / 1024}K`);
      expect(file(p, 'Core/Src/syscalls.c')).toContain('int _write(int file, char *ptr, int len)');
    });

    it('uses exactly the GPIOs wired in the scene, each once', () => {
      const gpios = stmGpios(main);
      expect(new Set(gpios).size, 'a GPIO is defined twice').toBe(gpios.length);
      expect([...gpios].sort((a, b) => a - b)).toEqual(sceneGpios(scene, board));
      expect(main).not.toMatch(/pin_init\(GPIO[A-K], /);
    });

    it('lists the HAL modules main.c uses, in CMake and in the HAL configuration', () => {
      expect(halModules(cmake)).toEqual(expectedModules(scene, board));
      const own = halModules(cmake).filter((x) => !x.endsWith('_ex'));
      for (const m of own) expect(conf).toContain(`#define HAL_${m.toUpperCase()}_MODULE_ENABLED`);
      expect(conf.match(/^#define HAL_\w+_MODULE_ENABLED$/gm)?.length).toBe(own.length);
    });

    it('takes every alternate function from the board file', () => {
      expect(checkAlternateFunctions(main, board)).toBeGreaterThanOrEqual(2); // at least the printf UART
      for (const m of main.matchAll(/^#define (I2C(\d))_(SDA|SCL)_PIN GPIO_PIN_(\d+)/gm)) {
        const port = new RegExp(`^#define ${m[1]}_${m[3]}_PORT GPIO([A-K])$`, 'm').exec(main)![1];
        const pin = board.pins.find((x) => x.gpio === (port.charCodeAt(0) - 65) * 16 + Number(m[4]) && x.kind === 'gpio')!;
        expect(pin.functions, `${m[1]} ${m[3]}`).toContain(`I2C${m[2]}_${m[3]}`);
      }
      for (const m of main.matchAll(/adc_read\(ADC_CHANNEL_(\d+)\)/g)) expect(board.pins.some((x) => x.functions.includes(`ADC1_IN${m[1]}`))).toBe(true);
    });

    it("sets the clock tree of the board file and the board's documented clocks", () => {
      expect(main).toContain(`osc.PLL.PLLM = ${hal.pllM};`);
      expect(main).toContain(`osc.PLL.PLLN = ${hal.pllN};`);
      expect(main).toContain(`osc.PLL.PLLP = RCC_PLLP_DIV${hal.pllP};`);
      expect(main).toContain(`FLASH_LATENCY_${hal.flashLatency}`);
      expect(main).toContain(`PWR_REGULATOR_VOLTAGE_SCALE${hal.vos}`);
      expect(main).toContain(`// SYSCLK ${board.clocks!.cpuHz / 1e6} MHz`);
      expect(conf).toContain(`#define HSE_VALUE ${hal.hseHz}U`);
    });

    it('cites a source next to every hardware fact it uses', () => {
      if (main.includes('HAL_I2C_Init(')) expect(main).toMatch(/I2C\d_SDA is AF\d+ and I2C\d_SCL is AF\d+: .*Alternate function/);
      if (main.includes('HAL_TIM_PWM_Init(')) expect(main).toMatch(/Sources: RM0368 \/ RM0383.*; timer clock: /);
      if (main.includes('HAL_ADC_Init(')) expect(main).toMatch(/sampling\. Source: RM0368/);
      if (main.includes('HAL_I2C_Mem_Read(')) expect(main).toMatch(/Chip id: register 0x[0-9A-F]{2} reads 0x[0-9A-F]{2}\. Source: /);
      expect(main).toMatch(/Source: RM03\d\d .*PLL/);
    });
  });
});

describe('STM32 HAL starter, hand-made scenes', () => {
  const board = getBoard('nucleo-f401re');
  const at = (x: number) => [x, 0, 60] as [number, number, number];
  const gen = (scene: Scene) => {
    const p = generateStm32Hal(scene, board, PARTS);
    return { p, main: file(p, 'Core/Src/main.c'), mods: halModules(file(p, 'CMakeLists.txt')) };
  };

  it('does not start I2C on pins that are not an I2C pair, and says why', () => {
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'bme1', partId: 'bme280-gy', position: at(0) }],
      wires: [wire('w1', 'D15', 'bme1', 'SDA'), wire('w2', 'D14', 'bme1', 'SCL')], // swapped
    };
    const { p, main, mods } = gen(scene);
    expect(main).not.toContain('HAL_I2C_Init');
    expect(mods).not.toContain('i2c');
    expect(p.notes.join(' ')).toMatch(/not an I2C pair/);
    expect(stmGpios(main).sort((a, b) => a - b)).toEqual([24, 25]);
  });

  it('uses the pin-specific AF numbers of the alternate function table (PB3 I2C2_SDA is AF9, PB10 I2C2_SCL is AF4)', () => {
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'bme1', partId: 'bme280-gy', position: at(0) }],
      wires: [wire('w1', 'D3', 'bme1', 'SDA'), wire('w2', 'D6', 'bme1', 'SCL')],
    };
    const { p, main } = gen(scene);
    expect(p.notes).toEqual([]);
    expect(main).toContain('GPIO_AF9_I2C2');
    expect(main).toContain('GPIO_AF4_I2C2');
    expect(checkAlternateFunctions(main, board)).toBe(4);
  });

  it('keeps the printf UART and the SWD pins free, and says why', () => {
    const scene: Scene = {
      board: board.id,
      parts: [
        { id: 'led1', partId: 'led-resistor', position: at(0) },
        { id: 'led2', partId: 'led-resistor', position: at(30) },
      ],
      wires: [wire('w1', 'D1', 'led1', 'A'), wire('w2', 'PA13', 'led2', 'A')],
    };
    const { p, main } = gen(scene);
    expect(main).not.toContain('pwm_start(&');
    expect(main).not.toMatch(/pin_init\(LED[12]_PORT/);
    expect(p.notes.join(' ')).toMatch(/printf output \(USART2\)/);
    expect(p.notes.join(' ')).toMatch(/debug \(SWD\) pin/);
  });

  it('starts SPI on one SPI block with the board file AF numbers, and CS as a GPIO', () => {
    const spi = board.rules.spi!;
    const scene: Scene = {
      board: board.id,
      parts: [{ id: 'acc1', partId: 'adxl362', position: at(0) }],
      wires: [wire('s1', spi.sck, 'acc1', 'SCLK'), wire('s2', spi.mosi, 'acc1', 'MOSI'), wire('s3', spi.miso, 'acc1', 'MISO'), wire('s4', spi.cs, 'acc1', 'CS')],
    };
    const { p, main, mods } = gen(scene);
    expect(p.notes).toEqual([]);
    expect(main).toContain('hspi1.Instance = SPI1;');
    expect(main).toContain('GPIO_AF5_SPI1');
    expect(main).toContain('pin_init(ACC1_CS_PORT, ACC1_CS_PIN, GPIO_MODE_OUTPUT_PP');
    expect(mods).toContain('spi');
    expect(checkAlternateFunctions(main, board)).toBe(5);
    expect(stmGpios(main).sort((a, b) => a - b)).toEqual(sceneGpios(scene, board));
  });

  it('shares one timer between LEDs, never one channel twice', () => {
    const scene: Scene = {
      board: board.id,
      parts: [
        { id: 'led1', partId: 'led-resistor', position: at(0) },
        { id: 'led2', partId: 'led-resistor', position: at(30) },
      ],
      wires: [wire('w1', 'D5', 'led1', 'A'), wire('w2', 'D12', 'led2', 'A')], // PB4 and PA6 both offer TIM3_CH1 only
    };
    const { main } = gen(scene);
    expect(main.match(/HAL_TIM_PWM_Init\(/g)).toHaveLength(1);
    expect(main).toContain('pwm_start(&htim3, TIM_CHANNEL_1);');
    expect(main).toMatch(/HAL_GPIO_WritePin\(LED2_PORT, LED2_PIN, \(tick \/ 25\) % 2/);
  });

  it('reads an analog part on a pin without ADC1 as a level, and says so', () => {
    const scene: Scene = { board: board.id, parts: [{ id: 'pot1', partId: 'potentiometer', position: at(0) }], wires: [wire('w1', 'D2', 'pot1', 'OUT')] };
    const { p, main, mods } = gen(scene);
    expect(main).not.toContain('adc_read(');
    expect(mods).not.toContain('adc');
    expect(p.notes.join(' ')).toMatch(/not an analog pin/);
  });

  it('falls back to the HSI when the Black Pill crystal does not start, and prints on USART1', () => {
    const bp = getBoard('blackpill-f411ce');
    const tpl = TEMPLATES.find((x) => x.id === 'blink-button')!;
    const main = file(generateStm32Hal(templateScene(tpl, bp, PARTS), bp, PARTS), 'Core/Src/main.c');
    expect(main).toContain('osc.OscillatorType = RCC_OSCILLATORTYPE_HSE;');
    expect(main).toContain('osc.PLL.PLLM = 16;');
    expect(main).toContain('huart_stdio.Instance = USART1;');
  });
});
