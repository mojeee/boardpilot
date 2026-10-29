// PlatformIO export (shared/starter/platformio.ts) and the toolchain.pioBoard field of the board files.

import { describe, expect, it } from 'vitest';
import { BOARDS, getBoard } from '@shared/board';
import { generatePlatformio, includedHeaders, serialBaud, userSetupFlags } from '@shared/starter';
import { iniAsDefines } from '@shared/codeProject';
import { displayPinsFromFlags } from '@shared/displayPins';

const SKETCH = `#include <Adafruit_BME280.h>
#include <TFT_eSPI.h>
#include "pins.h"
#include <Wire.h>
void setup() { Serial.begin(9600); }
void loop() {}
`;

const iniOf = (p: { files: { name: string; text: string }[] }) => p.files.find((f) => f.name === 'platformio.ini')!.text;

describe('PlatformIO export', () => {
  it('writes platformio.ini, src/main.cpp with Arduino.h and include/ for headers', () => {
    const p = generatePlatformio([{ name: 'sketch.ino', text: SKETCH }, { name: 'pins.h', text: '#define LED 2\n' }, { name: 'util.cpp', text: 'int x;\n' }], getBoard('esp32-devkitc-30'), { name: 'My Project' });
    expect(p.files.map((f) => f.name).sort()).toEqual(['include/pins.h', 'platformio.ini', 'src/main.cpp', 'src/util.cpp']);
    expect(p.files.find((f) => f.name === 'src/main.cpp')!.text.startsWith('#include <Arduino.h>\n')).toBe(true);
    const ini = iniOf(p);
    expect(ini).toContain('[env:esp32dev]');
    expect(ini).toContain('platform = espressif32');
    expect(ini).toContain('board = esp32dev');
    expect(ini).toContain('framework = arduino');
    expect(ini).toContain('monitor_speed = 9600');
    expect(ini).toContain('    adafruit/Adafruit BME280 Library');
    expect(ini).toContain('    bodmer/TFT_eSPI');
    expect(ini).not.toMatch(/pins\.h|Wire/);
    expect(p.folder).toBe('my-project-pio');
  });

  it('turns a TFT_eSPI User_Setup.h into one -D flag per line the code checker still reads', () => {
    const setup = '#define ST7789_DRIVER\n#define TFT_WIDTH 240\n#define TFT_MOSI 23\n// #define TFT_MISO 19  (not wired)\n#define TFT_RST -1\n#define LOAD_GLCD  // font\n#define SPI_FREQUENCY 40000000\n';
    expect(userSetupFlags(setup)).toEqual(['-D ST7789_DRIVER', '-D TFT_WIDTH=240', '-D TFT_MOSI=23', '-D TFT_RST=-1', '-D LOAD_GLCD', '-D SPI_FREQUENCY=40000000']);
    const p = generatePlatformio([{ name: 'sketch.ino', text: SKETCH }, { name: 'User_Setup.h', text: setup }], getBoard('esp32-devkitc-30'));
    expect(p.files.some((f) => /User_Setup/.test(f.name))).toBe(false);
    const ini = iniOf(p);
    expect(ini).toContain('    -D USER_SETUP_LOADED=1');
    expect(ini).toContain('    -D TFT_MOSI=23');
    expect(iniAsDefines(ini)).toContain('#define TFT_MOSI 23');
    expect(displayPinsFromFlags(ini).length).toBeGreaterThan(0);
  });

  it('keeps an existing platformio.ini and names includes it has no library for', () => {
    const keep = generatePlatformio([{ name: 'a.ino', text: '#include <Weird.h>\n' }, { name: 'platformio.ini', text: '[env:x]\n' }], getBoard('rpi-pico'));
    expect(iniOf(keep)).toBe('[env:x]\n');
    const p = generatePlatformio([{ name: 'a.ino', text: '#include <Weird.h>\n' }], getBoard('rpi-pico'));
    expect(p.notes.join(' ')).toContain('weird.h');
    expect(iniOf(p)).toContain('board_build.core = earlephilhower');
  });

  it('helpers', () => {
    expect(serialBaud('Serial.begin(115200);')).toBe(115200);
    expect(serialBaud('Serial0.begin ( 74880 );')).toBe(74880);
    expect(serialBaud('')).toBe(115200);
    expect(includedHeaders('#include <A/B.h>\n  # include "c.h"\n// #include <d.h>')).toEqual(['b.h', 'c.h']);
  });

  it('every board file goes through the generator; only the board without a known id is left unset', () => {
    const unset: string[] = [];
    for (const b of Object.values(BOARDS)) {
      const p = generatePlatformio([{ name: 'sketch.ino', text: 'void setup(){}\nvoid loop(){}\n' }], b);
      const ini = iniOf(p);
      if (b.toolchain.pioBoard) expect(ini).toContain(`board = ${b.toolchain.pioBoard}`);
      else {
        unset.push(b.id);
        expect(ini).toContain('CHANGE_ME');
        expect(p.notes.join(' ')).toContain('PlatformIO board id');
      }
    }
    expect(unset).toEqual(['esp32-s3-wroom-1-module']);
  });
});
