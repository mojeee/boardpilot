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
import { availableLibraries, generateDisplayCode } from '@shared/displayCode';
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
    expect(availableLibraries(panel('ili9488-tft-35'), getBoard('esp32-devkitc-30'))).toEqual(['lovyangfx', 'tft_espi']);
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
