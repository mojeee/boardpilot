// Display Studio → an Arduino sketch that draws on the real display what the preview shows. The
// sketch carries the same 5x7 font, icons and pattern maths as shared/displayRender.ts and uses
// Adafruit GFX primitives (same line and circle algorithms), so the pixels match. Values are
// simulated on the board too (the same curves as in the app) until you replace each read with your
// sensor: every such line is marked TODO with the part it should come from.
//
// Drivers (Arduino Library Manager names): Adafruit SSD1306, Adafruit SH110X, Adafruit ST7735 and
// ST7789 Library, Adafruit ILI9341, Adafruit GC9A01A, Adafruit PCD8544 Nokia 5110 LCD library; all on
// Adafruit GFX Library. Other controllers render in the preview but get no code yet (said plainly).

import type { BoardDef, PartDef, Scene } from './types';
import { boardPinFor, pinById } from './board';
import { codePinName } from './planner';
import { FONT_5X7 } from './displayFont';
import { COLOR_BARS, GRAPH_STEP_MS, ICON_BITS } from './displayRender';
import { parseColor, parseCondition, rgb565, rotatedSize, type DisplayElement, type DisplaySpec, type PanelInfo } from './displaySpec';
import { t } from './i18n';

export interface DisplayCode {
  /** the sketch, or '' when this controller has no generator yet */
  code: string;
  libraries: string[];
  notes: string[];
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
function colorLiteral(panel: PanelInfo, c: string): string {
  const rgb = parseColor(c);
  if (panel.color === 'rgb565') return hex(rgb565(rgb), 4);
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

function elementC(el: DisplayElement, panel: PanelInfo, spec: DisplaySpec): string[] {
  const col = (c: string) => colorLiteral(panel, c);
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
      out.push(`  bpTextAligned(${el.x}, ${el.y}, buf, ${Math.max(1, Math.round(el.size))}, ${col(el.color)}, ${el.align === 'center' ? 1 : el.align === 'right' ? 2 : 0});`, '}');
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

/** The sketch for a spec on a display part in the scene. */
export function generateDisplayCode(
  spec: DisplaySpec,
  panel: PanelInfo,
  def: PartDef,
  scene: Scene,
  board: BoardDef,
  /** host: the drawing code only, on a GFXcanvas in RAM, for the native pixel test (tests/display.test.ts) */
  opts: { host?: boolean } = {},
): DisplayCode {
  const notes: string[] = [];
  const driver = DRIVERS[panel.controller];
  if (!driver && !opts.host) {
    return {
      code: '',
      libraries: [],
      notes: [t('The preview works for the {controller}, but BoardPilot cannot write its code yet (supported: SSD1306, SH1106, ST7789, ST7735, ILI9341, GC9A01).', { controller: panel.controller })],
    };
  }
  const pinOf = (...names: string[]): string => {
    for (const n of names) {
      const pp = def.pins.find((x) => x.name.toUpperCase() === n);
      if (!pp) continue;
      const bp = boardPinFor(scene, spec.part, pp.name);
      const p = bp ? pinById(board, bp) : undefined;
      if (p) return codePinName(board, p);
    }
    return '-1';
  };
  const pins: Pins = {
    cs: pinOf('CS'),
    dc: pinOf('DC', 'A0', 'RS'),
    rst: pinOf('RST', 'RES', 'RESET'),
    mosi: pinOf('SDA', 'MOSI', 'SDI(MOSI)', 'DIN'),
    sck: pinOf('SCL', 'SCK', 'CLK'),
    addr: (def.addresses?.[0] ?? '0x3C').toUpperCase().replace('0X', '0x'),
    spi: def.bus === 'spi',
  };
  const bus = driver?.bus === 'i2c' && pins.spi ? 'spi' : driver?.bus;
  if (bus === 'spi') {
    if (pins.dc === '-1') notes.push(t('The display’s DC pin is not wired: wire it, then generate the code again.'));
    if (pins.rst === '-1') notes.push(t('RST is not wired: the code uses -1 (no reset pin). Tie RST high or wire it to a free pin.'));
  }
  const [W, H] = rotatedSize(panel, spec.rotation);
  const bytes = W * H * 2;
  const bigRam = (board.ramBytes ?? 0) >= bytes * 2 + 32 * 1024;
  const mono = panel.color !== 'rgb565';
  // Colour panels draw into a RAM canvas and send whole frames (no flicker) when the chip has the RAM.
  const canvas = !mono && bigRam;
  if (!opts.host && !mono && !canvas) notes.push(t('This board has too little RAM for a full-screen frame buffer ({kb} KB), so the code draws straight to the display: fast animations will flicker.', { kb: Math.round(bytes / 1024) }));

  const L: string[] = [];
  const screenIdx = new Map(spec.screens.map((s, i) => [s.id, i]));
  L.push(
    `// ${spec.title} — Display Studio sketch for ${def.name} on ${board.name}`,
    '// Written by BoardPilot. The preview in the app shows the same pixels (same font, shapes and',
    '// pattern maths). Values are simulated like in the app; replace the lines marked TODO with your sensors.',
    ...(opts.host ? [] : [`// Libraries (Arduino Library Manager): ${driver!.libraries.join(', ')}`, '', ...driver!.include, ...(bus === 'spi' && !driver!.include.includes('#include <SPI.h>') ? ['#include <SPI.h>'] : [])]),
    '',
  );
  const { decl, begin } = opts.host ? { decl: '', begin: [] } : driver!.setup(pins, panel);
  if (opts.host) L.push('#include "Adafruit_GFX.h"', mono ? `GFXcanvas1 gfx(${W}, ${H});` : `GFXcanvas16 gfx(${W}, ${H});`);
  else {
    L.push(decl);
    if (canvas) L.push(`GFXcanvas16 gfx(${W}, ${H});  // the frame, drawn in RAM then sent in one go`);
    else L.push('Adafruit_GFX &gfx = tft;');
  }
  L.push('');
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
    ...varFunction(spec),
    '',
    `int screen = ${screenIdx.get(spec.start) ?? 0};  // ${spec.screens.map((s, i) => `${i} ${s.id}`).join(', ')}`,
    'unsigned long enteredAt = 0;',
    'unsigned long t0 = 0;',
    ...spec.vars.map((v) => `double v_${ident(v.name)} = 0;`),
    '',
    'void readValues(unsigned long ms) {',
    ...spec.vars.map((v) => `  v_${ident(v.name)} = sim_${ident(v.name)}(ms);${v.from ? `  // TODO: ${v.from}` : ''}`),
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
  L.push('void drawScreen(unsigned long ms) {', '  switch (screen) {');
  spec.screens.forEach((sc, i) => {
    L.push(`    case ${i}:  // ${sc.id}`, `      gfx.fillScreen(${colorLiteral(panel, sc.background)});`);
    for (const el of sc.elements) for (const l of elementC(el, panel, spec)) L.push(`      ${l}`);
    L.push('      break;');
  });
  L.push('  }', '}', '');
  if (opts.host) return { code: L.join('\n'), libraries: [], notes };
  const drv = driver!;
  L.push('void setup() {', '  Serial.begin(115200);');
  if (bus === 'i2c') L.push('  Wire.begin();');
  else if (board.family.startsWith('esp32') && pins.sck !== '-1' && pins.mosi !== '-1') L.push(`  SPI.begin(${pins.sck}, -1, ${pins.mosi});  // the pins in your drawing`);
  else if ((board.family === 'rp2040' || board.family === 'rp2350') && pins.sck !== '-1') L.push(`  SPI.setSCK(${pins.sck}); SPI.setTX(${pins.mosi});`);
  L.push(...begin, `  tft.setRotation(${spec.rotation & 3});`, '  t0 = millis();', '}', '');
  L.push(
    'void loop() {',
    '  unsigned long ms = millis() - t0;',
    '  changeScreens(ms);',
    '  readValues(ms);',
    '  drawScreen(ms);',
    drv.mono ? '  tft.display();  // send the frame to the OLED' : canvas ? `  tft.drawRGBBitmap(0, 0, gfx.getBuffer(), ${W}, ${H});  // send the frame` : '  delay(1);',
    '}',
    '',
  );
  return { code: L.join('\n'), libraries: drv.libraries, notes };
}
