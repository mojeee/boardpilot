// Display Studio → an Arduino sketch that draws on the real display what the preview shows. The
// sketch carries the same 5x7 font, icons and pattern maths as shared/displayRender.ts and uses
// Adafruit GFX primitives (same line and circle algorithms), so the pixels match. Values are
// simulated on the board too (the same curves as in the app) until you replace each read with your
// sensor: every such line is marked TODO with the part it should come from.
//
// Drivers (Arduino Library Manager names): Adafruit SSD1306, Adafruit SH110X, Adafruit ST7735 and
// ST7789 Library (also the ST7796S driver), Adafruit ILI9341, Adafruit GC9A01A, Adafruit PCD8544 Nokia
// 5110 LCD library; all on Adafruit GFX Library. Colour SPI controllers can instead be driven by
// LovyanGFX or TFT_eSPI (the only choice for the ILI9488, which has no Adafruit driver). The code is a
// sketch or a module (display_screens.h/.cpp with display_init() and display_update()). Other
// controllers render in the preview but get no code yet (said plainly).

import type { BoardDef, PartDef, Scene } from './types';
import { PARTS, boardPinFor, pinById } from './board';
import { codePinName } from './planner';
import { FONT_5X7 } from './displayFont';
import { COLOR_BARS, GRAPH_STEP_MS, ICON_BITS, buttonLabelAt } from './displayRender';
import { parseColor, parseCondition, rgb565, rotatedSize, type DisplayElement, type DisplaySpec, type PanelInfo } from './displaySpec';
import { dataOf } from './displayAssets';
import { lvConfH, lvglParts } from './displayLvgl';
import { TOUCH_PARTS, NO_TOUCH_CODE, touchCode, type TouchCode } from './displayTouch';
import { t } from './i18n';

export interface DisplayCode {
  /** the sketch (with output "module": the small sketch that calls the module), or '' when this controller has no generator yet */
  code: string;
  libraries: string[];
  notes: string[];
  /** the library the code is for (the one asked for, or the one that can drive this display) */
  library?: DisplayLibrary;
  /** other files that go with the code: the module's display_screens.h/.cpp, TFT_eSPI's User_Setup.h */
  files?: DisplayFile[];
}

interface Driver {
  include: string[];
  libraries: string[];
  bus: 'i2c' | 'spi';
  /** declaration and begin(), given the pins */
  setup: (p: Pins, panel: PanelInfo) => { decl: string; begin: string[] };
  /** how the frame reaches the glass: a buffered mono driver calls display(), colour ones push a canvas */
  mono: boolean;
}

interface Pins {
  cs: string;
  dc: string;
  rst: string;
  mosi: string;
  sck: string;
  miso: string;
  addr: string;
  /** the module is wired over SPI (an SSD1306 comes in I2C and SPI versions) */
  spi: boolean;
}

const DRIVERS: Record<string, Driver> = {
  SSD1306: {
    include: ['#include <Wire.h>', '#include <Adafruit_GFX.h>', '#include <Adafruit_SSD1306.h>'],
    libraries: ['Adafruit SSD1306', 'Adafruit GFX Library'],
    bus: 'i2c',
    mono: true,
    setup: (p, panel) =>
      p.spi
        ? {
            decl: `Adafruit_SSD1306 tft(${panel.widthPx}, ${panel.heightPx}, &SPI, ${p.dc}, ${p.rst}, ${p.cs});  // SPI module`,
            begin: ['  if (!tft.begin(SSD1306_SWITCHCAPVCC)) {', '    for (;;) delay(100);  // no answer: check the wiring', '  }'],
          }
        : {
            decl: `Adafruit_SSD1306 tft(${panel.widthPx}, ${panel.heightPx}, &Wire, -1);`,
            begin: [`  if (!tft.begin(SSD1306_SWITCHCAPVCC, ${p.addr})) {  // 0x3C on most modules, 0x3D on some`, '    for (;;) delay(100);  // not found: check the wiring and the address', '  }'],
          },
  },
  SH1106: {
    include: ['#include <Wire.h>', '#include <Adafruit_GFX.h>', '#include <Adafruit_SH110X.h>'],
    libraries: ['Adafruit SH110X', 'Adafruit GFX Library'],
    bus: 'i2c',
    mono: true,
    setup: (p, panel) => ({ decl: `Adafruit_SH1106G tft(${panel.widthPx}, ${panel.heightPx}, &Wire, -1);`, begin: [`  tft.begin(${p.addr}, true);`] }),
  },
  ST7789: {
    include: ['#include <SPI.h>', '#include <Adafruit_GFX.h>', '#include <Adafruit_ST7789.h>'],
    libraries: ['Adafruit ST7735 and ST7789 Library', 'Adafruit GFX Library'],
    bus: 'spi',
    mono: false,
    setup: (p, panel) => ({
      decl: `Adafruit_ST7789 tft(${p.cs}, ${p.dc}, ${p.rst});`,
      // 240x240 modules without a CS pin need SPI mode 3 (Adafruit ST7789 example).
      begin: [`  tft.init(${panel.widthPx}, ${panel.heightPx}${p.cs === '-1' ? ', SPI_MODE3' : ''});`],
    }),
  },
  ST7735: {
    include: ['#include <SPI.h>', '#include <Adafruit_GFX.h>', '#include <Adafruit_ST7735.h>'],
    libraries: ['Adafruit ST7735 and ST7789 Library', 'Adafruit GFX Library'],
    bus: 'spi',
    mono: false,
    setup: (p, panel) => ({
      decl: `Adafruit_ST7735 tft(${p.cs}, ${p.dc}, ${p.rst});`,
      begin: [panel.widthPx === 80 || panel.heightPx === 80 ? '  tft.initR(INITR_MINI160x80);  // 0.96" 80x160 module' : '  tft.initR(INITR_BLACKTAB);  // try INITR_GREENTAB if the colours or edges look wrong'],
    }),
  },
  ILI9341: {
    include: ['#include <SPI.h>', '#include <Adafruit_GFX.h>', '#include <Adafruit_ILI9341.h>'],
    libraries: ['Adafruit ILI9341', 'Adafruit GFX Library'],
    bus: 'spi',
    mono: false,
    setup: (p) => ({ decl: `Adafruit_ILI9341 tft(${p.cs}, ${p.dc}, ${p.rst});`, begin: ['  tft.begin();'] }),
  },
  // Adafruit_ST7796S ships in the "Adafruit ST7735 and ST7789 Library"; init(width, height) takes the
  // panel size (Adafruit ST77XX library reference, class Adafruit_ST7796S).
  ST7796: {
    include: ['#include <SPI.h>', '#include <Adafruit_GFX.h>', '#include <Adafruit_ST7796S.h>'],
    libraries: ['Adafruit ST7735 and ST7789 Library', 'Adafruit GFX Library'],
    bus: 'spi',
    mono: false,
    setup: (p, panel) => ({ decl: `Adafruit_ST7796S tft(${p.cs}, ${p.dc}, ${p.rst});`, begin: [`  tft.init(${Math.min(panel.widthPx, panel.heightPx)}, ${Math.max(panel.widthPx, panel.heightPx)});`] }),
  },
  GC9A01: {
    include: ['#include <SPI.h>', '#include <Adafruit_GFX.h>', '#include <Adafruit_GC9A01A.h>'],
    libraries: ['Adafruit GC9A01A', 'Adafruit GFX Library'],
    bus: 'spi',
    mono: false,
    setup: (p) => ({ decl: `Adafruit_GC9A01A tft(${p.cs}, ${p.dc}, ${p.rst});`, begin: ['  tft.begin();'] }),
  },
};

