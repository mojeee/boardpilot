// Display Studio: the touch half of the generated code. A drawing with buttons reads the touch
// controller wired in the project (XPT2046 over SPI, FT6236 or GT911 over I2C; parts in /parts) and
// turns its raw numbers into screen pixels with a calibration block the user adjusts once.
// Libraries (Arduino Library Manager): "XPT2046_Touchscreen" (Paul Stoffregen), "Adafruit FT6206
// Library" (also reads the FT6236), "TAMC_GT911".

import { t } from './i18n';
import type { PanelInfo } from './displaySpec';

export type TouchKind = 'xpt2046' | 'ft6236' | 'gt911';

/** The touch controller parts (parts/*.json) the generator knows. */
export const TOUCH_PARTS: Record<string, TouchKind> = {
  'xpt2046-touch': 'xpt2046',
  'ft6236-touch': 'ft6236',
  'gt911-touch': 'gt911',
};

export interface TouchPins {
  /** XPT2046 */
  cs: string;
  irq: string;
  /** FT6236, GT911 */
  sda: string;
  scl: string;
  int: string;
  rst: string;
}

export interface TouchCode {
  libraries: string[];
  include: string[];
  /** global declarations: the controller object, the calibration block and bpTouchRead() */
  decl: string[];
  /** lines of setup / display_init() */
  begin: string[];
  notes: string[];
}

/** Raw → screen pixels for the four rotations, as the display driver turns the picture (GFX setRotation). */
function orientation(rot: number): { swap: boolean; flipX: boolean; flipY: boolean } {
  switch (rot & 3) {
    case 1: return { swap: true, flipX: false, flipY: true };
    case 2: return { swap: false, flipX: true, flipY: true };
    case 3: return { swap: true, flipX: true, flipY: false };
    default: return { swap: false, flipX: false, flipY: false };
  }
}

const b = (v: boolean) => (v ? 'true' : 'false');

/**
 * The code that reads touch. `W` x `H` is the rotated screen, `rotation` the value given to setRotation()
 * (the touch controller reports in the panel's own portrait orientation), `i2cShared` when the display
 * already starts Wire.
 */
