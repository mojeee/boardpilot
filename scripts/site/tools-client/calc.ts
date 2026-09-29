// Logic of the website calculators (/tools/): the app's own tested functions from
// shared/electronics.ts and shared/clocks.ts, plus the few helpers the pages need on top.
// No DOM here, so tests can import it directly (tests/tools.test.ts).

import type { BoardClocks, BoardDef, BoardFamily } from '@shared/types';
import { I2C_MODES, divider, dividerR2, e12Above, e12Nearest, fmtOhms, i2cPullup, ledResistor, type I2cMode } from '@shared/electronics';
import { adcCalc, adcOptions, calculatorsFor, fmtHz, pwmCalc, uartCalc, type CalcResult } from '@shared/clocks';
import { setLanguage, t } from '@shared/i18n';

export { I2C_MODES, divider, dividerR2, e12Above, e12Nearest, fmtOhms, i2cPullup, ledResistor, adcCalc, adcOptions, calculatorsFor, fmtHz, pwmCalc, uartCalc, setLanguage, t };
export type { I2cMode, CalcResult };

/** The part of a board file the calculators read, embedded in the page as JSON. */
export interface ToolBoard {
  id: string;
  name: string;
  family: BoardFamily;
  module: string;
  clocks?: BoardClocks;
}

/**
 * shared/clocks.ts reads only `family`, `module` and `clocks` of a board; the page carries just
 * those fields instead of every pin, so the cast is safe for these calculators (and only them).
 */
export function asBoard(b: ToolBoard): BoardDef {
  return b as unknown as BoardDef;
}

/**
 * A standard (E12) pull-up to suggest inside the allowed range: the E12 value nearest to the
 * geometric middle of the range, moved up to the next value if it falls under the minimum.
 * Any standard value inside the range meets the specification; this one leaves margin on both
 * sides. Returns 0 when no E12 value fits.
 */
export function suggestPullup(minOhms: number, maxOhms: number): number {
  if (!(minOhms > 0) || !(maxOhms >= minOhms)) return 0;
  let r = e12Nearest(Math.sqrt(minOhms * maxOhms));
  if (r < minOhms) r = e12Above(minOhms);
  return r <= maxOhms ? r : 0;
}

/** The clock the page starts with for each calculator, as the app does (components/Calculators.tsx). */
export function defaultClock(b: ToolBoard, kind: 'pwm' | 'uart' | 'adc'): number {
  const c = b.clocks;
  if (!c) return 0;
  if (kind === 'pwm') return c.pwmHz ?? 0;
  if (kind === 'uart') return c.uartHz ?? 0;
  return c.adcHz ?? c.cpuHz ?? 0;
}

/** The ADC setting the page starts with (the Arduino default where there is one). */
export function defaultAdcOption(b: ToolBoard): string {
  if (b.family === 'avr') return '128';
  if (b.family === 'stm32') return '4:15';
  return adcOptions(asBoard(b))[0]?.id ?? '';
}

export const COMMON_BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 250000, 460800, 921600, 1000000];

/** Error at the usual speeds, for the table under the UART result. */
export function uartTable(b: ToolBoard, clockHz: number) {
  return COMMON_BAUDS.map((baud) => {
    const r = uartCalc(asBoard(b), clockHz, baud);
    return { baud, ok: r.ok, actual: r.actual, errorPct: r.errorPct, verdict: r.verdict };
  });
}