const ident = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');
/** A C double literal: 18 → 18.0. Values are doubles like in the app, so both compute the same numbers. */
const fl = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
const hex = (n: number, w = 2) => `0x${n.toString(16).toUpperCase().padStart(w, '0')}`;
// "°" is font code 127; octal (at most 3 digits) so "°C" does not turn into one hex escape.
const cstr = (s: string) => JSON.stringify(s).replace(/°/g, '\\177');

/** A colour as the sketch stores it: RGB565 on colour panels, 1/0 (light/dark) on mono. */
function colorLiteral(panel: PanelInfo, c: string, typed = false): string {
  const rgb = parseColor(c);
  if (panel.color === 'rgb565') return typed ? `uint16_t(${hex(rgb565(rgb), 4)})` : hex(rgb565(rgb), 4);
  return (rgb[0] * 3 + rgb[1] * 6 + rgb[2]) / 10 >= 128 ? '1' : '0';
}

/** A spec condition ("temp > 30 && !alarm") as C; one checkSpec does not understand is false, like in the app. */
function condC(cond: string): string {
  const c = cond.trim();
  if (!c) return 'true';
  const ors = parseCondition(c);
  if (!ors) return 'false';
  const atom = (a: string) => {
    const m = /^([A-Za-z_]\w*)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)$/.exec(a);
    if (m) return `(v_${ident(m[1])} ${m[2]} ${m[3]})`;
    return `(v_${ident(a.replace(/^!/, ''))} ${a.startsWith('!') ? '==' : '!='} 0)`;
  };
  return `(${ors.map((and) => `(${and.map(atom).join(' && ')})`).join(' || ')})`;
}

function varFunction(spec: DisplaySpec): string[] {
  const out: string[] = [];
  for (const v of spec.vars) {
    const s = v.source;
    const body =
      s.sim === 'wave'
        ? `return ${fl(s.min)} + (${fl(s.max - s.min)}) * (1.0 - cos(2.0 * PI * t / ${fl(Math.max(0.1, s.periodS))})) / 2.0;`
        : s.sim === 'ramp'
          ? `return ${fl(s.min)} + (${fl(s.max - s.min)}) * fmod(t, ${fl(Math.max(0.1, s.periodS))}) / ${fl(Math.max(0.1, s.periodS))};`
          : s.sim === 'steps'
            ? `static const double vals[] = {${(s.values.length ? s.values : [0]).map((x) => `${fl(x)}`).join(', ')}};\n  return vals[(unsigned long)(t / ${fl(Math.max(0.1, s.everyS))}) % ${s.values.length || 1}];`
            : `return ${fl(s.min)} + (${fl(s.max - s.min)}) * bpHash01((uint32_t)(t / ${fl(Math.max(0.1, s.everyS))}));`;
    out.push(
      `// ${v.name}${v.unit ? ` (${v.unit})` : ''}: simulated like in BoardPilot.${v.from ? ` TODO: on the board, read it from ${v.from}.` : ''}`,
      `double sim_${ident(v.name)}(unsigned long ms) {`,
      '  double t = ms / 1000.0;',
      `  ${body}`,
      '}',
    );
  }
  return out;
}

function elementC(el: DisplayElement, panel: PanelInfo, spec: DisplaySpec, typed = false): string[] {
  const col = (c: string) => colorLiteral(panel, c, typed);
  const out: string[] = [];
  switch (el.type) {
    case 'text': {
      const parts = el.text.split(/(\{[A-Za-z_]\w*\})/).filter(Boolean);
      const v = (name: string) => spec.vars.find((x) => x.name === name);
      // Build the string like formatText: values with the variable's digits.
      out.push('{', '  char buf[96]; buf[0] = 0;');
      for (const p of parts) {
        const m = /^\{([A-Za-z_]\w*)\}$/.exec(p);
        const vv = m && v(m[1]);
        if (vv) out.push(`  { char num[24]; dtostrf(v_${ident(vv.name)}, 0, ${Math.max(0, Math.min(3, vv.digits))}, num); strncat(buf, num, sizeof(buf) - strlen(buf) - 1); }`);
        else out.push(`  strncat(buf, ${cstr(p)}, sizeof(buf) - strlen(buf) - 1);`);
      }
      const align = el.align === 'center' ? 1 : el.align === 'right' ? 2 : 0;
      if (el.font && spec.fonts?.some((f) => f.id === el.font)) out.push(`  bpGfxTextAligned(${el.x}, ${el.y}, buf, &F_${ident(el.font)}, ${Math.max(1, Math.round(el.size))}, ${col(el.color)}, ${align});`, '}');
      else out.push(`  bpTextAligned(${el.x}, ${el.y}, buf, ${Math.max(1, Math.round(el.size))}, ${col(el.color)}, ${align});`, '}');
      break;
    }
    case 'rect':
      out.push(`gfx.${el.fill ? 'fillRect' : 'drawRect'}(${el.x}, ${el.y}, ${el.w}, ${el.h}, ${col(el.color)});`);
      break;
    case 'line':
      out.push(`gfx.drawLine(${el.x}, ${el.y}, ${el.x2}, ${el.y2}, ${col(el.color)});`);
      break;
    case 'circle':
      out.push(`gfx.${el.fill ? 'fillCircle' : 'drawCircle'}(${el.x}, ${el.y}, ${el.r}, ${col(el.color)});`);
      break;
    case 'bar': {
      const f = `constrain((v_${ident(el.value)} - (${fl(el.min)})) / (${fl(el.max - el.min || 1)}), 0.0, 1.0)`;
      out.push(`gfx.drawRect(${el.x}, ${el.y}, ${el.w}, ${el.h}, ${col(el.color)});`);
      if (el.vertical) out.push(`{ int fill = lround(${el.h - 4} * ${f}); gfx.fillRect(${el.x + 2}, ${el.y + el.h - 2} - fill, ${el.w - 4}, fill, ${col(el.color)}); }`);
      else out.push(`gfx.fillRect(${el.x + 2}, ${el.y + 2}, lround(${el.w - 4} * ${f}), ${el.h - 4}, ${col(el.color)});`);
      break;
    }
    case 'graph': {
      const n = Math.max(2, el.w - 2);
      out.push(
        `gfx.drawRect(${el.x}, ${el.y}, ${el.w}, ${el.h}, ${col(el.color)});`,
        '{',
        `  long now = ms / ${GRAPH_STEP_MS}; int px = -1, py = -1;`,
        `  for (int i = 0; i < ${n}; i++) {`,
        `    long k = now - (${n - 1} - i); if (k < 0) continue;`,
        `    double f = constrain((sim_${ident(el.value)}(k * ${GRAPH_STEP_MS}UL) - (${fl(el.min)})) / (${fl(el.max - el.min || 1)}), 0.0, 1.0);`,
        `    int x = ${el.x + 1} + i, y = ${el.y + el.h - 2} - lround(f * ${el.h - 3});`,
        `    if (px >= 0) gfx.drawLine(px, py, x, y, ${col(el.color)});`,
        '    px = x; py = y;',
        '  }',
        '}',
      );
      break;
    }
    case 'gauge': {
      const v = `v_${ident(el.value)}`;
      out.push(
        '{',
        `  for (int i = 0; i <= ${el.ticks}; i++) {`,
        `    double deg = ${el.ticks ? `${fl(el.startDeg)} + (${fl(el.endDeg - el.startDeg)} * i) / ${el.ticks}` : fl(el.startDeg)};`,
        `    int x0, y0, x1, y1; bpAt(${el.x}, ${el.y}, deg, ${Math.floor((el.r * 85) / 100)}, x0, y0); bpAt(${el.x}, ${el.y}, deg, ${el.r}, x1, y1);`,
        `    gfx.drawLine(x0, y0, x1, y1, ${col(el.color)});`,
        '  }',
        `  double f = constrain((${v} - (${fl(el.min)})) / (${fl(el.max - el.min || 1)}), 0.0, 1.0);`,
        `  int nx, ny; bpAt(${el.x}, ${el.y}, ${fl(el.startDeg)} + (${fl(el.endDeg - el.startDeg)}) * f, ${el.r - 6 > 2 ? el.r - 6 : 2}, nx, ny);`,
        `  gfx.drawLine(${el.x}, ${el.y}, nx, ny, ${col(el.color)});`,
        `  gfx.fillCircle(${el.x}, ${el.y}, ${el.r >= 20 ? 3 : 1}, ${col(el.color)});`,
        '}',
      );
      break;
    }
    case 'icon':
      out.push(`bpIcon(${el.x}, ${el.y}, ICON_${el.name.toUpperCase()}, ${Math.max(1, Math.round(el.scale))}, ${col(el.color)});`);
      break;
    case 'bitmap': {
      const bm = spec.bitmaps?.find((b) => b.id === el.bitmap);
      if (!bm) break;
      const s = Math.max(1, Math.round(el.scale));
      if (bm.format === 'mono') out.push(`bpBitmapMono(${el.x}, ${el.y}, BM_${ident(bm.id)}, ${bm.w}, ${bm.h}, ${s}, ${col(el.color)});`);
      else out.push(`bpBitmap565(${el.x}, ${el.y}, BM_${ident(bm.id)}, ${bm.w}, ${bm.h}, ${s});`);
      break;
    }
    case 'button': {
      if (el.hidden) break;  // a hit region draws nothing
      if (el.fill.trim()) out.push(`gfx.fillRect(${el.x}, ${el.y}, ${el.w}, ${el.h}, ${col(el.fill)});`);
      out.push(`gfx.drawRect(${el.x}, ${el.y}, ${el.w}, ${el.h}, ${col(el.color)});`);
      if (el.label) {
        const [lx, ly] = buttonLabelAt(el);
        out.push(`bpText(${lx}, ${ly}, ${cstr(el.label)}, ${Math.max(1, Math.round(el.size))}, ${col(el.color)});`);
      }
      break;
    }
    case 'pattern': {
      const colors = (el.colors.length ? el.colors : el.kind === 'colorbars' ? COLOR_BARS : ['#FFFFFF', '#000000']).map(col);
      const rainbow = el.kind === 'gradient' && panel.color === 'rgb565' && el.colors.length < 2;
      const grad = [parseColor(colors.length ? (el.colors[0] ?? '#FFFFFF') : '#FFFFFF'), parseColor(el.colors[1] ?? el.colors[0] ?? '#000000')];
      out.push(
        '{',
        `  static const uint16_t pc[] = {${colors.join(', ')}};`,
        `  bpPattern(${['colorbars', 'checker', 'gradient', 'grid', 'stripes', 'scroll', 'rings', 'bounce', 'fill'].indexOf(el.kind)}, ${el.x}, ${el.y}, ${el.w}, ${el.h}, ${Math.max(1, Math.round(el.size))}, (long)((ms * ${Math.round(el.speed)}L) / 1000), ms, pc, ${colors.length}, ${rainbow ? 'true' : 'false'}, ${grad[0].join(', ')}, ${grad[1].join(', ')});`,
        '}',
      );
      break;
    }
  }
  const guard: string[] = [];
  if (el.visibleIf.trim()) guard.push(condC(el.visibleIf));
  if (el.blinkMs > 0) guard.push(`((ms / ${el.blinkMs}UL) % 2 == 0)`);
  return guard.length ? [`if (${guard.join(' && ')}) {`, ...out.map((l) => `  ${l}`), '}'] : out;
}

