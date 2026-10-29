// Display Studio: the font, the panel facts, the renderer, the checks, and the generated sketch.
// The native test builds the real Adafruit GFX library on this computer with the generated drawing
// code and compares every pixel with the app's renderer (skipped when the library or a C++ compiler
// is not installed). Set BP_DISPLAY_COMPILE=1 to also compile the sketches for real boards with
// arduino-cli (slow).

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { firstPixelDifference, nativeAvailable } from './native/harness';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTS, getBoard } from '@shared/board';
import { buildProposal } from '@shared/projectBuilder';
import { FONT_5X7, glyphCode, glyphPixel } from '@shared/displayFont';
import { checkSpec, normalizeSpec, panelOf, rgb565 } from '@shared/displaySpec';
import { DisplaySim, Framebuffer } from '@shared/displayRender';
import { base64ToBytes, bitmapFromRgba, bitmapSize, parseGfxFont } from '@shared/displayAssets';
import { availableLibraries, generateDisplayCode, libraryName } from '@shared/displayCode';
import { testPatternSpec } from '@shared/displayExamples';
import type { Scene } from '@shared/types';

const panel = (id: string) => {
  const p = panelOf(PARTS[id]);
  if (!p) throw new Error(`${id} is not a pixel display`);
  return p;
};

/** A scene with the display wired by the safe-pin rules on a board. */
function sceneWith(partId: string, boardId: string): Scene {
  const r = buildProposal({ title: 't', summary: '', board: boardId, keepExisting: false, parts: [{ id: 'disp1', partId, label: 'Display', why: '' }], wires: [], links: [] }, { board: boardId, parts: [], wires: [] }, PARTS);
  if (!r.ok) throw new Error(r.errors.join(' '));
  return r.proposal.scene;
}

describe('font and panels', () => {
  it('has 96 glyphs of 5 columns, with the degree sign at 127', () => {
    expect(FONT_5X7.length).toBe(96 * 5);
    expect(glyphCode('°')).toBe(127);
    expect(glyphCode('é')).toBe(63);
    // "A": columns 7E 11 11 11 7E → the top row has pixels in columns 1-3 only.
    expect([0, 1, 2, 3, 4].map((c) => glyphPixel(65, c, 0))).toEqual([false, true, true, true, false]);
  });

  it('reads the panel from the part', () => {
    expect(panel('ssd1306-i2c')).toMatchObject({ widthPx: 128, heightPx: 64, color: 'mono', controller: 'SSD1306' });
    expect(panel('st7789-240')).toMatchObject({ widthPx: 240, heightPx: 240, color: 'rgb565', controller: 'ST7789' });
    expect(panel('gc9a01-round')).toMatchObject({ round: true, controller: 'GC9A01' });
    expect(panelOf(PARTS['lcd1602-i2c'])).toBeNull();
    expect(panel('ssd1351-oled-15')).toMatchObject({ color: 'rgb565', controller: 'SSD1351' });
  });
});

