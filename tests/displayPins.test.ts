// Display pins named in a project's files (TFT_eSPI, LovyanGFX, Adafruit): the reader itself and what
// the project archive makes of it.

import { describe, expect, it } from 'vitest';
import { PARTS } from '@shared/board';
import { stripComments } from '@shared/codeCheck';
import { displayPinsFromCode, displayPinsFromFlags, pinNumber, tftEspiDrivers } from '@shared/displayPins';
import { analyzeProject } from '@shared/archive/extract';
import { HEADERS, libDepFacts } from '@shared/archive/includeMap';
import type { ProjectFile } from '@shared/archive/types';

const file = (path: string, text: string): ProjectFile => ({ path, text, size: text.length, mtime: 1 });
const analyze = (files: ProjectFile[]) => analyzeProject('/x/p', '/x', 'p', files, PARTS, 0);
const pins = (text: string) => displayPinsFromCode(stripComments(text)).map((p) => `${p.role}=${p.gpio}`);

// the stock file ships with many commented-out alternatives; only the live lines count
const USER_SETUP = `// User_Setup.h
#define ILI9341_DRIVER
//#define ST7789_DRIVER
//#define TFT_MISO 19
#define TFT_MISO 19
#define TFT_MOSI 23
#define TFT_SCLK 18
#define TFT_CS   15  // Chip select control pin
#define TFT_DC    2
#define TFT_RST  -1
//#define TFT_RST  4
#define TOUCH_CS 21
#define LOAD_GLCD
`;

const LOVYAN = `
#include <LovyanGFX.hpp>
class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_ST7796 _panel_instance;
  lgfx::Bus_SPI _bus_instance;
  lgfx::Light_PWM _light_instance;
  lgfx::Touch_XPT2046 _touch_instance;
public:
  LGFX() {
    { auto cfg = _bus_instance.config();
      cfg.spi_host = VSPI_HOST;
      cfg.pin_sclk = 14; cfg.pin_mosi = 13; cfg.pin_miso = 12; cfg.pin_dc = 2;
      _bus_instance.config(cfg); _panel_instance.setBus(&_bus_instance); }
    { auto cfg = _panel_instance.config();
      cfg.pin_cs = 15;
      cfg.pin_rst = -1;
      cfg.pin_busy = -1;
      _panel_instance.config(cfg); }
    { auto cfg = _light_instance.config();
      cfg.pin_bl = 27;
      _light_instance.config(cfg); _panel_instance.setLight(&_light_instance); }
    { auto cfg = _touch_instance.config();
      cfg.pin_cs = 33;
      cfg.pin_int = 36;
      _touch_instance.config(cfg); _panel_instance.setTouch(&_touch_instance); }
  }
};`;

describe('display pins in code', () => {
  it('reads TFT_eSPI User_Setup.h, ignoring comments and unconnected (-1) pins', () => {
    expect(pins(USER_SETUP)).toEqual(['miso=19', 'mosi=23', 'sclk=18', 'cs=15', 'dc=2', 'touch_cs=21']);
    expect(tftEspiDrivers(stripComments(USER_SETUP)).map((d) => d.controller)).toEqual(['ILI9341']);
  });

  it('reads PlatformIO build flags', () => {
    const ini = '[env:esp32]\nbuild_flags =\n  -D USER_SETUP_LOADED=1\n  -D ST7789_DRIVER=1\n  -D TFT_MOSI=23\n  -DTFT_SCLK=18\n  -DTFT_CS=5\n  -D TFT_RST=-1\n  -D TFT_DC=PIN_DC\n  -D PIN_DC=2\n';
    expect(displayPinsFromFlags(ini).map((p) => `${p.role}=${p.gpio}@${p.line}`)).toEqual(['mosi=23@5', 'sclk=18@6', 'cs=5@7', 'dc=2@9']);
    expect(tftEspiDrivers(ini)[0]).toEqual({ controller: 'ST7789', line: 4 });
  });

  it('reads LovyanGFX config blocks and tells the touch chip select from the panel one', () => {
    expect(pins(LOVYAN)).toEqual(['sclk=14', 'mosi=13', 'miso=12', 'dc=2', 'cs=15', 'bl=27', 'touch_cs=33', 'touch_irq=36']);
  });

  it('reads Adafruit constructors: hardware SPI and software SPI', () => {
    expect(pins('#define TFT_CS 5\n#define TFT_DC 4\nAdafruit_ILI9341 tft = Adafruit_ILI9341(TFT_CS, TFT_DC, 16);')).toEqual(['cs=5', 'dc=4', 'rst=16']);
    expect(pins('Adafruit_ST7789 tft(10, 9, 11, 12, 8);')).toEqual(['cs=10', 'dc=9', 'mosi=11', 'sclk=12', 'rst=8']);
    expect(pins('Adafruit_ST7735 tft(&SPI, 5, 2, 4);')).toEqual([]); // the (spi, cs, dc, rst) form is not read
  });

  it('counts a pin named twice once, and follows constants', () => {
    expect(pins('#define TFT_CS PIN_CS\n#define PIN_CS 5\nAdafruit_ILI9341 t(TFT_CS, 4, 16);')).toEqual(['cs=5', 'dc=4', 'rst=16']);
    expect(pinNumber('GPIO_NUM_23', new Map())).toBe(23);
    expect(pinNumber('-1', new Map())).toBeNull();
    expect(pinNumber('A0', new Map())).toBeNull();
  });
});