/* ---------------- libraries: Adafruit GFX (default), LovyanGFX and TFT_eSPI ---------------- */

export type DisplayLibrary = 'adafruit' | 'lovyangfx' | 'tft_espi' | 'lvgl';
/** sketch: one file with setup() and loop(). module: display_screens.h/.cpp with display_init() and display_update(), to add to your own sketch. */
export type DisplayOutput = 'sketch' | 'module';
export const DISPLAY_LIBRARIES: DisplayLibrary[] = ['adafruit', 'lovyangfx', 'tft_espi', 'lvgl'];

export interface DisplayFile {
  name: string;
  text: string;
}

const LIB_INFO: Record<DisplayLibrary, { name: string; libraries: string[] }> = {
  adafruit: { name: 'Adafruit GFX', libraries: [] },
  lovyangfx: { name: 'LovyanGFX', libraries: ['LovyanGFX'] },
  tft_espi: { name: 'TFT_eSPI', libraries: ['TFT_eSPI'] },
  lvgl: { name: 'LVGL', libraries: ['lvgl', 'LovyanGFX'] },
};

/** The name shown for a library in the app. */
export const libraryName = (lib: DisplayLibrary) => LIB_INFO[lib].name;

/** Colour SPI controllers LovyanGFX (Panel_xxx) and TFT_eSPI (xxx_DRIVER in User_Setup.h) both drive. */
const GFX_PANELS: Record<string, { lgfx: string; tftEspi: string }> = {
  ST7789: { lgfx: 'Panel_ST7789', tftEspi: 'ST7789_DRIVER' },
  ST7735: { lgfx: 'Panel_ST7735S', tftEspi: 'ST7735_DRIVER' },
  ILI9341: { lgfx: 'Panel_ILI9341', tftEspi: 'ILI9341_DRIVER' },
  ILI9488: { lgfx: 'Panel_ILI9488', tftEspi: 'ILI9488_DRIVER' },
  ST7796: { lgfx: 'Panel_ST7796', tftEspi: 'ST7796_DRIVER' },
  GC9A01: { lgfx: 'Panel_GC9A01', tftEspi: 'GC9A01_DRIVER' },
};

/** The libraries that can drive this display on this board, best default first. */
export function availableLibraries(panel: PanelInfo, board?: BoardDef): DisplayLibrary[] {
  const out: DisplayLibrary[] = [];
  if (DRIVERS[panel.controller]) out.push('adafruit');
  if (panel.color === 'rgb565' && GFX_PANELS[panel.controller]) {
    const fam: string = board?.family ?? 'esp32';
    // LovyanGFX: ESP32 family (its SPI host setting below). TFT_eSPI: ESP32 and RP2040/RP2350.
    if (fam.startsWith('esp32')) out.push('lovyangfx');
    if (fam.startsWith('esp32') || fam === 'rp2040' || fam === 'rp2350') out.push('tft_espi');
    // LVGL 8 with LovyanGFX as the driver: the ESP32 and ESP32-S3 (enough RAM for LVGL's pool and two strips).
    if (fam === 'esp32' || fam === 'esp32s3') out.push('lvgl');
  }
  return out;
}

const SUPPORTED_LIST = 'SSD1306, SH1106, ST7789, ST7735, ST7796, ILI9341, ILI9488, GC9A01';

/** What a library needs from the generator, filled by `targetFor`. */
interface Target {
  libraries: string[];
  include: string[];
  /** declarations before the drawing code; `canvas` adds the RAM frame */
  decl: (canvas: boolean) => string[];
  /** lines of setup() before setRotation */
  begin: string[];
  /** lines of setup() after setRotation */
  afterRotation: (canvas: boolean) => string[];
  push: (canvas: boolean) => string;
  /** LovyanGFX and TFT_eSPI set their own SPI pins; for Adafruit the sketch calls SPI.begin() */
  ownsPins: boolean;
  mono: boolean;
  bus: 'i2c' | 'spi';
  files: DisplayFile[];
  notes: string[];
}

