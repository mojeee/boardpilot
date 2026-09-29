import { describe, expect, it } from 'vitest';
import { BOARDS, getBoard } from '@shared/board';
import { adcCalc, adcOptions, calculatorsFor, pwmCalc, uartCalc } from '@shared/clocks';

const uno = getBoard('arduino-uno-r3');
const nucleo = getBoard('nucleo-f401re');
const esp = getBoard('esp32-devkitc-30');
const pico = getBoard('rpi-pico');
const nrf = getBoard('nrf52840-dk');
const val = (r: { values: [string, string][] }, k: string) => r.values.find(([n]) => n === k)?.[1];

describe('UART calculator', () => {
  it('matches the ATmega328P UBRR table at 16 MHz', () => {
    // Datasheet "Examples of UBRRn Settings": 9600 → 103 at 0.2%; 115200 → 16 with U2X at 2.1%.
    const a = uartCalc(uno, 16e6, 9600);
    expect(Math.abs(a.errorPct!)).toBeCloseTo(0.16, 1);
    const b = uartCalc(uno, 16e6, 115200);
    expect(val(b, 'UBRR0')).toBe('16');
    expect(val(b, 'U2X0')).toBe('1');
    expect(b.errorPct!).toBeCloseTo(2.12, 1);
    expect(b.verdict).toBe('risky');
  });
  it('matches the RM0368 fractional baud table at 84 MHz', () => {
    const r = uartCalc(nucleo, 84e6, 115200);
    expect(val(r, 'USARTDIV')).toBe('45.5625');
    expect(Math.round(r.actual!)).toBe(115226);
    expect(r.verdict).toBe('fine');
  });
  it('uses the Pico SDK divider formula', () => {
    const r = uartCalc(pico, 125e6, 115200);
    expect(val(r, 'IBRD')).toBe('67');
    expect(val(r, 'FBRD')).toBe('53');
    expect(Math.abs(r.errorPct!)).toBeLessThan(0.1);
  });
  it('explains the nRF52 fixed rates in plain words', () => {
    const r = uartCalc(nrf, 16e6, 115200);
    expect(r.actual).toBe(115108);
    expect(r.summary).toMatch(/nearest is 115108, -0.08% error, which is fine/);
  });
  it('gives ESP32 a tiny error at common speeds', () => {
    expect(Math.abs(uartCalc(esp, 80e6, 115200).errorPct!)).toBeLessThan(0.01);
  });
});

describe('PWM calculator', () => {
  it('makes an exact 50 Hz servo signal on AVR Timer1', () => {
    const r = pwmCalc(uno, 16e6, 50, 7.5);
    expect(val(r, 'N (prescaler)')).toBe('8');
    expect(val(r, 'ICR1 (TOP)')).toBe('39999');
    expect(val(r, 'OCR1A')).toBe('3000');
    expect(r.errorPct).toBe(0);
    expect(r.code[0].code).toContain('D9');
    expect(pwmCalc(getBoard('arduino-mega-2560'), 16e6, 50, 50).code[0].code).toContain('D11');
  });
  it('picks the smallest STM32 prescaler for the best resolution', () => {
    const r = pwmCalc(nucleo, 84e6, 1000, 25);
    expect(val(r, 'PSC')).toBe('1');
    expect(val(r, 'ARR')).toBe('41999');
    expect(val(r, 'CCR')).toBe('10500');
  });
  it('matches the Espressif LEDC example (5 kHz, 13 bits)', () => {
    const r = pwmCalc(esp, 80e6, 5000, 50);
    expect(val(r, 'Resolution')).toBe('13 bits');
    expect(Math.abs(r.errorPct!)).toBeLessThan(0.1);
    expect(r.code[0].code).toContain('ledcAttach(PWM_PIN, 5000, 13)');
    expect(val(pwmCalc(getBoard('esp32-c3-devkitm-1'), 80e6, 10, 50), 'Resolution')).toBe('14 bits');
  });
  it('uses a fractional divider on the RP2040', () => {
    const r = pwmCalc(pico, 125e6, 1000, 50);
    expect(val(r, 'DIV')).toBe('1 + 15/16');
    expect(Math.abs(r.errorPct!)).toBeLessThan(0.01);
  });
  it('fits the nRF52 15-bit counter', () => {
    const r = pwmCalc(nrf, 16e6, 1000, 50);
    expect(val(r, 'COUNTERTOP')).toBe('16000');
    expect(r.errorPct).toBe(0);
  });
  it('says so when a frequency is impossible', () => {
    expect(pwmCalc(uno, 16e6, 0.1, 50).ok).toBe(false);
    expect(pwmCalc(uno, 16e6, 10e6, 50).summary).toMatch(/too fast/);
  });
});

describe('ADC calculator', () => {
  it('gives the Arduino default rate on AVR (prescaler 128)', () => {
    const r = adcCalc(uno, 16e6, '128');
    expect(Math.round(r.actual!)).toBe(9615);
    expect(adcCalc(uno, 16e6, '2').summary).toMatch(/less than 10-bit/);
  });
  it('adds 12 cycles on STM32 and respects 36 MHz', () => {
    const r = adcCalc(nucleo, 84e6, '4:3');
    expect(Math.round(r.actual!)).toBe(1400000);
    expect(adcCalc(nucleo, 84e6, '2:3').ok).toBe(false);
  });
  it('caps the RP2040 at 500 kS/s', () => {
    expect(adcCalc(pico, 48e6, '0').actual).toBe(500000);
    expect(adcCalc(pico, 48e6, '47999').actual).toBe(1000);
  });
  it('does not invent an ESP32 conversion time', () => {
    expect(adcCalc(esp, 80e6, '').ok).toBe(false);
    expect(calculatorsFor(esp).adc).toBe(false);
  });
});

describe('every board', () => {
  it('has clocks, and every calculator it offers gives a result', () => {
    for (const b of Object.values(BOARDS)) {
      expect(b.clocks, b.id).toBeTruthy();
      const c = calculatorsFor(b);
      if (c.pwm) expect(pwmCalc(b, b.clocks!.pwmHz!, 1000, 50).ok, b.id).toBe(true);
      if (c.uart) expect(uartCalc(b, b.clocks!.uartHz!, 115200).ok, b.id).toBe(true);
      if (c.adc) for (const o of adcOptions(b).slice(0, 3)) adcCalc(b, b.clocks!.adcHz ?? b.clocks!.cpuHz, o.id);
    }
  });
});
