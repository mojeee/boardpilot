import { describe, expect, it } from 'vitest';
import { divider, dividerR2, e12Above, e12Nearest, fmtOhms, i2cPullup, ledResistor } from '@shared/electronics';

describe('electronics calculators', () => {
  it('picks E12 values', () => {
    expect(e12Above(65)).toBe(68);
    expect(e12Above(150)).toBe(150);
    expect(e12Above(9000)).toBe(10000);
    expect(e12Nearest(4600)).toBe(4700);
  });

  it('sizes an LED resistor with Ohm’s law', () => {
    // Red LED (Vf ≈ 2 V) on 3.3 V at 10 mA: (3.3 − 2) / 0.01 = 130 Ω → 150 Ω, about 8.7 mA.
    const r = ledResistor(3.3, 2.0, 10);
    expect(r.ok && r.exact).toBeCloseTo(130, 5);
    expect(r.ok && r.standard).toBe(150);
    expect(r.ok && r.actualMa).toBeCloseTo(8.67, 1);
    // A blue LED (3.2 V) on 3.3 V barely lights; on 3.0 V it cannot.
    expect(ledResistor(3.0, 3.2, 10).ok).toBe(false);
  });

  it('computes a divider, with and without a load', () => {
    // HC-SR04 echo divider: 5 V through 1 kΩ / 2 kΩ gives 3.33 V.
    expect(divider(5, 1000, 2000).vout).toBeCloseTo(3.333, 3);
    expect(divider(5, 10000, 10000, 10000).vout).toBeCloseTo(1.667, 3);
    expect(dividerR2(5, 3.3, 1000)).toBeCloseTo(1941, 0);
  });

  it('sizes I2C pull-ups like the NXP specification', () => {
    // UM10204 7.1: VDD 3.3 V, standard mode, 3 mA → Rp(min) = 2.9 V / 3 mA ≈ 967 Ω.
    const s = i2cPullup(3.3, 200, 'standard', 4700);
    expect(s.minOhms).toBeCloseTo(966.7, 0);
    // Rp(max) = 1000 ns / (0.8473 × 200 pF) ≈ 5.9 kΩ.
    expect(s.maxOhms).toBeCloseTo(5901, -1);
    expect(s.fits).toBe(true);
    expect(i2cPullup(3.3, 200, 'fast', 4700).fits).toBe(false); // 400 kHz needs stronger pull-ups
    expect(fmtOhms(4700)).toBe('4.7 kΩ');
    expect(fmtOhms(220)).toBe('220 Ω');
  });
});