function userSetupH(panel: PanelInfo, p: Pins, family: string): string {
  const entry = GFX_PANELS[panel.controller];
  const w = Math.min(panel.widthPx, panel.heightPx);
  const h = Math.max(panel.widthPx, panel.heightPx);
  const pin = (name: string, v: string) => (v === '-1' ? `// #define ${name} -1  (not wired)` : `#define ${name} ${v}`);
  return [
    '// User_Setup.h for TFT_eSPI, written by BoardPilot from the pins in your drawing.',
    '// Put this file in the TFT_eSPI library folder, replacing its User_Setup.h',
    '// (Documents/Arduino/libraries/TFT_eSPI), and keep User_Setup_Select.h pointing at <User_Setup.h>.',
    '// With PlatformIO you can pass the same lines as -D build flags instead.',
    '',
    `#define ${entry.tftEspi}`,
    ...(panel.controller === 'ST7735'
      ? [w === 80 ? '#define ST7735_GREENTAB160x80  // 0.96" 80x160 module' : '#define ST7735_BLACKTAB  // try ST7735_GREENTAB if the colours or edges look wrong']
      : []),
    `#define TFT_WIDTH ${w}`,
    `#define TFT_HEIGHT ${h}`,
    '',
    pin('TFT_MOSI', p.mosi),
    pin('TFT_SCLK', p.sck),
    pin('TFT_CS', p.cs),
    pin('TFT_DC', p.dc),
    pin('TFT_RST', p.rst),
    ...(p.miso !== '-1' ? [pin('TFT_MISO', p.miso)] : []),
    ...(family === 'rp2040' || family === 'rp2350' ? ['// The RP2040/RP2350 pins must belong to the same SPI unit (SPI0 or SPI1).'] : []),
    '',
    '#define LOAD_GLCD  // the library needs one font loaded; the drawing uses its own 5x7 font',
    `#define SPI_FREQUENCY ${panel.controller === 'ILI9488' ? '20000000' : '40000000'}`,
    '',
  ].join('\n');
}

const NO_FRAME = 'for (;;) delay(100);  // not enough free RAM for the frame: set canvas off, or use a smaller screen';

function targetFor(lib: DisplayLibrary, panel: PanelInfo, p: Pins, board: BoardDef, W: number, H: number, driver: Driver | undefined): Target {
  const notes: string[] = [];
  if (lib === 'adafruit') {
    const d = driver!;
    const s = d.setup(p, panel);
    return {
      libraries: d.libraries,
      include: d.include,
      decl: (canvas) => [s.decl, canvas ? `GFXcanvas16 gfx(${W}, ${H});  // the frame, drawn in RAM then sent in one go` : 'Adafruit_GFX &gfx = tft;'],
      begin: s.begin,
      afterRotation: () => [],
      push: (canvas) => (d.mono ? 'tft.display();  // send the frame to the OLED' : canvas ? `tft.drawRGBBitmap(0, 0, gfx.getBuffer(), ${W}, ${H});  // send the frame` : 'delay(1);'),
      ownsPins: false,
      mono: d.mono,
      bus: d.bus,
      files: [],
      notes,
    };
  }
  const entry = GFX_PANELS[panel.controller];
  notes.push(t('LovyanGFX and TFT_eSPI draw lines and circles with their own algorithms, so a shape can differ from the preview by a pixel here and there.'));
  // A frame that fits only in external PSRAM (board.psramBytes): LovyanGFX is told to keep the sprite there.
  const inPsram = lib === 'lovyangfx' && (board.ramBytes ?? 0) < W * H * 4 + 32 * 1024 && (board.psramBytes ?? 0) >= W * H * 2 + 64 * 1024;
  const frame = (canvas: boolean) => (canvas ? [...(inPsram ? ['  gfx.setPsram(true);  // the frame goes to PSRAM'] : []), '  gfx.setColorDepth(16);', `  if (!gfx.createSprite(${W}, ${H})) {`, `    ${NO_FRAME}`, '  }'] : []);
  const push = (canvas: boolean) => (canvas ? 'gfx.pushSprite(0, 0);  // send the frame' : 'delay(1);');
  if (lib === 'lovyangfx') {
    // The controller's own (portrait) size; ST7735 80x160 modules usually also need an offset.
    const nw = Math.min(panel.widthPx, panel.heightPx);
    const nh = Math.max(panel.widthPx, panel.heightPx);
    // Adafruit's ST7789 and GC9A01A drivers switch inversion on; LovyanGFX leaves it to the config.
    const invert = panel.controller === 'ST7789' || panel.controller === 'GC9A01';
    if (panel.controller === 'ST7735' && nw === 80) notes.push(t('Some 0.96" 80x160 modules need cfg.offset_x and cfg.offset_y in the LGFX class to centre the picture.'));
    return {
      libraries: LIB_INFO.lovyangfx.libraries,
      include: ['#define LGFX_USE_V1', '#include <LovyanGFX.hpp>'],
      decl: (canvas) => [
        'class LGFX : public lgfx::LGFX_Device {',
        `  lgfx::${entry.lgfx} _panel;`,
        '  lgfx::Bus_SPI _bus;',
        ' public:',
        '  LGFX() {',
        '    {',
        '      auto cfg = _bus.config();',
        `      cfg.spi_host = ${board.family === 'esp32' ? 'VSPI_HOST' : 'SPI2_HOST'};`,
        '      cfg.spi_mode = 0;',
        `      cfg.freq_write = ${panel.controller === 'ILI9488' ? '20000000' : '40000000'};`,
        '      cfg.freq_read = 16000000;',
        '      cfg.spi_3wire = false;',
        '      cfg.use_lock = true;',
        '      cfg.dma_channel = SPI_DMA_CH_AUTO;',
        `      cfg.pin_sclk = ${p.sck};  // the pins in your drawing`,
        `      cfg.pin_mosi = ${p.mosi};`,
        `      cfg.pin_miso = ${p.miso};`,
        `      cfg.pin_dc = ${p.dc};`,
        '      _bus.config(cfg);',
        '      _panel.setBus(&_bus);',
        '    }',
        '    {',
        '      auto cfg = _panel.config();',
        `      cfg.pin_cs = ${p.cs};`,
        `      cfg.pin_rst = ${p.rst};`,
        '      cfg.pin_busy = -1;',
        `      cfg.panel_width = ${nw};  // the controller's own (portrait) size`,
        `      cfg.panel_height = ${nh};`,
        '      cfg.offset_x = 0;',
        '      cfg.offset_y = 0;',
        '      cfg.offset_rotation = 0;',
        '      cfg.readable = false;',
        `      cfg.invert = ${invert};  // flip it if the colours look negative`,
        '      cfg.rgb_order = false;  // true if red and blue are swapped',
        '      cfg.dlen_16bit = false;',
        '      cfg.bus_shared = true;',
        '      _panel.config(cfg);',
        '    }',
        '    setPanel(&_panel);',
        '  }',
        '};',
        '',
        'LGFX tft;',
        canvas ? 'lgfx::LGFX_Sprite gfx(&tft);  // the frame, drawn in RAM then sent in one go' : 'LGFX &gfx = tft;',
      ],
      begin: ['  tft.init();'],
      afterRotation: frame,
      push,
      ownsPins: true,
      mono: false,
      bus: 'spi',
      files: [],
      notes,
    };
  }
  notes.push(t('TFT_eSPI reads its pins from User_Setup.h: copy the generated file into the TFT_eSPI library folder before you build.'));
  if (board.family !== 'esp32') notes.push(t('TFT_eSPI supports newer chips only in its latest versions. If the build fails on this board, try LovyanGFX.'));
  return {
    libraries: LIB_INFO.tft_espi.libraries,
    include: ['#include <SPI.h>', '#include <TFT_eSPI.h>  // reads its pins and driver from User_Setup.h'],
    decl: (canvas) => ['TFT_eSPI tft = TFT_eSPI();', canvas ? 'TFT_eSprite gfx = TFT_eSprite(&tft);  // the frame, drawn in RAM then sent in one go' : 'TFT_eSPI &gfx = tft;'],
    begin: ['  tft.init();'],
    afterRotation: frame,
    push,
    ownsPins: true,
    mono: false,
    bus: 'spi',
    files: [{ name: 'User_Setup.h', text: userSetupH(panel, p, board.family) }],
    notes,
  };
}