describe('display libraries in the project archive', () => {
  it('knows the display libraries by header and by lib_deps name', () => {
    expect(HEADERS['tft_espi.h'].library).toBe('TFT_eSPI');
    expect(HEADERS['lovyangfx.hpp'].library).toBe('LovyanGFX');
    for (const dep of ['bodmer/TFT_eSPI@^2.5.43', 'lovyan03/LovyanGFX', 'adafruit/Adafruit ST7735 and ST7789 Library', 'olikraus/U8g2', 'lvgl/lvgl@^8.3']) expect(libDepFacts(dep)?.library, dep).toBeTruthy();
    expect(libDepFacts('adafruit/Adafruit ILI9341')?.partId).toBe('ili9341-tft-28');
  });

  it('reads TFT_eSPI pins from User_Setup.h with file and line', () => {
    const p = analyze([file('include/User_Setup.h', USER_SETUP), file('src/main.cpp', '#include <TFT_eSPI.h>\nTFT_eSPI tft;\nvoid setup(){ tft.init(); }\n')]);
    expect(p.libraries.map((l) => l.value)).toEqual(expect.arrayContaining(['TFT_eSPI', 'TFT_eSPI (ILI9341)']));
    expect(p.buses.map((b) => b.value)).toContain('spi');
    const mosi = p.pins.find((x) => x.value.use.includes('TFT_MOSI'))!;
    expect(mosi.value.pin).toBe('GPIO 23');
    expect(mosi.evidence).toEqual({ file: 'include/User_Setup.h', line: 6 });
    expect(p.parts.map((x) => x.value.partId)).toContain('ili9341-tft-28');
  });

  it('reads pins from PlatformIO build flags and LovyanGFX configs', () => {
    const a = analyze([file('platformio.ini', '[env:a]\nboard = esp32dev\nbuild_flags =\n  -D TFT_MOSI=23\n  -D TFT_CS=5\n  -D ST7796_DRIVER\nlib_deps = bodmer/TFT_eSPI\n')]);
    expect(a.pins.map((x) => x.value.pin)).toEqual(['GPIO 23', 'GPIO 5']);
    expect(a.pins[0].evidence).toEqual({ file: 'platformio.ini', line: 4 });
    expect(a.libraries.map((l) => l.value)).toContain('TFT_eSPI (ST7796)');
    expect(a.parts.map((x) => x.value.partId)).toContain('st7796-tft-35');
    const b = analyze([file('src/LGFX.hpp', LOVYAN)]);
    expect(b.pins.find((x) => x.value.pin === 'GPIO 33')?.value.use).toContain('touch chip select');
    expect(b.pins.find((x) => x.value.pin === 'GPIO 33')?.evidence?.line).toBe(23);
    expect(b.libraries.map((l) => l.value)).toContain('LovyanGFX (ST7796)');
  });
});