describe('renderer', () => {
  const p = panel('st7789-240');
  it('draws Adafruit-style circles symmetric and lines end to end', () => {
    const fb = new Framebuffer(p, 0);
    fb.fillCircle(50, 50, 10, 1);
    for (let d = -10; d <= 10; d++) expect(fb.px[50 * fb.w + 50 + d]).toBe(fb.px[50 * fb.w + 50 - d]);
    expect(fb.px[(50 - 10) * fb.w + 50]).toBe(1);
    fb.line(0, 0, 9, 3, 7);
    expect(fb.px[0]).toBe(7);
    expect(fb.px[3 * fb.w + 9]).toBe(7);
  });

  it('keeps colour panels in RGB565 and mono panels in one bit', () => {
    const spec = normalizeSpec({ screens: [{ id: 'a', background: '#FF8040', elements: [] }] });
    const color = new Framebuffer(p, 0);
    new DisplaySim(spec, p).frame(color, 0);
    expect(color.px[0]).toBe(rgb565([255, 128, 64]));
    const mono = new Framebuffer(panel('ssd1306-i2c'), 0);
    new DisplaySim(spec, panel('ssd1306-i2c')).frame(mono, 0);
    expect(mono.px[0]).toBe(1);
  });

  it('changes screens exactly on time and on conditions', () => {
    const spec = testPatternSpec('disp1', p);
    const sim = new DisplaySim(spec, p);
    sim.advance(2999);
    expect(sim.state.screen).toBe('bars');
    sim.advance(3000);
    expect(sim.state).toEqual({ screen: 'checker', enteredAt: 3000 });
    // Jumping ahead walks every timed step at its own time.
    sim.advance(18_500);
    expect(sim.state).toEqual({ screen: 'dashboard', enteredAt: 18_000 });
  });

  it('finds what goes wrong in a spec', () => {
    const bad = normalizeSpec({
      start: 'nope',
      screens: [{ id: 'a', elements: [{ type: 'text', x: 120, y: 0, text: 'This line is far too long for a small screen', size: 2 }, { type: 'bar', x: 0, y: 0, w: 50, h: 8, value: 'ghost' }] }],
      transitions: [{ from: 'a', to: 'b' }],
    });
    const msgs = checkSpec(bad, panel('ssd1306-i2c')).map((x) => `${x.severity}: ${x.message}`);
    expect(msgs.some((m) => m.startsWith('error') && m.includes('nope'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error') && m.includes('ghost'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error') && m.includes('“b”'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('warning') && m.includes('goes past'))).toBe(true);
    const cond = normalizeSpec({ vars: [{ name: 'temp' }], screens: [{ id: 'a', elements: [{ type: 'rect', visibleIf: 'temp >= 10.5 && temp < 11.5' }, { type: 'rect', visibleIf: '(temp > 3)' }] }] });
    const condMsgs = checkSpec(cond, panel('ssd1306-i2c')).map((x) => x.message);
    expect(condMsgs.filter((m) => m.includes('not understood'))).toHaveLength(1);
    expect(checkSpec(testPatternSpec('disp1', p), p).filter((x) => x.severity === 'error')).toEqual([]);
    expect(checkSpec(testPatternSpec('disp1', panel('ssd1306-i2c')), panel('ssd1306-i2c')).filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('normalises loose input: defaults, clamps, one-way pattern speed', () => {
    const s = normalizeSpec({ screens: [{ elements: [{ type: 'pattern', kind: 'checker', speed: -40, size: 0 }, { type: 'unknown' }] }], vars: [{ name: '1st value' }] });
    expect(s.screens[0].id).toBe('screen1');
    expect(s.screens[0].elements).toHaveLength(1);
    expect(s.screens[0].elements[0]).toMatchObject({ speed: 40, size: 1 });
    expect(s.vars[0].name).toBe('_1st_value');
  });
});

describe('generated sketch', () => {
  it('drives an ST7789 on an ESP32 through a RAM frame, on the wired SPI pins', () => {
    const scene = sceneWith('st7789-240', 'esp32-devkitc-30');
    const r = generateDisplayCode(testPatternSpec('disp1', panel('st7789-240')), panel('st7789-240'), PARTS['st7789-240'], scene, getBoard('esp32-devkitc-30'));
    expect(r.code).toContain('Adafruit_ST7789 tft(-1, ');
    expect(r.code).toContain('SPI_MODE3');
    expect(r.code).toContain('GFXcanvas16 gfx(240, 240)');
    expect(r.code).toContain('SPI.begin(18, -1, 23)');
    expect(r.notes).toEqual([]);
  });

  it('drives an SPI SSD1306 over SPI, not I2C', () => {
    const scene = sceneWith('ssd1306-spi', 'esp32-devkitc-30');
    const r = generateDisplayCode(testPatternSpec('disp1', panel('ssd1306-spi')), panel('ssd1306-spi'), PARTS['ssd1306-spi'], scene, getBoard('esp32-devkitc-30'));
    expect(r.code).toContain('&SPI,');
    expect(r.code).not.toContain('Wire.begin()');
    expect(r.code).toContain('#include <SPI.h>');
  });

  it('drives an SSD1306 on an Uno and says when a controller has no generator', () => {
    const scene = sceneWith('ssd1306-i2c', 'arduino-uno-r3');
    const r = generateDisplayCode(testPatternSpec('disp1', panel('ssd1306-i2c')), panel('ssd1306-i2c'), PARTS['ssd1306-i2c'], scene, getBoard('arduino-uno-r3'));
    expect(r.code).toContain('Adafruit_SSD1306 tft(128, 64, &Wire, -1)');
    expect(r.code).toContain('tft.display()');
    const epd = Object.values(PARTS).find((d) => panelOf(d)?.color === 'epaper')!;
    const none = generateDisplayCode(testPatternSpec('disp1', panelOf(epd)!), panelOf(epd)!, epd, scene, getBoard('arduino-uno-r3'));
    expect(none.code).toBe('');
    expect(none.notes[0]).toMatch(/cannot write its code yet/);
  });
});

describe('generated code: libraries and output', () => {
  const gen = (part: string, boardId: string, opts: Parameters<typeof generateDisplayCode>[5] = {}) => {
    const p = panel(part);
    return generateDisplayCode(testPatternSpec('disp1', p), p, PARTS[part], sceneWith(part, boardId), getBoard(boardId), opts);
  };

  it('reads the controller from the part file, not from its name', () => {
    expect(PARTS['st7796-tft-35'].display?.controller).toBe('ST7796');
    expect(PARTS['ili9488-tft-35'].display?.controller).toBe('ILI9488');
    expect(panel('st7796-tft-35')).toMatchObject({ widthPx: 320, heightPx: 480, color: 'rgb565', controller: 'ST7796' });
    expect(panel('ili9488-tft-35')).toMatchObject({ widthPx: 320, heightPx: 480, color: 'rgb565', controller: 'ILI9488' });
    // The file wins over a name that says something else.
    const renamed = { ...PARTS['st7796-tft-35'], id: 'x', name: 'Mystery TFT 320x480', keywords: ['tft'] };
    expect(panelOf(renamed)?.controller).toBe('ST7796');
  });

  it('drives an ST7796 through Adafruit_ST7796S with its real size', () => {
    const r = gen('st7796-tft-35', 'esp32-devkitc-30');
    expect(r.code).toContain('#include <Adafruit_ST7796S.h>');
    expect(r.code).toMatch(/Adafruit_ST7796S tft\(-?\d+, \d+, \d+\);/);
    expect(r.code).toContain('tft.init(320, 480);');
    expect(r.library).toBe('adafruit');
    expect(r.libraries).toContain('Adafruit ST7735 and ST7789 Library');
    // The DC/RS pin of the module is found (it is not named plain DC).
    expect(r.notes.join(' ')).not.toMatch(/DC pin is not wired/);
  });

  it('writes the ILI9488 with LovyanGFX (no Adafruit driver) and says so', () => {
    const r = gen('ili9488-tft-35', 'esp32-devkitc-30');
    expect(r.library).toBe('lovyangfx');
    expect(r.code).toContain('lgfx::Panel_ILI9488 _panel;');
    expect(r.code).toContain('#include <LovyanGFX.hpp>');
    expect(r.notes.join(' ')).toMatch(/no Adafruit GFX driver for the ILI9488/);
    expect(availableLibraries(panel('ili9488-tft-35'), getBoard('esp32-devkitc-30'))).toEqual(['lovyangfx', 'tft_espi', 'lvgl']);
  });

  it('LovyanGFX: the LGFX class carries the wired pins and colours are typed RGB565', () => {
    const r = gen('st7789-240', 'esp32-devkitc-30', { library: 'lovyangfx' });
    expect(r.code).toContain('lgfx::Panel_ST7789 _panel;');
    expect(r.code).toContain('cfg.pin_sclk = 18;');
    expect(r.code).toContain('cfg.pin_mosi = 23;');
    expect(r.code).toContain('cfg.panel_width = 240;');
    expect(r.code).toContain('cfg.spi_host = VSPI_HOST;');
    expect(r.code).toContain('lgfx::LGFX_Sprite gfx(&tft);');
    expect(r.code).toContain('gfx.pushSprite(0, 0);');
    expect(r.code).toContain('gfx.fillScreen(uint16_t(0x');
    expect(r.code).not.toContain('SPI.begin(');
    expect(r.code).not.toContain('Adafruit_');
    expect(r.libraries).toEqual(['LovyanGFX']);
    expect(r.files).toBeUndefined();
  });

  it("TFT_eSPI: a User_Setup.h from the drawing's pins, and the sketch uses a TFT_eSprite", () => {
    const r = gen('st7789-240', 'esp32-devkitc-30', { library: 'tft_espi' });
    expect(r.library).toBe('tft_espi');
    expect(r.code).toContain('#include <TFT_eSPI.h>');
    expect(r.code).toContain('TFT_eSprite gfx = TFT_eSprite(&tft);');
    const setup = r.files!.find((f) => f.name === 'User_Setup.h')!.text;
    expect(setup).toContain('#define ST7789_DRIVER');
    expect(setup).toContain('#define TFT_WIDTH 240');
    expect(setup).toContain('#define TFT_HEIGHT 240');
    expect(setup).toMatch(/#define TFT_MOSI 23/);
    expect(setup).toMatch(/#define TFT_SCLK 18/);
    expect(setup).toMatch(/#define TFT_DC \d+/);
    expect(r.notes.join(' ')).toMatch(/User_Setup\.h/);
  });

  it('ILI9341 portrait size goes into User_Setup.h as the controller sees it', () => {
    const setup = gen('ili9341-tft-28', 'esp32-devkitc-30', { library: 'tft_espi' }).files![0].text;
    expect(setup).toContain('#define ILI9341_DRIVER');
    expect(setup).toContain('#define TFT_WIDTH 240');
    expect(setup).toContain('#define TFT_HEIGHT 320');
  });

  it('a 320x480 screen on an ESP32 draws straight to the glass (no frame fits in RAM)', () => {
    const r = gen('st7796-tft-35', 'esp32-devkitc-30', { library: 'tft_espi' });
    expect(r.code).toContain('TFT_eSPI &gfx = tft;');
    expect(r.notes.join(' ')).toMatch(/too little RAM/);
  });

  it('falls back to the library that can drive the display, and refuses boards no library covers', () => {
    // LovyanGFX is not offered for a Pico; Adafruit is, for the ILI9341.
    expect(gen('ili9341-tft-28', 'rpi-pico', { library: 'lovyangfx' }).library).toBe('adafruit');
    expect(availableLibraries(panel('ili9488-tft-35'), getBoard('rpi-pico'))).toEqual(['tft_espi']);
    // An ILI9488 on an Uno has no library at all, and a mono OLED has only Adafruit.
    const none = gen('ili9488-tft-35', 'arduino-uno-r3');
    expect(none.code).toBe('');
    expect(none.notes[0]).toMatch(/ILI9488 needs LovyanGFX or TFT_eSPI/);
    expect(availableLibraries(panel('ssd1306-i2c'), getBoard('esp32-devkitc-30'))).toEqual(['adafruit']);
    expect(gen('ssd1306-i2c', 'esp32-devkitc-30', { library: 'lovyangfx' }).library).toBe('adafruit');
  });

  it('writes a module: display_screens.h/.cpp with display_init() and display_update()', () => {
    const r = gen('st7789-240', 'esp32-devkitc-30', { output: 'module', library: 'lovyangfx' });
    expect(r.files!.map((f) => f.name)).toEqual(['display_screens.h', 'display_screens.cpp']);
    const h = r.files![0].text;
    const cpp = r.files![1].text;
    expect(h).toContain('void display_init();');
    expect(h).toContain('void display_update();');
    expect(cpp).toContain('#include "display_screens.h"');
    expect(cpp).toContain('void display_init() {');
    expect(cpp).toContain('void display_update() {');
    expect(cpp).not.toContain('void setup()');
    expect(cpp).not.toContain('void loop()');
    expect(cpp).not.toContain('Serial.begin');
    // The main file is the small sketch that calls the module.
    expect(r.code).toContain('display_init();');
    expect(r.code).toContain('display_update();');
    expect(r.code).not.toContain('FONT5X7');
    // TFT_eSPI adds its User_Setup.h to the module's files.
    expect(gen('st7789-240', 'esp32-devkitc-30', { output: 'module', library: 'tft_espi' }).files!.map((f) => f.name)).toEqual(['display_screens.h', 'display_screens.cpp', 'User_Setup.h']);
    // The Adafruit sketch is unchanged by all this.
    expect(gen('st7789-240', 'esp32-devkitc-30').code).toContain('void setup() {');
  });
});

describe('touch input', () => {
  const p = panel('st7789-240');
  const touchSpec = () =>
    normalizeSpec({
      title: 'Touch',
      part: 'disp1',
      vars: [{ name: 'led', source: { sim: 'steps', values: [0], everyS: 5 }, digits: 0 }, { name: 'temp', source: { sim: 'wave', min: 10, max: 30, periodS: 8 }, digits: 1 }],
      screens: [
        {
          id: 'home',
          elements: [
            { type: 'button', x: 10, y: 10, w: 100, h: 40, label: 'LED', size: 2, color: '#FFFFFF', fill: '#202020', actions: [{ do: 'toggle', var: 'led' }] },
            { type: 'button', x: 10, y: 60, w: 100, h: 40, label: 'Next', size: 2, color: '#00FF00', fill: '', actions: [{ do: 'screen', screen: 'settings' }] },
            { type: 'button', x: 150, y: 10, w: 60, h: 60, hidden: true, actions: [{ do: 'set', var: 'temp', value: 99 }] },
          ],
        },
        { id: 'settings', elements: [{ type: 'text', x: 0, y: 0, text: 'Settings', size: 2 }] },
      ],
      transitions: [{ from: 'settings', to: 'home', touch: true }],
    });

  it('normalises buttons and touch changes of screen', () => {
    const s = touchSpec();
    expect(s.screens[0].elements[0]).toMatchObject({ type: 'button', label: 'LED', hidden: false, actions: [{ do: 'toggle', var: 'led' }] });
    expect(s.screens[0].elements[2]).toMatchObject({ hidden: true });
    expect(s.transitions[0]).toMatchObject({ touch: true, afterMs: 0, when: '' });
    // Unknown actions are dropped.
    const loose = normalizeSpec({ screens: [{ id: 'a', elements: [{ type: 'button', actions: [{ do: 'explode' }, { do: 'set', var: 'v', value: 'x' }] }] }] });
    expect(loose.screens[0].elements[0]).toMatchObject({ actions: [{ do: 'set', var: 'v', value: 0 }] });
    // A touch change needs no time or condition.
    expect(checkSpec(s, p).filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('checks buttons: unknown screens and values, tiny and empty buttons', () => {
    const bad = normalizeSpec({
      screens: [{ id: 'a', elements: [{ type: 'button', x: 0, y: 0, w: 10, h: 10, label: 'Go', actions: [{ do: 'screen', screen: 'zzz' }, { do: 'toggle', var: 'ghost' }] }, { type: 'button', x: 50, y: 50, w: 60, h: 40, label: 'Idle' }] }],
    });
    const msgs = checkSpec(bad, p).map((x) => `${x.severity}: ${x.message}`);
    expect(msgs.some((m) => m.startsWith('error') && m.includes('“zzz”'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error') && m.includes('“ghost”'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('warning') && m.includes('smaller than 24x24'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('warning') && m.includes('does nothing'))).toBe(true);
  });

  it('a tap runs the topmost button: toggles and sets values, changes screen, and touch transitions apply', () => {
    const sim = new DisplaySim(touchSpec(), p);
    expect(sim.tap(230, 230, 100)).toBe(false);
    expect(sim.tap(20, 20, 100)).toBe(true);
    expect(sim.values(100).led).toBe(1);
    sim.tap(20, 20, 200);
    expect(sim.values(200).led).toBe(0);
    sim.tap(160, 20, 300);
    expect(sim.values(300).temp).toBe(99);
    // The hidden region draws nothing; the visible button draws its border.
    const fb = new Framebuffer(p, 0);
    sim.frame(fb, 300);
    expect(fb.px[30 * fb.w + 170]).toBe(0);
    expect(fb.px[10 * fb.w + 10]).toBe(rgb565([255, 255, 255]));
    // "Next" goes to settings; a tap there (no button) goes home by the touch transition.
    expect(sim.tap(20, 70, 400)).toBe(true);
    expect(sim.state).toEqual({ screen: 'settings', enteredAt: 400 });
    expect(sim.tap(5, 5, 500)).toBe(true);
    expect(sim.state.screen).toBe('home');
  });

  it('writes the touch read for each controller, with a calibration block', () => {
    const board = getBoard('esp32-devkitc-30');
    const build = (touchPart: string) => {
      const r = buildProposal({ title: 't', summary: '', board: 'esp32-devkitc-30', keepExisting: false, parts: [{ id: 'disp1', partId: 'st7789-240', label: 'Display', why: '' }, { id: 'tch1', partId: touchPart, label: 'Touch', why: '' }], wires: [], links: [] }, { board: 'esp32-devkitc-30', parts: [], wires: [] }, PARTS);
      if (!r.ok) throw new Error(r.errors.join(' '));
      return generateDisplayCode(touchSpec(), p, PARTS['st7789-240'], r.proposal.scene, board);
    };
    const x = build('xpt2046-touch');
    expect(x.code).toContain('#include <XPT2046_Touchscreen.h>');
    expect(x.code).toMatch(/XPT2046_Touchscreen ts\(-?\d+(, -?\d+)?\);/);
    expect(x.code).toContain('TOUCH_RAW_X_MIN');
    expect(x.code).toContain('TODO: calibrate');
    expect(x.code).toContain('ts.begin();');
    expect(x.code).toContain('handleTouch(ms);');
    expect(x.code).toContain('bool bpTap(int x, int y, unsigned long ms)');
    expect(x.code).toContain('t_led_set ? t_led : sim_led(ms)');
    expect(x.libraries).toContain('XPT2046_Touchscreen');
    expect(x.code.indexOf('bool bpTouchRead')).toBeLessThan(x.code.indexOf('void handleTouch'));
    const f = build('ft6236-touch');
    expect(f.code).toContain('Adafruit_FT6206 ctp;');
    expect(f.code).toContain('ctp.begin(40)');
    expect(f.libraries).toContain('Adafruit FT6206 Library');
    const g = build('gt911-touch');
    expect(g.code).toContain('TAMC_GT911 tp = TAMC_GT911(');
    expect(g.code).toContain('tp.points[0].x');
    // A drawing with buttons but no touch part gets an empty read and a note.
    const none = generateDisplayCode(touchSpec(), p, PARTS['st7789-240'], sceneWith('st7789-240', 'esp32-devkitc-30'), board);
    expect(none.code).toContain('TODO: read your touch controller');
    expect(none.notes.join(' ')).toMatch(/no touch controller is wired/);
    // No buttons: no touch code at all.
    const plain = generateDisplayCode(testPatternSpec('disp1', p), p, PARTS['st7789-240'], sceneWith('st7789-240', 'esp32-devkitc-30'), board);
    expect(plain.code).not.toContain('bpTap');
  });

  it('draws the same button in host mode (the pixel test) without any touch hardware', () => {
    const r = generateDisplayCode(touchSpec(), p, PARTS['st7789-240'], sceneWith('st7789-240', 'esp32-devkitc-30'), getBoard('esp32-devkitc-30'), { host: true });
    expect(r.code).toContain('bpText(');
    expect(r.code).not.toContain('bpTouchRead');
  });

  it('the assistant tool describes buttons', async () => {
    const { TOOLS } = await import('../app/main/ai/tools');
    const d = TOOLS.find((x) => x.name === 'design_display')!;
    expect(d.description).toContain('button {x,y,w,h,label');
    expect(d.description).toContain('touch true');
  });
});

describe('pictures and fonts', () => {
  const p = panel('st7789-240');
  // A 10x2 picture: row 0 white, row 1 red, with the last pixel of row 0 transparent.
  const rgba = (() => {
    const a: number[] = [];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 10; x++) a.push(...(y === 0 ? [255, 255, 255, x === 9 ? 0 : 255] : [255, 0, 0, 255]));
    return a;
  })();
  const specWith = (bm: ReturnType<typeof bitmapFromRgba>, extra: Record<string, unknown> = {}) =>
    normalizeSpec({ title: 'Pic', part: 'disp1', bitmaps: [bm], screens: [{ id: 'a', elements: [{ type: 'bitmap', x: 4, y: 6, bitmap: bm.id, scale: 2, color: '#00FF00' }] }], start: 'a', ...extra });

  it('packs a 1-bit mask (MSB first, rows padded to bytes) and an RGB565 picture', () => {
    const mono = bitmapFromRgba('logo', rgba, 10, 2, 'mono');
    // Row 0: nine light pixels then a transparent one = 0xFF, 0x80. Row 1: red is dark ((255*3)/10 < 128) = 0x00, 0x00.
    expect(base64ToBytes(mono.data)).toEqual([0xff, 0x80, 0x00, 0x00]);
    expect(bitmapSize(mono)).toBe(4);
    expect(base64ToBytes(bitmapFromRgba('logo', rgba, 10, 2, 'mono', { invert: true }).data)).toEqual([0x00, 0x00, 0xff, 0xc0]);
    const col = bitmapFromRgba('logo', rgba, 10, 2, 'rgb565');
    const bytes = base64ToBytes(col.data);
    expect(bytes).toHaveLength(40);
    expect((bytes[0] << 8) | bytes[1]).toBe(0xffff);
    expect((bytes[18] << 8) | bytes[19]).toBe(0x0000); // transparent pixel mixed with black
    expect((bytes[20] << 8) | bytes[21]).toBe(rgb565([255, 0, 0]));
  });

  it('draws a mask in its colour and a colour picture in its own, at a scale', () => {
    const fb = new Framebuffer(p, 0);
    new DisplaySim(specWith(bitmapFromRgba('logo', rgba, 10, 2, 'mono')), p).frame(fb, 0);
    expect(fb.px[6 * fb.w + 4]).toBe(rgb565([0, 255, 0]));
    expect(fb.px[7 * fb.w + 5]).toBe(rgb565([0, 255, 0])); // scale 2
    expect(fb.px[8 * fb.w + 4]).toBe(0); // the dark row
    const fb2 = new Framebuffer(p, 0);
    new DisplaySim(specWith(bitmapFromRgba('logo', rgba, 10, 2, 'rgb565')), p).frame(fb2, 0);
    expect(fb2.px[8 * fb2.w + 4]).toBe(rgb565([255, 0, 0]));
    expect(fb2.px[6 * fb2.w + 4]).toBe(rgb565([255, 255, 255]));
  });

  it('writes the picture as a PROGMEM array with its draw call', () => {
    const board = getBoard('esp32-devkitc-30');
    const scene = sceneWith('st7789-240', 'esp32-devkitc-30');
    const mono = generateDisplayCode(specWith(bitmapFromRgba('logo', rgba, 10, 2, 'mono')), p, PARTS['st7789-240'], scene, board);
    expect(mono.code).toContain('static const uint8_t BM_logo[] PROGMEM = {  // 10x2, 4 bytes');
    expect(mono.code).toContain('0xFF, 0x80, 0x00, 0x00,');
    expect(mono.code).toContain('bpBitmapMono(4, 6, BM_logo, 10, 2, 2, 0x07E0);');
    const col = generateDisplayCode(specWith(bitmapFromRgba('logo', rgba, 10, 2, 'rgb565')), p, PARTS['st7789-240'], scene, board);
    expect(col.code).toContain('static const uint16_t BM_logo[] PROGMEM');
    expect(col.code).toContain('bpBitmap565(4, 6, BM_logo, 10, 2, 2);');
    // A one-colour panel turns a colour picture into on/off pixels in the sketch.
    const o = panel('ssd1306-i2c');
    const mono2 = generateDisplayCode(specWith(bitmapFromRgba('logo', rgba, 10, 2, 'rgb565')), o, PARTS['ssd1306-i2c'], sceneWith('ssd1306-i2c', 'esp32-devkitc-30'), board);
    expect(mono2.code).toContain('bpColor((r << 3) | (r >> 2)');
    // No bitmaps: no picture code.
    expect(generateDisplayCode(testPatternSpec('disp1', p), p, PARTS['st7789-240'], scene, board).code).not.toContain('BM_');
  });

  it('checks pictures: missing, damaged, and too big for the flash', () => {
    const missing = normalizeSpec({ screens: [{ id: 'a', elements: [{ type: 'bitmap', bitmap: 'ghost' }] }] });
    expect(checkSpec(missing, p).some((x) => x.severity === 'error' && x.message.includes('“ghost”'))).toBe(true);
    // Damaged data is dropped by normalizeSpec, so the element reports the missing picture.
    const damaged = normalizeSpec({ bitmaps: [{ id: 'bad', w: 10, h: 10, format: 'mono', data: 'AAAA' }], screens: [{ id: 'a', elements: [{ type: 'bitmap', bitmap: 'bad' }] }] });
    expect(damaged.bitmaps).toBeUndefined();
    // A 240x240 colour picture (112.5 KB) does not fit the 32 KB flash of an Uno, nor is it small on a 4 MB ESP32.
    const px = new Uint8Array(240 * 240 * 4).fill(200);
    const big = bitmapFromRgba('big', px, 240, 240, 'rgb565');
    const spec = specWith(big);
    const uno = getBoard('arduino-uno-r3');
    expect(checkSpec(spec, p, uno).some((x) => x.severity === 'error' && x.message.includes('more than half'))).toBe(true);
    expect(checkSpec(spec, p, getBoard('esp32-devkitc-30')).filter((x) => x.severity === 'error')).toEqual([]);
    // The one-bit version of the same picture is small enough.
    expect(checkSpec(specWith(bitmapFromRgba('big', px, 240, 240, 'mono')), p, uno).filter((x) => x.severity === 'error')).toEqual([]);
  });

  // A tiny Adafruit GFX font: "A" (3x3, one byte per 8 bits) and "B" (2x2), in the format fontconvert writes.
  const header = `
    const uint8_t TinyBitmaps[] PROGMEM = { 0xAA, 0x80, 0xF0 };
    const GFXglyph TinyGlyphs[] PROGMEM = {
      { 0, 3, 3, 4, 0, -3 },  // 0x41 'A'
      { 2, 2, 2, 3, 1, -2 } };  // 0x42 'B'
    const GFXfont Tiny PROGMEM = { (uint8_t *)TinyBitmaps, (GFXglyph *)TinyGlyphs, 0x41, 0x42, 5 };
  `;

  it('reads an Adafruit GFX font header and says so when the text is something else', () => {
    const r = parseGfxFont(header);
    if ('error' in r) throw new Error(r.error);
    expect(r.font).toMatchObject({ name: 'Tiny', first: 0x41, last: 0x42, yAdvance: 5 });
    expect(r.font.glyphs[0]).toEqual({ offset: 0, w: 3, h: 3, xAdvance: 4, xOffset: 0, yOffset: -3 });
    expect(r.font.glyphs[1]).toEqual({ offset: 2, w: 2, h: 2, xAdvance: 3, xOffset: 1, yOffset: -2 });
    expect(base64ToBytes(r.font.bitmap)).toEqual([0xaa, 0x80, 0xf0]);
    expect(parseGfxFont('int x = 3;')).toHaveProperty('error');
    expect(parseGfxFont(header.replace('0x42, 5', '0x43, 5'))).toHaveProperty('error');
  });

  it('draws text in the font as Adafruit does (baseline y, advance per glyph) and writes it to the sketch', () => {
    const r = parseGfxFont(header);
    if ('error' in r) throw new Error(r.error);
    const spec = normalizeSpec({ title: 'F', part: 'disp1', fonts: [r.font], screens: [{ id: 'a', elements: [{ type: 'text', x: 10, y: 20, text: 'AB', size: 1, color: '#FFFFFF', font: 'Tiny' }] }], start: 'a' });
    expect(spec.fonts).toHaveLength(1);
    expect(checkSpec(spec, p).filter((x) => x.severity === 'error')).toEqual([]);
    const fb = new Framebuffer(p, 0);
    new DisplaySim(spec, p).frame(fb, 0);
    const on = (x: number, y: number) => fb.px[y * fb.w + x] === 0xffff;
    // "A": bits 1010 1010 1 in rows of 3 at y - 3 = 17: row 17 = 1,0,1; row 18 = 0,1,0; row 19 = 1,0,1.
    expect([on(10, 17), on(11, 17), on(12, 17), on(11, 18), on(10, 19), on(12, 19), on(10, 18)]).toEqual([true, false, true, true, true, true, false]);
    // "B" starts 4 pixels on, offset by xOffset 1 and yOffset -2: bits 1111 = a 2x2 block at (15, 18).
    expect([on(15, 18), on(16, 18), on(15, 19), on(16, 19), on(14, 18)]).toEqual([true, true, true, true, false]);
    // An unknown font name is an error; the generator writes the arrays and the call.
    expect(checkSpec(normalizeSpec({ screens: [{ id: 'a', elements: [{ type: 'text', text: 'x', font: 'nope' }] }] }), p).some((x) => x.severity === 'error' && x.message.includes('“nope”'))).toBe(true);
    const code = generateDisplayCode(spec, p, PARTS['st7789-240'], sceneWith('st7789-240', 'esp32-devkitc-30'), getBoard('esp32-devkitc-30')).code;
    expect(code).toContain('static const BpFont F_Tiny = {F_Tiny_BM, F_Tiny_GL, 65, 66, 5};');
    expect(code).toContain('{0, 3, 3, 4, 0, -3},');
    expect(code).toContain('bpGfxTextAligned(10, 20, buf, &F_Tiny, 1, ');
  });

  it('the assistant keeps imported pictures and fonts when it redesigns, and sees their ids', async () => {
    const { runTool } = await import('../app/main/ai/tools');
    const scene = sceneWith('st7789-240', 'esp32-devkitc-30');
    const bm = bitmapFromRgba('logo', rgba, 10, 2, 'mono');
    scene.displays = [specWith(bm)];
    const turn = { highlight: [], calls: [] } as Parameters<typeof runTool>[4];
    const facts = JSON.parse((await runTool('get_display', { part: 'disp1' }, {} as never, [], turn, { scene })).content);
    expect(facts.importedPictures).toEqual([{ id: 'logo', widthPx: 10, heightPx: 2, kind: 'one-bit (drawn in one colour)' }]);
    expect(JSON.stringify(facts)).not.toContain(bm.data);
    await runTool('design_display', { title: 'x', part: 'disp1', rotation: 0, vars: [], screens: [{ id: 'a', elements: [{ type: 'bitmap', x: 0, y: 0, bitmap: 'logo' }] }], start: 'a', transitions: [] }, {} as never, [], turn, { scene });
    expect(turn.display?.spec.bitmaps?.[0].id).toBe('logo');
    expect(turn.display?.problems.filter((x) => x.severity === 'error')).toEqual([]);
  });
});

/** A drawing with every element LVGL maps: label with a value, bar, dial, graph, icon, shapes, a button and a touch change of screen. */
const lvglSpec = () =>
  normalizeSpec({
    title: 'Dashboard',
    part: 'disp1',
    vars: [{ name: 'temp', source: { sim: 'wave', min: 10, max: 35, periodS: 8 }, unit: '°C', digits: 1, from: 'bme1.temperature' }, { name: 'led', source: { sim: 'steps', values: [0], everyS: 5 }, digits: 0 }],
    screens: [
      {
        id: 'main',
        background: '#101820',
        elements: [
          { type: 'text', x: 120, y: 10, text: 'Temp {temp} °C', size: 2, color: '#FFA500', align: 'center' },
          { type: 'bar', x: 10, y: 50, w: 200, h: 16, value: 'temp', min: 10, max: 35, color: '#00FF00' },
          { type: 'gauge', x: 120, y: 140, r: 60, value: 'temp', min: 10, max: 35, color: '#FFFFFF', startDeg: -120, endDeg: 120, ticks: 10 },
          { type: 'graph', x: 10, y: 210, w: 220, h: 24, value: 'temp', min: 10, max: 35, color: '#3FB6E8' },
          { type: 'icon', x: 200, y: 8, name: 'warning', scale: 2, color: 'red', visibleIf: 'temp > 30', blinkMs: 500 },
          { type: 'rect', x: 5, y: 5, w: 40, h: 20, color: '#FFFFFF', fill: false },
          { type: 'circle', x: 30, y: 100, r: 10, color: '#FF00FF', fill: true },
          { type: 'line', x: 0, y: 0, x2: 50, y2: 50, color: '#FFFFFF' },
          { type: 'button', x: 150, y: 90, w: 80, h: 40, label: 'LED', size: 2, color: '#FFFFFF', fill: '#202020', actions: [{ do: 'toggle', var: 'led' }, { do: 'screen', screen: 'info' }] },
          { type: 'pattern', x: 0, y: 0, w: 10, h: 10, kind: 'checker', size: 2, speed: 0, colors: [] },
        ],
      },
      { id: 'info', background: '#000000', elements: [{ type: 'text', x: 10, y: 10, text: 'Tap to go back', size: 1, color: '#FFFFFF' }] },
    ],
    start: 'main',
    transitions: [{ from: 'info', to: 'main', touch: true }, { from: 'main', to: 'info', afterMs: 60000 }],
  });

describe('LVGL output', () => {
  const gen = (opts: Parameters<typeof generateDisplayCode>[5] = {}, boardId = 'esp32-devkitc-30') => {
    const p = panel('st7789-240');
    return generateDisplayCode(lvglSpec(), p, PARTS['st7789-240'], sceneWith('st7789-240', boardId), getBoard(boardId), { library: 'lvgl', ...opts });
  };

  it('is offered for colour SPI displays on the ESP32 and ESP32-S3 only', () => {
    expect(availableLibraries(panel('st7789-240'), getBoard('esp32-devkitc-30'))).toContain('lvgl');
    expect(availableLibraries(panel('st7789-240'), getBoard('esp32-s3-devkitc-1'))).toContain('lvgl');
    expect(availableLibraries(panel('st7789-240'), getBoard('rpi-pico'))).not.toContain('lvgl');
    expect(availableLibraries(panel('ssd1306-i2c'), getBoard('esp32-devkitc-30'))).not.toContain('lvgl');
    expect(libraryName('lvgl')).toBe('LVGL');
  });

  it('maps screens, text, bar, dial, graph, icon, shapes and the button to LVGL objects', () => {
    const r = gen();
    expect(r.library).toBe('lvgl');
    const c = r.code;
    expect(c).toContain('#include <lvgl.h>');
    expect(c).toContain('#include <LovyanGFX.hpp>');
    expect(c).toContain('lgfx::Panel_ST7789 _panel;');
    expect(c).toContain('scr_0 = lv_obj_create(NULL);  // main');
    expect(c).toContain('lv_label_create(scr_0)');
    expect(c).toContain('lv_bar_create(scr_0)');
    expect(c).toContain('lv_arc_create(scr_0)');
    expect(c).toContain('lv_chart_create(scr_0)');
    expect(c).toContain('lv_img_create(scr_0)');
    expect(c).toContain('lv_line_create(scr_0)');
    expect(c).toContain('lv_btn_create(scr_0)');
    expect(c).toContain('LV_RADIUS_CIRCLE');
    // The degree sign is UTF-8; values go in with snprintf and the variable's digits.
    expect(c).toContain('\\302\\260');
    expect(c).toContain(String.raw`snprintf(b, sizeof(b), "Temp %.1f \302\260C", v_temp)`);
    // Dial angles: -120..120 degrees from 12 o'clock = 150..30 degrees from 3 o'clock.
    expect(c).toContain('lv_arc_set_bg_angles(o_0_2, 150, 30);');
    // Conditions and blinking become show/hide in the timer.
    expect(c).toContain('(v_temp > 30)');
    expect(c).toContain('lv_obj_add_flag(o_0_4, LV_OBJ_FLAG_HIDDEN)');
    // Time, values and screen changes are the same logic as the other targets.
    expect(c).toContain('void changeScreens(unsigned long ms)');
    expect(c).toContain('double sim_temp(unsigned long ms)');
    expect(c).toContain('lv_timer_create(update_ui, 33, NULL);');
    // The flush goes through LovyanGFX; LVGL has its own draw buffers, no GFX canvas.
    expect(c).toContain('tft.pushImage(area->x1, area->y1, w, h, (lgfx::rgb565_t *)&color_p->full);');
    expect(c).not.toContain('FONT5X7');
    expect(c).not.toContain('lgfx::LGFX_Sprite');
    expect(c).not.toContain('gfx.');
    expect(c).not.toContain('LGFX &gfx');
    expect(c).toContain('lv_timer_handler();');
    expect(r.libraries).toEqual(expect.arrayContaining(['lvgl', 'LovyanGFX']));
  });

  it('turns the button and touch screen changes into LVGL events and an input device', () => {
    const c = gen().code;
    expect(c).toContain('static void on_btn_0_8(lv_event_t *e)');
    expect(c).toContain('lv_obj_add_event_cb(o_0_8, on_btn_0_8, LV_EVENT_CLICKED, NULL);');
    expect(c).toContain('t_led = (v_led != 0) ? 0 : 1; t_led_set = true; v_led = t_led;');
    expect(c).toContain('screen = 1; enteredAt = ms;');
    expect(c).toContain('static void on_tap_1(lv_event_t *e)');
    expect(c).toContain('lv_obj_add_event_cb(scr_1, on_tap_1, LV_EVENT_CLICKED, NULL);');
    expect(c).toContain('indev_drv.read_cb = my_touch_read;');
    expect(c).toContain('bpTouchRead(x, y)');
    // No touch part wired: an empty read to fill in, and a note.
    expect(c).toContain('TODO: read your touch controller');
    expect(gen().notes.join(' ')).toMatch(/no touch controller is wired/);
  });

  it('uses the wired touch controller through the calibrated read', () => {
    const r = buildProposal({ title: 't', summary: '', board: 'esp32-devkitc-30', keepExisting: false, parts: [{ id: 'disp1', partId: 'st7789-240', label: 'Display', why: '' }, { id: 'tch1', partId: 'ft6236-touch', label: 'Touch', why: '' }], wires: [], links: [] }, { board: 'esp32-devkitc-30', parts: [], wires: [] }, PARTS);
    if (!r.ok) throw new Error(r.errors.join(' '));
    const p = panel('st7789-240');
    const g = generateDisplayCode(lvglSpec(), p, PARTS['st7789-240'], r.proposal.scene, getBoard('esp32-devkitc-30'), { library: 'lvgl' });
    expect(g.code).toContain('Adafruit_FT6206 ctp;');
    expect(g.code).toContain('TOUCH_RAW_X_MIN');
    expect(g.libraries).toContain('Adafruit FT6206 Library');
  });

  it('writes lv_conf.h, leaves test patterns out and says what LVGL changes', () => {
    const r = gen();
    const conf = r.files!.find((f) => f.name === 'lv_conf.h')!.text;
    expect(conf).toContain('#define LV_COLOR_DEPTH 16');
    expect(conf).toContain('#define LV_FONT_MONTSERRAT_20 1');
    expect(conf).toContain('#define LV_USE_CHART 1');
    expect(conf).toContain('LV_TICK_CUSTOM_SYS_TIME_EXPR (millis())');
    expect(r.code).not.toContain('checker');
    const notes = r.notes.join(' ');
    expect(notes).toMatch(/not pixel for pixel/);
    expect(notes).toMatch(/Test patterns have no LVGL counterpart/);
    expect(notes).toMatch(/lv_conf\.h/);
  });

  it('works as a module and on the ESP32-S3; other boards fall back to a library they have', () => {
    const m = gen({ output: 'module' });
    expect(m.files!.map((f) => f.name)).toEqual(['display_screens.h', 'display_screens.cpp', 'lv_conf.h']);
    const cpp = m.files![1].text;
    expect(cpp).toContain('void display_init() {');
    expect(cpp).toContain('void display_update() {');
    expect(cpp).toContain('lv_init();');
    expect(cpp).not.toContain('void setup()');
    expect(gen({}, 'esp32-s3-devkitc-1').code).toContain('cfg.spi_host = SPI2_HOST;');
    // A Pico has no LVGL output: the generator uses a library the board has and says so.
    const pico = gen({}, 'rpi-pico');
    expect(pico.library).not.toBe('lvgl');
    expect(pico.notes.join(' ')).toMatch(/no LVGL driver/);
  });

  it('keeps imported pictures as lv_img data', () => {
    const p = panel('st7789-240');
    const bm = bitmapFromRgba('logo', new Uint8Array(8 * 2 * 4).fill(255), 8, 2, 'mono');
    const spec = normalizeSpec({ title: 'P', part: 'disp1', bitmaps: [bm], screens: [{ id: 'a', elements: [{ type: 'bitmap', x: 4, y: 6, bitmap: 'logo', scale: 2, color: '#00FF00' }] }], start: 'a' });
    const c = generateDisplayCode(spec, p, PARTS['st7789-240'], sceneWith('st7789-240', 'esp32-devkitc-30'), getBoard('esp32-devkitc-30'), { library: 'lvgl' }).code;
    expect(c).toContain('static const uint8_t BM_logo[] = {');
    expect(c).toContain('DSC_BM_logo.header.cf = LV_IMG_CF_ALPHA_1BIT;');
    expect(c).toContain('lv_img_set_zoom(o_0_0, 512);');
    expect(c).toContain('lv_obj_set_style_img_recolor(o_0_0,');
  });
});

/* ---------------- native pixel test: the sketch's drawing vs the app's renderer ---------------- */

describe.skipIf(!nativeAvailable)('the sketch draws the same pixels as the preview (Adafruit GFX built natively)', () => {
  // A moment on every test-pattern screen, the dashboard with the blinking warning on and off.
  const times = [0, 1234, 3000, 4567, 6100, 8000, 9100, 11_000, 13_300, 15_900, 18_000, 19_250, 22_222, 24_400, 26_000];
  it('a gauge and compound conditions, on a round panel', () => {
    const p = panel('gc9a01-round');
    const spec = normalizeSpec({
      title: 'Gauge',
      vars: [{ name: 'temp', source: { sim: 'wave', min: 10, max: 35, periodS: 7 }, digits: 1 }, { name: 'hum', source: { sim: 'ramp', min: 20, max: 80, periodS: 5 } }],
      screens: [
        {
          id: 'g',
          elements: [
            { type: 'gauge', x: 120, y: 120, r: 100, value: 'temp', min: 10, max: 35, color: '#FFFFFF', startDeg: -135, endDeg: 135, ticks: 25 },
            { type: 'text', x: 120, y: 170, text: '{temp}°C', size: 3, color: '#FFA500', align: 'center' },
            { type: 'icon', x: 112, y: 60, name: 'warning', scale: 2, color: 'red', visibleIf: 'temp > 30 && hum < 60 || temp > 34' },
          ],
        },
      ],
    });
    expect(checkSpec(spec, p).filter((x) => x.severity === 'error')).toEqual([]);
    expect(firstPixelDifference(spec, p, [0, 777, 1500, 2600, 3500, 4100, 5555, 6999])).toBeNull();
  }, 120_000);

  for (const id of ['st7789-240', 'ssd1306-i2c', 'gc9a01-round', 'st7735-tft-18']) {
    it(`${id}: every pixel of ${times.length} frames`, () => {
      const p = panel(id);
      for (const rotation of [0, 1]) expect(firstPixelDifference({ ...testPatternSpec('disp1', p), rotation }, p, times), `${id} rotation ${rotation}`).toBeNull();
    }, 120_000);
  }
});

/* ---------------- optional: compile for real boards ---------------- */

describe.skipIf(process.env.BP_DISPLAY_COMPILE !== '1')('compiles for real boards (arduino-cli)', () => {
  const cases: [string, string, string][] = [
    ['st7789-240', 'esp32-devkitc-30', 'esp32:esp32:esp32'],
    ['ssd1306-i2c', 'arduino-uno-r3', 'arduino:avr:uno'],
    ['ili9341-tft-28', 'rpi-pico', 'rp2040:rp2040:rpipico'],
    ['gc9a01-round', 'esp32-s3-devkitc-1', 'esp32:esp32:esp32s3'],
    ['ssd1306-spi', 'esp32-devkitc-30', 'esp32:esp32:esp32'],
    ['st7796-tft-35', 'esp32-devkitc-30', 'esp32:esp32:esp32'],
  ];
  for (const [part, boardId, fqbn] of cases) {
    it(`${part} on ${boardId}`, () => {
      const p = panel(part);
      const scene = sceneWith(part, boardId);
      const { code } = generateDisplayCode(testPatternSpec('disp1', p), p, PARTS[part], scene, getBoard(boardId));
      const dir = join(mkdtempSync(join(tmpdir(), 'bp-sketch-')), 'display_test');
      execFileSync('mkdir', ['-p', dir]);
      writeFileSync(join(dir, 'display_test.ino'), code);
      const r = spawnSync('arduino-cli', ['compile', '--fqbn', fqbn, dir], { encoding: 'utf8' });
      expect(r.status, r.stderr.slice(-3000) + r.stdout.slice(-2000)).toBe(0);
    }, 600_000);
  }
});

/* ---------------- optional: LovyanGFX and TFT_eSPI builds (need the libraries in arduino-cli) ---------------- */

// Gated like the compile test above (BP_DISPLAY_COMPILE=1) and NOT run on the machine that wrote it
// (no arduino-cli there):
//   arduino-cli lib install LovyanGFX TFT_eSPI "Adafruit ST7735 and ST7789 Library"
// TFT_eSPI reads User_Setup.h from its library folder, so the build passes the same lines as -D flags.
describe.skipIf(process.env.BP_DISPLAY_COMPILE !== '1')('compiles the LovyanGFX and TFT_eSPI code (arduino-cli)', () => {
  const cases: [string, string, string, 'lovyangfx' | 'tft_espi', 'sketch' | 'module'][] = [
    ['ili9488-tft-35', 'esp32-devkitc-30', 'esp32:esp32:esp32', 'lovyangfx', 'sketch'],
    ['st7789-240', 'esp32-devkitc-30', 'esp32:esp32:esp32', 'lovyangfx', 'module'],
    ['ili9341-tft-28', 'esp32-devkitc-30', 'esp32:esp32:esp32', 'tft_espi', 'sketch'],
    ['ili9488-tft-35', 'esp32-s3-devkitc-1', 'esp32:esp32:esp32s3', 'lovyangfx', 'sketch'],
  ];
  for (const [part, boardId, fqbn, library, output] of cases) {
    it(`${part} on ${boardId} with ${library} as a ${output}`, () => {
      const p = panel(part);
      const r = generateDisplayCode(testPatternSpec('disp1', p), p, PARTS[part], sceneWith(part, boardId), getBoard(boardId), { library, output });
      const dir = join(mkdtempSync(join(tmpdir(), 'bp-sketch-')), 'display_test');
      execFileSync('mkdir', ['-p', dir]);
      writeFileSync(join(dir, 'display_test.ino'), r.code);
      for (const f of r.files ?? []) if (f.name !== 'User_Setup.h') writeFileSync(join(dir, f.name), f.text);
      const setup = r.files?.find((f) => f.name === 'User_Setup.h')?.text;
      const defines = (setup ?? '')
        .split('\n')
        .filter((l) => l.startsWith('#define'))
        .map((l) => '-D' + l.replace('#define ', '').replace(/\s*\/\/.*/, '').replace(/ /, '='));
      const flags = setup ? ['--build-property', `build.extra_flags=-DUSER_SETUP_LOADED=1 ${defines.join(' ')}`] : [];
      const run = spawnSync('arduino-cli', ['compile', '--fqbn', fqbn, ...flags, dir], { encoding: 'utf8' });
      expect(run.status, run.stderr.slice(-3000) + run.stdout.slice(-2000)).toBe(0);
    }, 600_000);
  }
});

// Gated like the others (BP_DISPLAY_COMPILE=1) and NOT run on the machine that wrote it (no arduino-cli there):
//   arduino-cli lib install LovyanGFX "lvgl@8.3.11"
// lv_conf.h is found through the sketch folder (-DLV_CONF_INCLUDE_SIMPLE).
describe.skipIf(process.env.BP_DISPLAY_COMPILE !== '1')('compiles the LVGL code (arduino-cli)', () => {
  const cases: [string, string, string, 'sketch' | 'module'][] = [
    ['st7789-240', 'esp32-devkitc-30', 'esp32:esp32:esp32', 'sketch'],
    ['ili9341-tft-28', 'esp32-s3-devkitc-1', 'esp32:esp32:esp32s3', 'module'],
  ];
  for (const [part, boardId, fqbn, output] of cases) {
    it(`${part} on ${boardId} as a ${output}`, () => {
      const p = panel(part);
      const r = generateDisplayCode(lvglSpec(), p, PARTS[part], sceneWith(part, boardId), getBoard(boardId), { library: 'lvgl', output });
      const dir = join(mkdtempSync(join(tmpdir(), 'bp-sketch-')), 'display_test');
      execFileSync('mkdir', ['-p', dir]);
      writeFileSync(join(dir, 'display_test.ino'), r.code);
      for (const f of r.files ?? []) writeFileSync(join(dir, f.name), f.text);
      const run = spawnSync('arduino-cli', ['compile', '--fqbn', fqbn, '--build-property', `build.extra_flags=-DLV_CONF_INCLUDE_SIMPLE -I${dir}`, dir], { encoding: 'utf8' });
      expect(run.status, run.stderr.slice(-3000) + run.stdout.slice(-2000)).toBe(0);
    }, 600_000);
  }
});

/* ---------------- the assistant's display tools ---------------- */

describe('assistant tools: get_display and design_display', () => {
  it('gives the panel facts, checks a design and keeps it for the chat card', async () => {
    const { runTool } = await import('../app/main/ai/tools');
    const scene = sceneWith('st7789-240', 'esp32-devkitc-30');
    const turn = { highlight: [], calls: [] } as Parameters<typeof runTool>[4];
    const facts = JSON.parse((await runTool('get_display', { part: 'disp1' }, {} as never, [], turn, { scene })).content);
    expect(facts).toMatchObject({ widthPx: 240, heightPx: 240, controller: 'ST7789', codeGenerator: expect.stringMatching(/^yes \(Adafruit GFX/) });

    const bad = await runTool('design_display', { title: 'x', part: 'disp1', rotation: 0, vars: [], screens: [{ id: 'a', elements: [{ type: 'bar', x: 0, y: 0, w: 10, h: 5, value: 'ghost' }] }], start: 'a', transitions: [] }, {} as never, [], turn, { scene });
    expect(JSON.parse(bad.content).errors[0]).toMatch(/ghost/);

    const good = await runTool('design_display', { ...testPatternSpec('disp1', panel('st7789-240')) }, {} as never, [], turn, { scene });
    expect(JSON.parse(good.content).errors).toEqual([]);
    expect(turn.display?.spec.screens).toHaveLength(7);

    const missing = await runTool('get_display', { part: 'nope' }, {} as never, [], turn, { scene });
    expect(missing.isError).toBe(true);
    expect(missing.content).toContain('disp1 (ST7789');
  });
});