/** Hex bytes, 16 to a line. */
function byteLines(bytes: number[], indent = '  '): string[] {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) out.push(`${indent}${bytes.slice(i, i + 16).map((b) => hex(b)).join(', ')},`);
  return out;
}

/** Pictures and fonts the drawing uses, as PROGMEM arrays with the small routines that draw them. */
function assetCode(spec: DisplaySpec, panel: PanelInfo): string[] {
  const out: string[] = [];
  const usedBitmaps = (spec.bitmaps ?? []).filter((b) => spec.screens.some((sc) => sc.elements.some((e) => e.type === 'bitmap' && e.bitmap === b.id)));
  const usedFonts = (spec.fonts ?? []).filter((f) => spec.screens.some((sc) => sc.elements.some((e) => e.type === 'text' && e.font === f.id)));
  if (usedBitmaps.length) {
    out.push('// Pictures imported in Display Studio, in flash (PROGMEM). Mono: rows of bytes, bit 7 = left. Colour: RGB565 words.');
    for (const bm of usedBitmaps) {
      const bytes = dataOf(bm);
      if (bm.format === 'mono') out.push(`static const uint8_t BM_${ident(bm.id)}[] PROGMEM = {  // ${bm.w}x${bm.h}, ${bytes.length} bytes`, ...byteLines(bytes), '};');
      else {
        const words: number[] = [];
        for (let i = 0; i + 1 < bytes.length; i += 2) words.push((bytes[i] << 8) | bytes[i + 1]);
        out.push(`static const uint16_t BM_${ident(bm.id)}[] PROGMEM = {  // ${bm.w}x${bm.h}, ${bytes.length} bytes`);
        for (let i = 0; i < words.length; i += 12) out.push(`  ${words.slice(i, i + 12).map((w) => hex(w, 4)).join(', ')},`);
        out.push('};');
      }
    }
    if (usedBitmaps.some((b) => b.format === 'mono'))
      out.push(
        'void bpBitmapMono(int x, int y, const uint8_t *bm, int w, int h, int s, uint16_t c) {',
        '  int rb = (w + 7) / 8;',
        '  for (int row = 0; row < h; row++) for (int col = 0; col < w; col++) if (pgm_read_byte(&bm[row * rb + (col >> 3)]) & (0x80 >> (col & 7))) gfx.fillRect(x + col * s, y + row * s, s, s, c);',
        '}',
      );
    if (usedBitmaps.some((b) => b.format === 'rgb565'))
      out.push(
        'void bpBitmap565(int x, int y, const uint16_t *bm, int w, int h, int s) {',
        '  for (int row = 0; row < h; row++) for (int col = 0; col < w; col++) {',
        '    uint16_t v = pgm_read_word(&bm[row * w + col]);',
        ...(panel.color === 'rgb565'
          ? ['    gfx.fillRect(x + col * s, y + row * s, s, s, v);']
          : ['    int r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;  // to the on/off pixel this panel shows', '    gfx.fillRect(x + col * s, y + row * s, s, s, bpColor((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)));']),
        '  }',
        '}',
      );
  }
  if (usedFonts.length) {
    out.push(
      '// Fonts imported in Display Studio (Adafruit GFX format). y is the baseline.',
      'struct BpGlyph { uint16_t off; uint8_t w, h, adv; int8_t xo, yo; };',
      'struct BpFont { const uint8_t *bm; const BpGlyph *gl; uint8_t first, last, yAdv; };',
    );
    for (const f of usedFonts) {
      const n = ident(f.id);
      out.push(`static const uint8_t F_${n}_BM[] PROGMEM = {  // ${f.name}`, ...byteLines(dataOf(f)), '};', `static const BpGlyph F_${n}_GL[] PROGMEM = {`);
      for (const g of f.glyphs) out.push(`  {${g.offset}, ${g.w}, ${g.h}, ${g.xAdvance}, ${g.xOffset}, ${g.yOffset}},`);
      out.push('};', `static const BpFont F_${n} = {F_${n}_BM, F_${n}_GL, ${f.first}, ${f.last}, ${f.yAdvance}};`);
    }
    out.push(
      'int bpFontWidth(const BpFont *f, const char *s, int n, int size) {',
      '  int w = 0;',
      '  for (int i = 0; i < n; i++) { uint8_t c = (uint8_t)s[i]; if (c >= f->first && c <= f->last) w += pgm_read_byte(&f->gl[c - f->first].adv) * size; }',
      '  return w;',
      '}',
      '',
      'void bpGfxText(int x, int y, const char *s, const BpFont *f, int size, uint16_t c) {',
      '  int cx = x;',
      '  for (; *s; s++) {',
      "    if (*s == '\n') { cx = x; y += size * f->yAdv; continue; }",
      '    uint8_t ch = (uint8_t)*s; if (ch < f->first || ch > f->last) continue;',
      '    const BpGlyph *g = &f->gl[ch - f->first];',
      '    uint16_t bo = pgm_read_word(&g->off); uint8_t gw = pgm_read_byte(&g->w), gh = pgm_read_byte(&g->h);',
      '    int xo = (int8_t)pgm_read_byte(&g->xo), yo = (int8_t)pgm_read_byte(&g->yo);',
      '    uint8_t bits = 0, bit = 0;',
      '    for (int yy = 0; yy < gh; yy++) for (int xx = 0; xx < gw; xx++) {',
      '      if (!(bit++ & 7)) bits = pgm_read_byte(&f->bm[bo++]);',
      '      if (bits & 0x80) gfx.fillRect(cx + (xo + xx) * size, y + (yo + yy) * size, size, size, c);',
      '      bits <<= 1;',
      '    }',
      '    cx += pgm_read_byte(&g->adv) * size;',
      '  }',
      '}',
      '',
      'void bpGfxTextAligned(int x, int y, const char *s, const BpFont *f, int size, uint16_t c, int align) {',
      '  char line[96];',
      '  while (*s) {',
      "    int n = 0; while (s[n] && s[n] != '\n' && n < 95) n++;",
      '    memcpy(line, s, n); line[n] = 0;',
      '    int w = bpFontWidth(f, line, n, size);',
      '    bpGfxText(align == 1 ? x - w / 2 : align == 2 ? x - w : x, y, line, f, size, c);',
      "    s += n; if (*s == '\n') s++;",
      '    y += size * f->yAdv;',
      '  }',
      '}',
      '',
    );
  }
  return out;
}

/**
 * The tap logic in C, the same as DisplaySim.tap: the topmost visible button under the finger runs its
 * actions, otherwise a "touch" change of screen from this screen applies. handleTouch() fires once per press.
 */
function touchLogic(spec: DisplaySpec, screenIdx: Map<string, number>, touchSet: Set<string>): string[] {
  const out: string[] = ['// Touch: one tap per press, on the topmost visible button under the finger (as in the app).', 'bool bpTap(int x, int y, unsigned long ms) {', '  readValues(ms);', '  switch (screen) {'];
  spec.screens.forEach((sc, i) => {
    const btns = sc.elements.filter((e): e is Extract<DisplayElement, { type: 'button' }> => e.type === 'button').reverse();
    const touchTr = spec.transitions.find((tr) => tr.touch && tr.from === sc.id && screenIdx.has(tr.to));
    if (!btns.length && !touchTr) return;
    out.push(`    case ${i}:  // ${sc.id}`);
    for (const el of btns) {
      const hit = `x >= ${el.x} && y >= ${el.y} && x < ${el.x + el.w} && y < ${el.y + el.h}`;
      const guard = el.visibleIf.trim() ? ` && ${condC(el.visibleIf)}` : '';
      const acts = el.actions.map((a) => {
        if (a.do === 'screen') return screenIdx.has(a.screen) ? `screen = ${screenIdx.get(a.screen)}; enteredAt = ms;` : '';
        if (!touchSet.has(a.var)) return '';
        const n = ident(a.var);
        return a.do === 'set' ? `t_${n} = ${fl(a.value)}; t_${n}_set = true; v_${n} = t_${n};` : `t_${n} = (v_${n} != 0) ? 0 : 1; t_${n}_set = true; v_${n} = t_${n};`;
      });
      out.push(`      if (${hit}${guard}) { ${acts.filter(Boolean).join(' ')} return true; }`);
    }
    if (touchTr) out.push(`      screen = ${screenIdx.get(touchTr.to)}; enteredAt = ms; return true;`);
    else out.push('      break;');
  });
  out.push('  }', '  return false;', '}', '', 'bool touchDown = false;', 'void handleTouch(unsigned long ms) {', '  int x = 0, y = 0;', '  bool down = bpTouchRead(x, y);', '  if (down && !touchDown) bpTap(x, y, ms);', '  touchDown = down;', '}');
  return out;
}