export function touchCode(kind: TouchKind, panel: PanelInfo, pins: TouchPins, W: number, H: number, rotation: number, i2cShared: boolean): TouchCode {
  const nw = Math.min(panel.widthPx, panel.heightPx);
  const nh = Math.max(panel.widthPx, panel.heightPx);
  const o = orientation(rotation);
  const resistive = kind === 'xpt2046';
  // The XPT2046 reports 12-bit numbers that stop short of the glass edges; capacitive ones report pixels.
  const [xMin, xMax, yMin, yMax] = resistive ? [200, 3800, 240, 3800] : [0, nw - 1, 0, nh - 1];
  const notes: string[] = [];
  const calib = [
    '// Touch calibration. The controller reports its own numbers, not screen pixels. Touch each corner of the',
    '// screen, print the raw numbers (see TOUCH_DEBUG below) and put the smallest and largest ones here.',
    '// If a tap lands mirrored or on the wrong axis, flip TOUCH_FLIP_X / TOUCH_FLIP_Y or toggle TOUCH_SWAP_XY.',
    `const int TOUCH_RAW_X_MIN = ${xMin}, TOUCH_RAW_X_MAX = ${xMax};  // TODO: calibrate`,
    `const int TOUCH_RAW_Y_MIN = ${yMin}, TOUCH_RAW_Y_MAX = ${yMax};  // TODO: calibrate`,
    `const bool TOUCH_SWAP_XY = ${b(o.swap)}, TOUCH_FLIP_X = ${b(o.flipX)}, TOUCH_FLIP_Y = ${b(o.flipY)};  // a first guess for rotation ${rotation & 3}`,
    '#define TOUCH_DEBUG 0  // set to 1 to print the raw numbers of every touch to the serial monitor',
    'void bpTouchMap(int rx, int ry, int &x, int &y) {',
    '  if (TOUCH_SWAP_XY) { int tmp = rx; rx = ry; ry = tmp; }',
    `  x = constrain(map(rx, TOUCH_RAW_X_MIN, TOUCH_RAW_X_MAX, 0, ${W - 1}), 0, ${W - 1});`,
    `  y = constrain(map(ry, TOUCH_RAW_Y_MIN, TOUCH_RAW_Y_MAX, 0, ${H - 1}), 0, ${H - 1});`,
    `  if (TOUCH_FLIP_X) x = ${W - 1} - x;`,
    `  if (TOUCH_FLIP_Y) y = ${H - 1} - y;`,
    '}',
  ];
  const debug = '  if (TOUCH_DEBUG) { Serial.print("touch raw "); Serial.print(rx); Serial.print(", "); Serial.println(ry); }';
  if (kind === 'xpt2046') {
    notes.push(t('The XPT2046 shares the SPI bus with the display: give it its own chip select (T_CS). Its numbers are raw: calibrate the corners once in the TOUCH_RAW lines.'));
    return {
      libraries: ['XPT2046_Touchscreen'],
      include: ['#include <SPI.h>', '#include <XPT2046_Touchscreen.h>'],
      decl: [pins.irq !== '-1' ? `XPT2046_Touchscreen ts(${pins.cs}, ${pins.irq});  // T_CS, T_IRQ` : `XPT2046_Touchscreen ts(${pins.cs});  // T_CS (T_IRQ is not wired: it polls)`, ...calib, '',
        'bool bpTouchRead(int &x, int &y) {', '  if (!ts.touched()) return false;', '  TS_Point p = ts.getPoint();', '  int rx = p.x, ry = p.y;', debug, '  bpTouchMap(rx, ry, x, y);', '  return true;', '}'],
      begin: ['  ts.begin();'],
      notes,
    };
  }
  const reset = pins.rst !== '-1' ? [`  pinMode(${pins.rst}, OUTPUT); digitalWrite(${pins.rst}, LOW); delay(10); digitalWrite(${pins.rst}, HIGH); delay(60);  // reset the touch controller`] : [];
  const wire = i2cShared ? [] : pins.sda !== '-1' && pins.scl !== '-1' ? [`  Wire.begin(${pins.sda}, ${pins.scl});  // the pins in your drawing`] : ['  Wire.begin();'];
  if (kind === 'ft6236') {
    return {
      libraries: ['Adafruit FT6206 Library'],
      include: ['#include <Wire.h>', '#include <Adafruit_FT6206.h>'],
      decl: ['Adafruit_FT6206 ctp;', ...calib, '',
        'bool bpTouchRead(int &x, int &y) {', '  if (!ctp.touched()) return false;', '  TS_Point p = ctp.getPoint();', '  int rx = p.x, ry = p.y;', debug, '  bpTouchMap(rx, ry, x, y);', '  return true;', '}'],
      begin: [...reset, ...wire, '  if (!ctp.begin(40)) {  // touch threshold; the FT6236 answers at 0x38', '    Serial.println("Touch controller not found: check SDA, SCL and power");', '  }'],
      notes,
    };
  }
  notes.push(t('The GT911 picks its I2C address (0x5D or 0x14) from the level of INT while RST is released. If the controller is not found, the library’s own address setting may need changing.'));
  return {
    libraries: ['TAMC_GT911'],
    include: ['#include <Wire.h>', '#include <TAMC_GT911.h>'],
    decl: [`TAMC_GT911 tp = TAMC_GT911(${pins.sda}, ${pins.scl}, ${pins.int}, ${pins.rst}, ${nw}, ${nh});`, ...calib, '',
      'bool bpTouchRead(int &x, int &y) {', '  tp.read();', '  if (!tp.isTouched) return false;', '  int rx = tp.points[0].x, ry = tp.points[0].y;', debug, '  bpTouchMap(rx, ry, x, y);', '  return true;', '}'],
    begin: [...wire, '  tp.begin();', '  tp.setRotation(ROTATION_NORMAL);  // raw numbers stay in the panel orientation: the calibration block turns them'],
    notes,
  };
}

/** A touch read that never touches: used when the drawing has buttons but no touch controller is wired. */
export const NO_TOUCH_CODE: string[] = [
  '// No touch controller is wired in the project: replace this with the read of yours (see TOUCH_PARTS in BoardPilot:',
  '// XPT2046, FT6236 or GT911). It must give the touched pixel and return true while the screen is pressed.',
  'bool bpTouchRead(int &x, int &y) {',
  '  return false;  // TODO: read your touch controller',
  '}',
];
