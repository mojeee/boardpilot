// Display pins named in a project's own files, for the three libraries a custom TFT controller
// usually uses. Pure text functions (no board, no scene): the project archive uses them to describe
// an old project (with the file and line each pin came from), the code checker to compare them with
// the drawing. They read comment-free code (stripComments), so a commented-out line of the stock
// User_Setup.h never counts as a pin.
//
// Sources for the names:
//  - TFT_eSPI: the `#define TFT_MOSI`, TFT_MISO, TFT_SCLK, TFT_CS, TFT_DC (TFT_RS is the older name),
//    TFT_RST, TFT_BL and TOUCH_CS lines of User_Setup.h, which can also come from PlatformIO
//    `build_flags = -D TFT_MOSI=23` (TFT_eSPI README, "Configuration" / User_Setup.h comments).
//  - LovyanGFX: `cfg.pin_sclk`, pin_mosi, pin_miso, pin_dc (bus config), pin_cs and pin_rst (panel
//    config), pin_bl (light config), pin_cs, pin_int, pin_sda, pin_scl (touch config) of the
//    lgfx::Bus_SPI / Panel_* / Light_PWM / Touch_* classes (LovyanGFX docs, "Configuration" examples).
//  - Adafruit_ILI9341 / ST7789 / ST7735 / GC9A01A: the constructor Adafruit_xxx(cs, dc, rst) for
//    hardware SPI, and (cs, dc, mosi, sclk, rst[, miso]) for software SPI (Adafruit_ILI9341.h).

export type DisplayPinRole =
  | 'mosi'
  | 'miso'
  | 'sclk'
  | 'cs'
  | 'dc'
  | 'rst'
  | 'bl'
  | 'touch_cs'
  | 'touch_irq'
  | 'touch_sda'
  | 'touch_scl'
  | 'touch_sclk'
  | 'touch_mosi'
  | 'touch_miso';

export type DisplayLib = 'tft_espi' | 'lovyangfx' | 'adafruit';

export interface DisplayPin {
  role: DisplayPinRole;
  /** The GPIO / Arduino pin number. Pins set to -1 (not connected) are left out. */
  gpio: number;
  /** The name in the project: "TFT_MOSI", "cfg.pin_mosi", "Adafruit_ILI9341 cs". */
  name: string;
  lib: DisplayLib;
  /** 1-based line in the text that was read. */
  line: number;
}

/** What a role is, in plain words (used for the archive's pin list). */
export const ROLE_LABEL: Record<DisplayPinRole, string> = {
  mosi: 'display SPI data out (MOSI)',
  miso: 'display SPI data in (MISO)',
  sclk: 'display SPI clock',
  cs: 'display chip select',
  dc: 'display data/command',
  rst: 'display reset',
  bl: 'display backlight',
  touch_cs: 'touch chip select',
  touch_irq: 'touch interrupt',
  touch_sda: 'touch I2C data',
  touch_scl: 'touch I2C clock',
  touch_sclk: 'touch SPI clock',
  touch_mosi: 'touch SPI data out',
  touch_miso: 'touch SPI data in',
};

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** `#define NAME value` and `const int NAME = value;` with plain names/numbers, to follow `TFT_CS = PIN_CS`. */
function simpleConsts(code: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of code.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+\(?(-?\w+)\)?[ \t]*$/gm)) out.set(m[1], m[2]);
  for (const m of code.matchAll(/\b(?:static\s+)?(?:const\s+|constexpr\s+)(?:unsigned\s+)?(?:int|uint8_t|int8_t|int16_t|byte|gpio_num_t|auto)\s+(\w+)\s*=\s*\(?(-?\w+)\)?\s*[;,]/g)) if (!out.has(m[1])) out.set(m[1], m[2]);
  return out;
}

/** A pin number from an expression: 23, GPIO_NUM_23, or a name that is #defined as one. null: unknown or -1. */
export function pinNumber(expr: string, consts: Map<string, string>, depth = 0): number | null {
  const e = expr.trim().replace(/^\(|\)$/g, '').replace(/^\(\s*(?:uint8_t|int|gpio_num_t)\s*\)\s*/, '').trim();
  if (/^\d+$/.test(e)) return Number(e);
  const g = /^GPIO_NUM_(\d+)$/.exec(e);
  if (g) return Number(g[1]);
  if (consts.has(e) && depth < 4) return pinNumber(consts.get(e) ?? '', consts, depth + 1);
  return null;
}

