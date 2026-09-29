// Small electronics calculators for the Hardware basics lesson: LED resistor, voltage divider and
// I2C pull-up size. Pure functions, unit-tested.

/** E12 standard resistor values (IEC 60063), one decade. */
const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

/** The nearest E12 value at or above `ohms` (a safe choice for a current-limiting resistor). */
export function e12Above(ohms: number): number {
  if (!(ohms > 0)) return 0;
  const decade = 10 ** Math.floor(Math.log10(ohms));
  for (const d of [decade, decade * 10]) {
    const v = E12.map((x) => Math.round(x * d * 100) / 100).find((x) => x >= ohms - 1e-9);
    if (v !== undefined) return v;
  }
  return decade * 10;
}

/** Nearest E12 value (either side). */
export function e12Nearest(ohms: number): number {
  if (!(ohms > 0)) return 0;
  const decade = 10 ** Math.floor(Math.log10(ohms));
  const cands = [...E12.map((x) => x * decade), 10 * decade].map((x) => Math.round(x * 100) / 100);
  return cands.reduce((a, b) => (Math.abs(b - ohms) < Math.abs(a - ohms) ? b : a));
}

/**
 * Series resistor for an LED (Ohm's law): R = (Vsupply − Vf) / I.
 * Returns the exact value, the next E12 value up, and the current and resistor power with it.
 */
export function ledResistor(supplyV: number, ledVf: number, currentMa: number) {
  const drop = supplyV - ledVf;
  if (drop <= 0 || currentMa <= 0) return { ok: false as const, drop };
  const exact = drop / (currentMa / 1000);
  const standard = e12Above(exact);
  const actualMa = (drop / standard) * 1000;
  const powerMw = (drop * drop * 1000) / standard;
  return { ok: true as const, drop, exact, standard, actualMa, powerMw };
}

/** Unloaded divider output: Vout = Vin × R2 / (R1 + R2). With a load, R2 is in parallel with it. */
export function divider(vin: number, r1: number, r2: number, loadOhms = Infinity) {
  const r2eff = Number.isFinite(loadOhms) ? (r2 * loadOhms) / (r2 + loadOhms) : r2;
  const vout = (vin * r2eff) / (r1 + r2eff);
  const currentMa = (vin / (r1 + r2eff)) * 1000;
  return { vout, currentMa };
}

/** R2 for a target output, given R1 (unloaded). */
export function dividerR2(vin: number, vout: number, r1: number): number {
  if (!(vout > 0 && vout < vin)) return NaN;
  return (r1 * vout) / (vin - vout);
}

/** I2C bus speeds with their maximum rise time (NXP UM10204 I2C-bus specification, table 10). */
export const I2C_MODES = {
  standard: { label: 'Standard mode (100 kHz)', riseNs: 1000, iolMa: 3 },
  fast: { label: 'Fast mode (400 kHz)', riseNs: 300, iolMa: 3 },
  fastPlus: { label: 'Fast mode plus (1 MHz)', riseNs: 120, iolMa: 20 },
} as const;
export type I2cMode = keyof typeof I2C_MODES;

/**
 * Pull-up resistor range for an I2C bus (NXP UM10204, section 7.1 "Pull-up resistor sizing"):
 *   Rp(min) = (VDD − VOL(max)) / IOL        VOL(max) = 0.4 V
 *   Rp(max) = tr / (0.8473 × Cb)            tr = maximum rise time, Cb = bus capacitance
 * Plus the rise time a chosen resistor gives: tr = 0.8473 × Rp × Cb.
 */
export function i2cPullup(vdd: number, busPf: number, mode: I2cMode, chosenOhms?: number) {
  const m = I2C_MODES[mode];
  const minOhms = (vdd - 0.4) / (m.iolMa / 1000);
  const maxOhms = (m.riseNs * 1e-9) / (0.8473 * busPf * 1e-12);
  const riseNs = chosenOhms ? 0.8473 * chosenOhms * busPf * 1e-12 * 1e9 : undefined;
  const fits = chosenOhms !== undefined ? chosenOhms >= minOhms && chosenOhms <= maxOhms : undefined;
  return { minOhms, maxOhms, riseNs, fits, possible: minOhms <= maxOhms };
}

/** "4.7 kΩ", "220 Ω", "1.2 MΩ" */
export function fmtOhms(ohms: number): string {
  if (!Number.isFinite(ohms)) return '∞';
  if (ohms >= 1e6) return `${+(ohms / 1e6).toPrecision(3)} MΩ`;
  if (ohms >= 1e3) return `${+(ohms / 1e3).toPrecision(3)} kΩ`;
  return `${+ohms.toPrecision(3)} Ω`;
}