/** The sketch (or module) for a spec on a display part in the scene. */
export function generateDisplayCode(
  spec: DisplaySpec,
  panel: PanelInfo,
  def: PartDef,
  scene: Scene,
  board: BoardDef,
  /** host: the drawing code only, on a GFXcanvas in RAM, for the native pixel test (tests/display.test.ts) */
  opts: { host?: boolean; library?: DisplayLibrary; output?: DisplayOutput } = {},
): DisplayCode {
  const notes: string[] = [];
  const driver = DRIVERS[panel.controller];
  const avail = availableLibraries(panel, board);
  if (!avail.length && !opts.host) {
    return {
      code: '',
      libraries: [],
      notes: [
        GFX_PANELS[panel.controller] && panel.color === 'rgb565'
          ? t('The {controller} needs LovyanGFX or TFT_eSPI, which BoardPilot writes for ESP32 boards (TFT_eSPI also for RP2040 and RP2350). This board is not one of them.', { controller: panel.controller })
          : t('The preview works for the {controller}, but BoardPilot cannot write its code yet (supported: {list}).', { controller: panel.controller, list: SUPPORTED_LIST }),
      ],
    };
  }
  const requested = opts.library ?? 'adafruit';
  const lib: DisplayLibrary = opts.host ? 'adafruit' : avail.includes(requested) ? requested : avail[0];
  if (!opts.host && lib !== requested) {
    notes.push(t('There is no {wanted} driver for the {controller} on this board, so the code uses {used} instead.', { wanted: LIB_INFO[requested].name, controller: panel.controller, used: LIB_INFO[lib].name }));
  }
  const output: DisplayOutput = opts.output ?? 'sketch';
  const pinOfPart = (partInstId: string, partDef: PartDef, names: string[]): string => {
    for (const n of names) {
      const pp = partDef.pins.find((x) => x.name.toUpperCase() === n);
      if (!pp) continue;
      const bp = boardPinFor(scene, partInstId, pp.name);
      const p = bp ? pinById(board, bp) : undefined;
      if (p) return codePinName(board, p);
    }
    return '-1';
  };
  const pinOf = (...names: string[]): string => pinOfPart(spec.part, def, names);
  const pins: Pins = {
    cs: pinOf('CS'),
    dc: pinOf('DC', 'A0', 'RS', 'DC/RS'),
    rst: pinOf('RST', 'RES', 'RESET'),
    mosi: pinOf('SDA', 'MOSI', 'SDI(MOSI)', 'DIN'),
    miso: pinOf('MISO', 'SDO(MISO)', 'SDO'),
    sck: pinOf('SCL', 'SCK', 'CLK'),
    addr: (def.addresses?.[0] ?? '0x3C').toUpperCase().replace('0X', '0x'),
    spi: def.bus === 'spi',
  };
  const [W, H] = rotatedSize(panel, spec.rotation);
  // TFT controllers are portrait; a module that mounts one landscape (0.96" ST7735: 160 x 80) turns it
  // a quarter so rotation 0 is the module as drawn in BoardPilot.
  const quarter = panel.color === 'rgb565' && panel.widthPx > panel.heightPx ? 1 : 0;
  const lv = lib === 'lvgl' && !opts.host;
  const baseTarget = opts.host ? undefined : targetFor(lv ? 'lovyangfx' : lib, panel, pins, board, W, H, driver);
  // LVGL: LovyanGFX drives the panel (its class and init), LVGL draws; no RAM frame, LVGL has its own strips.
  const target: Target | undefined =
    baseTarget && lv
      ? {
          ...baseTarget,
          libraries: LIB_INFO.lvgl.libraries,
          include: [...baseTarget.include, '#include <lvgl.h>'],
          decl: () => baseTarget.decl(false).filter((l) => !l.startsWith('LGFX &gfx')),
          afterRotation: () => [],
          notes: [],
          files: [{ name: 'lv_conf.h', text: lvConfH() }],
        }
      : baseTarget;
  const bus = target?.bus === 'i2c' && pins.spi ? 'spi' : target?.bus;
  if (bus === 'spi') {
    if (pins.dc === '-1') notes.push(t('The display’s DC pin is not wired: wire it, then generate the code again.'));
    if (pins.rst === '-1') notes.push(t('RST is not wired: the code uses -1 (no reset pin). Tie RST high or wire it to a free pin.'));
  }
  const bytes = W * H * 2;
  // External PSRAM counts for the frame (the ESP32 core puts big allocations there once PSRAM is switched on in the Tools menu).
  const bigRam = (board.ramBytes ?? 0) >= bytes * 2 + 32 * 1024;
  const psramRam = !bigRam && (board.psramBytes ?? 0) >= bytes + 64 * 1024;
  const mono = panel.color !== 'rgb565';
  // Colour panels draw into a RAM canvas and send whole frames (no flicker) when the chip has the RAM.
  const canvas = !mono && (bigRam || psramRam) && !lv;
  if (!opts.host && !mono && !canvas && !lv) notes.push(t('This board has too little RAM for a full-screen frame buffer ({kb} KB), so the code draws straight to the display: fast animations will flicker.', { kb: Math.round(bytes / 1024) }));
  if (target) notes.push(...target.notes);
  if (!opts.host && canvas && psramRam) notes.push(t('The frame ({kb} KB) is kept in PSRAM: switch PSRAM on in the board settings (Arduino IDE: Tools > PSRAM) before you build.', { kb: Math.round(bytes / 1024) }));
  // LovyanGFX and TFT_eSPI read a bare number as a colour in their own way: pass typed RGB565 values.
  const typed = lib !== 'adafruit' && !opts.host;
  const asModule = output === 'module' && !opts.host;

  const L: string[] = [];
  const screenIdx = new Map(spec.screens.map((s, i) => [s.id, i]));
  // Touch: the values a tap sets, whether the drawing reacts to touch at all, and which touch controller is wired.
  const buttons = spec.screens.flatMap((sc) => sc.elements.filter((e): e is Extract<DisplayElement, { type: 'button' }> => e.type === 'button'));
  const touchSet = new Set(buttons.flatMap((b) => b.actions.flatMap((a) => (a.do === 'screen' ? [] : [a.var]))).filter((n) => spec.vars.some((v) => v.name === n)));
  const hasTouchUi = buttons.length > 0 || spec.transitions.some((tr) => tr.touch);
  const touchPartDef = (id: string): PartDef | undefined => PARTS[id];
  const touchInst = scene.parts.find((p) => TOUCH_PARTS[p.partId]);
  const touchDef = touchInst ? touchPartDef(touchInst.partId) : undefined;
  let touch: TouchCode | undefined;
  if (!opts.host && hasTouchUi) {
    if (touchInst && touchDef) {
      const tp = (...names: string[]) => pinOfPart(touchInst.id, touchDef, names);
      touch = touchCode(TOUCH_PARTS[touchInst.partId], panel, { cs: tp('T_CS', 'CS'), irq: tp('T_IRQ', 'IRQ'), sda: tp('SDA'), scl: tp('SCL'), int: tp('INT'), rst: tp('RST') }, W, H, (spec.rotation + quarter) & 3, bus === 'i2c');
      notes.push(...touch.notes);
    } else notes.push(t('The drawing has buttons but no touch controller is wired. Add an XPT2046, FT6236 or GT911 touch part to the project; until then the code only has an empty touch read to fill in.'));
  }
  L.push(
    `// ${spec.title} — Display Studio ${asModule ? 'module' : 'sketch'} for ${def.name} on ${board.name}`,
    '// Written by BoardPilot. The preview in the app shows the same pixels (same font, shapes and',
    '// pattern maths). Values are simulated like in the app; replace the lines marked TODO with your sensors.',
  );
  if (target) {
    L.push(`// Libraries (Arduino Library Manager): ${[...target.libraries, ...(touch?.libraries ?? [])].join(', ')}`, '');
    if (asModule) L.push('#include <Arduino.h>', '#include "display_screens.h"');
    L.push(...target.include, ...(touch ? touch.include.filter((l) => !target.include.includes(l)) : []), ...(bus === 'spi' && lib === 'adafruit' && !target.include.includes('#include <SPI.h>') ? ['#include <SPI.h>'] : []));
  }
  L.push('');
  if (opts.host) L.push('#include "Adafruit_GFX.h"', mono ? `GFXcanvas1 gfx(${W}, ${H});` : `GFXcanvas16 gfx(${W}, ${H});`);
  else L.push(...target!.decl(canvas));
  L.push('');
  if (!lv) {
  // Font and icons.
  L.push('// 5x7 font, codes 32-127 (127 = °), 5 column bytes per glyph, bit 0 = top row.');
  L.push('static const uint8_t FONT5X7[] PROGMEM = {');
  for (let i = 0; i < FONT_5X7.length; i += 20) L.push(`  ${FONT_5X7.slice(i, i + 20).map((b) => hex(b)).join(', ')},`);
  L.push('};');
  const icons = [...new Set(spec.screens.flatMap((s) => s.elements.filter((e) => e.type === 'icon').map((e) => (e as Extract<DisplayElement, { type: 'icon' }>).name)))];
  for (const name of icons) L.push(`static const uint8_t ICON_${name.toUpperCase()}[8] PROGMEM = {${ICON_BITS[name].map((b) => hex(b)).join(', ')}};`);
  L.push(
    '',
    'void bpText(int x, int y, const char *s, int size, uint16_t c) {',
    '  int cx = x;',
    '  for (; *s; s++) {',
    "    if (*s == '\\n') { cx = x; y += 8 * size; continue; }",
    '    uint8_t ch = (uint8_t)*s; if (ch < 32 || ch > 127) ch = 63;',
    '    for (int col = 0; col < 5; col++) {',
    '      uint8_t bits = pgm_read_byte(&FONT5X7[(ch - 32) * 5 + col]);',
    '      for (int row = 0; row < 7; row++) if (bits & (1 << row)) gfx.fillRect(cx + col * size, y + row * size, size, size, c);',
    '    }',
    '    cx += 6 * size;',
    '  }',
    '}',
    '',
    '// align: 0 left, 1 centre, 2 right (of x), one line at a time like the app.',
    'void bpTextAligned(int x, int y, const char *s, int size, uint16_t c, int align) {',
    '  char line[96];',
    '  while (*s) {',
    "    int n = 0; while (s[n] && s[n] != '\\n' && n < 95) n++;",
    '    memcpy(line, s, n); line[n] = 0;',
    '    int w = n * 6 * size - size;',
    '    int x0 = align == 1 ? x - (w >= 0 ? w / 2 : -((-w + 1) / 2)) : align == 2 ? x - w : x;',
    '    bpText(x0, y, line, size, c);',
    "    s += n; if (*s == '\\n') s++;",
    '    y += 8 * size;',
    '  }',
    '}',
    '',
    'void bpIcon(int x, int y, const uint8_t *bits, int s, uint16_t c) {',
    '  for (int row = 0; row < 8; row++) {',
    '    uint8_t b = pgm_read_byte(&bits[row]);',
    '    for (int col = 0; col < 8; col++) if (b & (0x80 >> col)) gfx.fillRect(x + col * s, y + row * s, s, s, c);',
    '  }',
    '}',
    '',
    'double bpHash01(uint32_t n) {  // the same pseudo-random numbers as the app',
    '  uint32_t x = (n * 0x9E3779B1u) ^ 0x5BD1E995u;',
    '  x = (x ^ (x >> 15)) * 0x2C1B3C6Du;',
    '  x = (x ^ (x >> 12)) * 0x297A2D39u;',
    '  return (double)(x ^ (x >> 15)) / 4294967296.0;',
    '}',
    '',
    `uint16_t bpColor(uint8_t r, uint8_t g, uint8_t b) {${panel.color === 'rgb565' ? ' return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3); }' : ' return (r * 3 + g * 6 + b) / 10 >= 128 ? 1 : 0; }'}`,
    '',
    'void bpHue(int h, uint8_t &r, uint8_t &g, uint8_t &b) {  // integer hue 0-255, as in the app',
    '  h &= 255; int seg = h / 43, f = (h - seg * 43) * 6, q = 255 - f;',
    '  switch (seg) { case 0: r = 255; g = f; b = 0; break; case 1: r = q; g = 255; b = 0; break; case 2: r = 0; g = 255; b = f; break;',
    '    case 3: r = 0; g = q; b = 255; break; case 4: r = f; g = 0; b = 255; break; default: r = 255; g = 0; b = q; }',
    '}',
    '',
    'long bpMod(long a, long m) { return ((a % m) + m) % m; }',
    '// A point on a dial: degrees clockwise from 12 o\'clock, rounded like the app (floor(x + 0.5)).',
    'void bpAt(int cx, int cy, double deg, int len, int &x, int &y) {',
    '  double rad = deg * PI / 180.0;',
    '  x = cx + (int)floor(sin(rad) * len + 0.5);',
    '  y = cy - (int)floor(cos(rad) * len + 0.5);',
    '}',
    'long bpTri(long p, long len) { return len <= 0 ? 0 : len - labs(bpMod(p, 2 * len) - len); }',
    '',
    '// Test patterns: 0 colour bars, 1 checker, 2 gradient, 3 grid, 4 stripes, 5 scroll, 6 rings, 7 bounce, 8 fill.',
    'void bpPattern(int kind, int x, int y, int w, int h, int size, long off, unsigned long ms, const uint16_t *pc, int n, bool rainbow,',
    '               uint8_t r0, uint8_t g0, uint8_t b0, uint8_t r1, uint8_t g1, uint8_t b1) {',
    '  switch (kind) {',
    '    case 0: for (int i = 0; i < w; i++) gfx.drawFastVLine(x + i, y, h, pc[bpMod(i + off, w) * n / w]); break;',
    '    case 1: for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) gfx.drawPixel(x + i, y + j, pc[((i + off) / size + j / size) % 2 == 0 ? 0 : 1 % n]); break;',
    '    case 2: for (int i = 0; i < w; i++) {',
    '      long p = bpMod(i + off, w) * 255 / (w > 1 ? w - 1 : 1); uint8_t r, g, b;',
    '      if (rainbow) bpHue(p, r, g, b); else { r = r0 + ((r1 - r0) * p) / 255; g = g0 + ((g1 - g0) * p) / 255; b = b0 + ((b1 - b0) * p) / 255; }',
    '      gfx.drawFastVLine(x + i, y, h, bpColor(r, g, b)); } break;',
    '    case 3: gfx.fillRect(x, y, w, h, pc[1 % n]);',
    '      for (int i = 0; i < w; i++) if ((i + off) % size == 0) gfx.drawFastVLine(x + i, y, h, pc[0]);',
    '      for (int j = 0; j < h; j++) if (j % size == 0) gfx.drawFastHLine(x, y + j, w, pc[0]); break;',
    '    case 4: for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) gfx.drawPixel(x + i, y + j, pc[(bpMod(i + j + off, 2 * size) / size) % n]); break;',
    '    case 5: for (int j = 0; j < h; j++) gfx.drawFastHLine(x, y + j, w, pc[(bpMod(j + off, 2 * size) / size) % n]); break;',
    '    case 6: { gfx.fillRect(x, y, w, h, pc[1 % n]); int cx = x + w / 2, cy = y + h / 2, maxR = min(w, h) / 2 - 1;',
    '      for (int r = off % size; r <= maxR; r += size) if (r > 0) gfx.drawCircle(cx, cy, r, pc[0]); } break;',
    '    case 7: { gfx.fillRect(x, y, w, h, pc[1 % n]);',
    '      int bx = x + size + bpTri(off, w - 1 - 2 * size), by = y + size + bpTri(off * 7 / 10, h - 1 - 2 * size);',
    '      gfx.fillCircle(bx, by, size, pc[0]); } break;',
    '    case 8: { long period = size * 100 > 100 ? size * 100 : 100; gfx.fillRect(x, y, w, h, pc[(ms / period) % n]); } break;',
    '  }',
    '}',
    '',
    ...assetCode(spec, panel),
  );
  }
  L.push(
    ...varFunction(spec),
    '',
    `int screen = ${screenIdx.get(spec.start) ?? 0};  // ${spec.screens.map((s, i) => `${i} ${s.id}`).join(', ')}`,
    'unsigned long enteredAt = 0;',
    'unsigned long t0 = 0;',
    ...spec.vars.map((v) => `double v_${ident(v.name)} = 0;`),
    ...[...touchSet].map((n) => `double t_${ident(n)} = 0; bool t_${ident(n)}_set = false;  // set by a tap on a button`),
    '',
    'void readValues(unsigned long ms) {',
    ...spec.vars.map((v) => (touchSet.has(v.name) ? `  v_${ident(v.name)} = t_${ident(v.name)}_set ? t_${ident(v.name)} : sim_${ident(v.name)}(ms);${v.from ? `  // TODO: ${v.from}` : ''}` : `  v_${ident(v.name)} = sim_${ident(v.name)}(ms);${v.from ? `  // TODO: ${v.from}` : ''}`)),
    '}',
    '',
    'void changeScreens(unsigned long ms) {',
    '  for (int guard = 0; guard < 16; guard++) {',
    '    readValues(ms);',
    '    int next = -1; unsigned long at = ms;',
  );
  spec.transitions.forEach((tr, i) => {
    const from = screenIdx.get(tr.from);
    const to = screenIdx.get(tr.to);
    if (from === undefined || to === undefined) return;
    const timed = tr.afterMs > 0 ? `ms - enteredAt >= ${tr.afterMs}UL` : 'false';
    const when = tr.when.trim() ? condC(tr.when) : 'false';
    L.push(`    ${i ? 'else ' : ''}if (screen == ${from} && (${timed} || ${when})) { next = ${to}; at = (${tr.afterMs > 0 ? 'true' : 'false'} && !(${when})) ? enteredAt + ${tr.afterMs}UL : ms; }`);
  });
  L.push('    if (next < 0 || next == screen) return;', '    screen = next; enteredAt = at;', '  }', '}', '');
  if (hasTouchUi && !opts.host) L.push(...(touch ? touch.decl : NO_TOUCH_CODE), '', ...(lv ? [] : [...touchLogic(spec, screenIdx, touchSet), '']));
  let lvgl: ReturnType<typeof lvglParts> | undefined;
  if (lv) {
    lvgl = lvglParts({ spec, panel, W, H, screenIdx, touchSet, hasTouchUi, h: { ident, fl, hex, condC, byteLines } });
    L.push(...lvgl.body);
    notes.push(...lvgl.notes);
  } else {
    L.push('void drawScreen(unsigned long ms) {', '  switch (screen) {');
    spec.screens.forEach((sc, i) => {
      L.push(`    case ${i}:  // ${sc.id}`, `      gfx.fillScreen(${colorLiteral(panel, sc.background, typed)});`);
      for (const el of sc.elements) for (const l of elementC(el, panel, spec, typed)) L.push(`      ${l}`);
      L.push('      break;');
    });
    L.push('  }', '}', '');
  }
  if (opts.host) return { code: L.join('\n'), libraries: [], notes };
  const tg = target!;
  // Wiring the bus: I2C modules start Wire; Adafruit SPI ones tell the core which pins; LovyanGFX and TFT_eSPI have their own.
  const init: string[] = [];
  if (bus === 'i2c') init.push('  Wire.begin();');
  else if (!tg.ownsPins && board.family.startsWith('esp32') && pins.sck !== '-1' && pins.mosi !== '-1') init.push(`  SPI.begin(${pins.sck}, -1, ${pins.mosi});  // the pins in your drawing`);
  else if (!tg.ownsPins && (board.family === 'rp2040' || board.family === 'rp2350') && pins.sck !== '-1') init.push(`  SPI.setSCK(${pins.sck}); SPI.setTX(${pins.mosi});`);
  // TFT controllers are portrait; a module that mounts one landscape (0.96" ST7735: 160 x 80) turns it
  // a quarter so rotation 0 is the module as drawn in BoardPilot.
  init.push(...tg.begin, `  tft.setRotation(${(spec.rotation + quarter) & 3});${quarter ? '  // the module mounts the panel landscape; use 3 if the picture is upside down' : ''}`, ...tg.afterRotation(canvas));
  if (touch) init.push(...touch.begin);
  if (lvgl) init.push(...lvgl.init);
  init.push('  t0 = millis();');
  const frame = lvgl ? ['  lv_timer_handler();  // LVGL runs the screens (every 33 ms), reads touch and sends what changed'] : ['  unsigned long ms = millis() - t0;', '  changeScreens(ms);', ...(hasTouchUi ? ['  handleTouch(ms);'] : []), '  readValues(ms);', '  drawScreen(ms);', `  ${tg.push(canvas)}`];
  if (asModule) {
    L.push('void display_init() {', ...init, '}', '', 'void display_update() {', ...frame, '}', '');
    const header = [
      `// display_screens.h — Display Studio module for ${spec.title}`,
      '#ifndef DISPLAY_SCREENS_H',
      '#define DISPLAY_SCREENS_H',
      '',
      'void display_init();    // call once from setup()',
      'void display_update();  // call from loop(): changes screen when it is time, draws and sends the frame',
      '',
      '#endif',
      '',
    ].join('\n');
    const main = [
      `// ${spec.title} — uses the Display Studio module (display_screens.h and display_screens.cpp).`,
      '// Copy the two calls below into your own sketch to add the display to it.',
      '#include "display_screens.h"',
      '',
      'void setup() {',
      '  Serial.begin(115200);',
      '  display_init();',
      '}',
      '',
      'void loop() {',
      '  display_update();',
      '}',
      '',
    ].join('\n');
    return { code: main, libraries: [...tg.libraries, ...(touch?.libraries ?? [])], notes, library: lib, files: [{ name: 'display_screens.h', text: header }, { name: 'display_screens.cpp', text: L.join('\n') }, ...tg.files] };
  }
  L.push('void setup() {', '  Serial.begin(115200);', ...init, '}', '', 'void loop() {', ...frame, ...(lvgl ? ['  delay(5);'] : []), '}', '');
  return { code: L.join('\n'), libraries: [...tg.libraries, ...(touch?.libraries ?? [])], notes, library: lib, ...(tg.files.length ? { files: tg.files } : {}) };
}