const TFT_DEFINE: Record<string, DisplayPinRole> = {
  TFT_MOSI: 'mosi',
  TFT_MISO: 'miso',
  TFT_SCLK: 'sclk',
  TFT_CS: 'cs',
  TFT_DC: 'dc',
  TFT_RS: 'dc',
  TFT_RST: 'rst',
  TFT_BL: 'bl',
  TOUCH_CS: 'touch_cs',
};

/** The display controller a TFT_eSPI driver define names ("ILI9341_DRIVER" → "ILI9341"), if any. */
export function tftEspiDrivers(text: string): { controller: string; line: number }[] {
  const out: { controller: string; line: number }[] = [];
  for (const m of text.matchAll(/(?:^[ \t]*#[ \t]*define[ \t]+|-D[ \t]*)([A-Z][A-Z0-9]*(?:_\d+)?)_DRIVER\b/gm)) out.push({ controller: m[1].replace(/_/g, '-'), line: lineAt(text, m.index ?? 0) });
  return out;
}

/** TFT_eSPI pins from `#define TFT_xxx n` lines (User_Setup.h or a sketch). `code` is comment-free. */
function tftEspiDefines(code: string, consts: Map<string, string>): DisplayPin[] {
  const out: DisplayPin[] = [];
  for (const m of code.matchAll(/^[ \t]*#[ \t]*define[ \t]+(TFT_MOSI|TFT_MISO|TFT_SCLK|TFT_CS|TFT_DC|TFT_RS|TFT_RST|TFT_BL|TOUCH_CS)[ \t]+(.+?)[ \t]*$/gm)) {
    const gpio = pinNumber(m[2], consts);
    if (gpio !== null) out.push({ role: TFT_DEFINE[m[1]], gpio, name: m[1], lib: 'tft_espi', line: lineAt(code, m.index ?? 0) });
  }
  return out;
}

/** TFT_eSPI pins from PlatformIO build flags: `-D TFT_MOSI=23`, `-DTFT_CS=5`, `'-DTFT_DC=2'`. */
export function displayPinsFromFlags(text: string): DisplayPin[] {
  const out: DisplayPin[] = [];
  const consts = new Map<string, string>();
  for (const m of text.matchAll(/-D[ \t]*(\w+)=(-?\w+)/g)) consts.set(m[1], m[2]);
  for (const m of text.matchAll(/-D[ \t]*(TFT_MOSI|TFT_MISO|TFT_SCLK|TFT_CS|TFT_DC|TFT_RS|TFT_RST|TFT_BL|TOUCH_CS)=(-?\w+)/g)) {
    const gpio = pinNumber(m[2], consts);
    if (gpio !== null) out.push({ role: TFT_DEFINE[m[1]], gpio, name: m[1], lib: 'tft_espi', line: lineAt(text, m.index ?? 0) });
  }
  return out;
}

type Section = 'bus' | 'panel' | 'light' | 'touch';

const LGFX_PIN: Record<Section, Record<string, DisplayPinRole>> = {
  bus: { pin_sclk: 'sclk', pin_mosi: 'mosi', pin_miso: 'miso', pin_dc: 'dc' },
  panel: { pin_cs: 'cs', pin_rst: 'rst' },
  light: { pin_bl: 'bl' },
  touch: { pin_cs: 'touch_cs', pin_int: 'touch_irq', pin_sda: 'touch_sda', pin_scl: 'touch_scl', pin_sclk: 'touch_sclk', pin_mosi: 'touch_mosi', pin_miso: 'touch_miso' },
};

/** LovyanGFX `cfg.pin_xxx = n;` lines, each placed in the config block it follows (`cfg = _bus_instance.config();`). */
function lovyanPins(code: string, consts: Map<string, string>): DisplayPin[] {
  // instance name → section, from the declared type, else from the name ("_touch_instance")
  const kind = new Map<string, Section>();
  for (const m of code.matchAll(/\b(?:lgfx::)?(Bus_\w+|Panel_\w+|Light_\w+|Touch_\w+)\s+(\w+)\s*;/g)) {
    const t = m[1];
    kind.set(m[2], t.startsWith('Bus_') ? 'bus' : t.startsWith('Light_') ? 'light' : t.startsWith('Touch_') ? 'touch' : 'panel');
  }
  const sectionOf = (inst: string): Section => {
    const k = kind.get(inst);
    if (k) return k;
    const n = inst.toLowerCase();
    return /touch/.test(n) ? 'touch' : /light|backlight|bl\b/.test(n) ? 'light' : /bus/.test(n) ? 'bus' : 'panel';
  };
  const marks: { index: number; section: Section }[] = [];
  for (const m of code.matchAll(/\b(\w+)\s*=\s*(\w+)\s*\.\s*config\s*\(\s*\)/g)) marks.push({ index: m.index ?? 0, section: sectionOf(m[2]) });
  const out: DisplayPin[] = [];
  for (const m of code.matchAll(/\b\w+\s*\.\s*(pin_\w+)\s*=\s*([^;]+);/g)) {
    const index = m.index ?? 0;
    const sec = [...marks].reverse().find((x) => x.index < index)?.section;
    if (!sec) continue;
    const role = LGFX_PIN[sec][m[1]];
    if (!role) continue;
    const gpio = pinNumber(m[2], consts);
    if (gpio !== null) out.push({ role, gpio, name: `cfg.${m[1]}`, lib: 'lovyangfx', line: lineAt(code, index) });
  }
  return out;
}

/** Adafruit_ILI9341 / ST7789 / ST7735 / GC9A01A objects: `Adafruit_ILI9341 tft(CS, DC, RST);` or `... tft = Adafruit_ILI9341(CS, DC, RST);` */
function adafruitPins(code: string, consts: Map<string, string>): DisplayPin[] {
  const out: DisplayPin[] = [];
  const CLASS = 'Adafruit_(?:ILI9341|ILI9488|ST7789|ST7735|ST7796S|GC9A01A)';
  const found = [
    ...code.matchAll(new RegExp(String.raw`\b(${CLASS})\s*\*?\s*\w+\s*\(([^;]*?)\)\s*;`, 'g')),
    ...code.matchAll(new RegExp(String.raw`=\s*(?:new\s+)?(${CLASS})\s*\(([^;]*?)\)\s*;`, 'g')),
  ];
  for (const m of found) {
    const args = m[2].split(',').map((a) => a.trim());
    const at = (i: number, role: DisplayPinRole, what: string) => {
      const gpio = args[i] === undefined ? null : pinNumber(args[i], consts);
      if (gpio !== null) out.push({ role, gpio, name: `${m[1]} ${what}`, lib: 'adafruit', line: lineAt(code, m.index ?? 0) });
    };
    if (args.length === 3) {
      at(0, 'cs', 'cs');
      at(1, 'dc', 'dc');
      at(2, 'rst', 'rst');
    } else if (args.length >= 5 && args.length <= 6 && !/^&|SPI/.test(args[0])) {
      // software SPI: (cs, dc, mosi, sclk, rst[, miso])
      at(0, 'cs', 'cs');
      at(1, 'dc', 'dc');
      at(2, 'mosi', 'mosi');
      at(3, 'sclk', 'sclk');
      at(4, 'rst', 'rst');
      if (args.length === 6) at(5, 'miso', 'miso');
    }
  }
  return out;
}

/** Every display pin in comment-free code, in the order they appear (by library: TFT_eSPI, LovyanGFX, Adafruit). */
export function displayPinsFromCode(code: string): DisplayPin[] {
  const consts = simpleConsts(code);
  const seen = new Set<string>();
  // the same pin named twice (TFT_CS #defined and passed to the Adafruit constructor) counts once
  return [...tftEspiDefines(code, consts), ...lovyanPins(code, consts), ...adafruitPins(code, consts)].filter((p) => {
    const k = `${p.role}:${p.gpio}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The pins of one role, for readers that compare them with the drawing. */
export const pinsOfRole = (pins: DisplayPin[], role: DisplayPinRole) => pins.filter((p) => p.role === role);
