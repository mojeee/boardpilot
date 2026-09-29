// Clock-aware calculators: timer/PWM, UART baud and ADC rate, from the board's own clock data
// (board.clocks) and each chip family's divider rules, with ready-to-paste code for its toolchain.
// Every result is arithmetic on documented register formulas; nothing here is a measurement.

import type { BoardDef, BoardFamily } from './types';
import { t } from './i18n';

export interface CodeSnippet {
  label: string;
  code: string;
}

export interface CalcResult {
  ok: boolean;
  /** plain-language summary, already translated */
  summary: string;
  /** register or API values, e.g. [["PSC", "83"], ["ARR", "999"]] */
  values: [string, string][];
  actual?: number;
  errorPct?: number;
  /** 'fine' | 'usually works' | 'risky' for UART; 'fine' otherwise */
  verdict?: 'fine' | 'ok' | 'risky';
  code: CodeSnippet[];
  source: string;
}

const fail = (summary: string, source = ''): CalcResult => ({ ok: false, summary, values: [], code: [], source });

export function fmtHz(hz: number): string {
  const r = (n: number) => String(Math.round(n * 1000) / 1000);
  if (hz >= 1e6) return `${r(hz / 1e6)} MHz`;
  if (hz >= 1e3) return `${r(hz / 1e3)} kHz`;
  return `${r(hz)} Hz`;
}

const pct = (actual: number, target: number) => ((actual - target) / target) * 100;
const fmtPct = (e: number) => `${Math.abs(e) < 0.005 ? '0' : (Math.round(e * 100) / 100).toString()}%`;
const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;

const isEsp = (f: BoardFamily) => f === 'esp32' || f === 'esp32s3' || f === 'esp32c3';
const isRp = (f: BoardFamily) => f === 'rp2040' || f === 'rp2350';

/** Which calculators this board supports. */
export function calculatorsFor(board: BoardDef): { pwm: boolean; uart: boolean; adc: boolean } {
  const c = board.clocks;
  const f = board.family;
  if (!c || f === 'imxrt') return { pwm: false, uart: false, adc: false };
  return { pwm: !!c.pwmHz, uart: !!c.uartHz, adc: f === 'avr' || f === 'stm32' || isRp(f) || f === 'nrf52' };
}

/* ------------------------------------------------------------------ PWM / timer */

function pwmSummary(clockHz: number, target: number, actual: number, steps: number): string {
  const bits = Math.floor(Math.log2(steps) * 10) / 10;
  const err = pct(actual, target);
  if (Math.abs(err) < 0.001)
    return t('{clock} makes exactly {f}, with {steps} duty steps (about {bits} bits).', { clock: fmtHz(clockHz), f: fmtHz(target), steps, bits });
  return t('{clock} cannot make exactly {f}: nearest is {actual} ({err} off), with {steps} duty steps (about {bits} bits).', {
    clock: fmtHz(clockHz),
    f: fmtHz(target),
    actual: fmtHz(actual),
    err: fmtPct(err),
    steps,
    bits,
  });
}

export function pwmCalc(board: BoardDef, clockHz: number, freq: number, dutyPct: number): CalcResult {
  const f = board.family;
  if (!(freq > 0) || !(clockHz > 0)) return fail(t('Enter a frequency above 0.'));
  const duty = Math.min(100, Math.max(0, dutyPct)) / 100;
  if (f === 'avr') return avrPwm(board, clockHz, freq, duty);
  if (f === 'stm32') return stm32Pwm(clockHz, freq, duty);
  if (isEsp(f)) return espPwm(f, clockHz, freq, duty);
  if (isRp(f)) return rpPwm(clockHz, freq, duty);
  if (f === 'nrf52') return nrfPwm(clockHz, freq, duty);
  return fail(t('There is no timer calculator for this chip yet.'));
}

// ATmega328P / ATmega2560 datasheet, "16-bit Timer/Counter1 with PWM", Fast PWM mode 14 (TOP = ICR1):
// f = clk / (N × (1 + TOP)), N in {1, 8, 64, 256, 1024}. Clock-select bits CS12:0 in TCCR1B.
const AVR_PRESCALERS: [number, string][] = [
  [1, '_BV(CS10)'],
  [8, '_BV(CS11)'],
  [64, '_BV(CS11) | _BV(CS10)'],
  [256, '_BV(CS12)'],
  [1024, '_BV(CS12) | _BV(CS10)'],
];
function avrPwm(board: BoardDef, clk: number, freq: number, duty: number): CalcResult {
  const source = 'ATmega328P / ATmega2560 datasheet, Timer/Counter1 Fast PWM (mode 14, TOP = ICR1)';
  for (const [n, cs] of AVR_PRESCALERS) {
    const top = Math.round(clk / (n * freq)) - 1;
    if (top > 65535) continue;
    if (top < 3) return fail(t('{f} is too fast for this timer: the highest useful frequency is about {max}.', { f: fmtHz(freq), max: fmtHz(clk / 4) }), source);
    const actual = clk / (n * (top + 1));
    const ocr = Math.round(duty * (top + 1));
    const pin = /2560/.test(board.module) ? 'D11' : 'D9';
    return {
      ok: true,
      summary: pwmSummary(clk, freq, actual, top + 1),
      values: [['N (prescaler)', String(n)], ['ICR1 (TOP)', String(top)], ['OCR1A', String(ocr)]],
      actual,
      errorPct: pct(actual, freq),
      verdict: 'fine',
      source,
      code: [
        {
          label: t('Registers (Arduino sketch)'),
          code: `// Timer1, fast PWM with TOP = ICR1: ${fmtHz(actual)}, duty ${Math.round(duty * 1000) / 10}%\n// OC1A is ${pin} on this board. Timer1 also drives the Servo library.\npinMode(${pin.slice(1)}, OUTPUT);\nTCCR1A = _BV(COM1A1) | _BV(WGM11);\nTCCR1B = _BV(WGM13) | _BV(WGM12) | ${cs};\nICR1 = ${top};\nOCR1A = ${ocr};`,
        },
      ],
    };
  }
  return fail(t('{f} is too slow for this timer: the lowest is about {min}.', { f: fmtHz(freq), min: fmtHz(clk / (1024 * 65536)) }), source);
}

// RM0368 / RM0383, general-purpose timers: f = TIMclk / ((PSC + 1) × (ARR + 1)), both 16-bit
// (TIM2 and TIM5 are 32-bit; this uses the 16-bit limits so the numbers work on any timer).
function stm32Pwm(clk: number, freq: number, duty: number): CalcResult {
  const source = 'RM0368 / RM0383, general-purpose timers: counter clock = TIMclk / (PSC + 1), period = ARR + 1';
  const total = clk / freq;
  if (total < 4) return fail(t('{f} is too fast for this timer: the highest useful frequency is about {max}.', { f: fmtHz(freq), max: fmtHz(clk / 4) }), source);
  const psc = Math.ceil(total / 65536) - 1;
  if (psc > 65535) return fail(t('{f} is too slow for this timer: the lowest is about {min}.', { f: fmtHz(freq), min: fmtHz(clk / 65536 / 65536) }), source);
  const arr = Math.round(total / (psc + 1)) - 1;
  const actual = clk / ((psc + 1) * (arr + 1));
  const ccr = Math.round(duty * (arr + 1));
  return {
    ok: true,
    summary: pwmSummary(clk, freq, actual, arr + 1),
    values: [['PSC', String(psc)], ['ARR', String(arr)], ['CCR', String(ccr)]],
    actual,
    errorPct: pct(actual, freq),
    verdict: 'fine',
    source,
    code: [
      {
        label: t('Arduino (STM32 core, HardwareTimer)'),
        code: `// TIM3 channel 1 (PA6 on this board). ${fmtHz(actual)}, duty ${Math.round(duty * 1000) / 10}%\nHardwareTimer *pwm = new HardwareTimer(TIM3);\npwm->setPrescaleFactor(${psc + 1});\npwm->setOverflow(${arr + 1}, TICK_FORMAT);\npwm->setMode(1, TIMER_OUTPUT_COMPARE_PWM1, PA6);\npwm->setCaptureCompare(1, ${ccr}, TICK_COMPARE_FORMAT);\npwm->resume();`,
      },
      {
        label: t('STM32 HAL (CubeMX)'),
        code: `htim3.Init.Prescaler = ${psc};\nhtim3.Init.Period = ${arr};\n// ...\nsConfigOC.OCMode = TIM_OCMODE_PWM1;\nsConfigOC.Pulse = ${ccr};\nHAL_TIM_PWM_ConfigChannel(&htim3, &sConfigOC, TIM_CHANNEL_1);\nHAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);`,
      },
      { label: t('Registers'), code: `TIM3->PSC = ${psc};\nTIM3->ARR = ${arr};\nTIM3->CCR1 = ${ccr};` },
    ],
  };
}

// ESP32 TRM, LED_PWM: f = clk / (divider × 2^bits), divider is fixed point with 10 integer and 8
// fractional bits (1 ≤ divider < 1024). Duty resolution: up to 20 bits on the ESP32, 14 bits on
// the ESP32-S3 and ESP32-C3 (their TRMs, LEDC_DUTY_RES). Espressif's LEDC example: 5 kHz, 13 bits.
function espPwm(f: BoardFamily, clk: number, freq: number, duty: number): CalcResult {
  const source = f === 'esp32' ? 'ESP32 TRM, LED_PWM: divider 10.8 fixed point, up to 20-bit duty' : 'ESP32-S3/C3 TRM, LED PWM Controller: divider 10.8 fixed point, up to 14-bit duty';
  const maxBits = f === 'esp32' ? 20 : 14;
  const bits = Math.min(maxBits, Math.floor(Math.log2(clk / freq)));
  if (bits < 1) return fail(t('{f} is too fast for LEDC: the highest is about {max}.', { f: fmtHz(freq), max: fmtHz(clk / 2) }), source);
  const div = Math.round((clk / (freq * 2 ** bits)) * 256) / 256;
  if (div >= 1024) return fail(t('{f} is too slow for LEDC: the lowest is about {min}.', { f: fmtHz(freq), min: fmtHz(clk / (1023.996 * 2 ** maxBits)) }), source);
  const actual = clk / (div * 2 ** bits);
  const value = Math.round(duty * 2 ** bits);
  return {
    ok: true,
    summary: pwmSummary(clk, freq, actual, 2 ** bits),
    values: [
      [t('Resolution'), `${bits} bits`],
      [t('Divider'), String(div)],
      [t('Duty value'), String(value)],
    ],
    actual,
    errorPct: pct(actual, freq),
    verdict: 'fine',
    source,
    code: [
      {
        label: t('Arduino (ESP32 core 3.x)'),
        code: `const int PWM_PIN = 25; // your pin\nledcAttach(PWM_PIN, ${Math.round(freq)}, ${bits}); // ${fmtHz(actual)}, ${bits}-bit\nledcWrite(PWM_PIN, ${value}); // ${Math.round(duty * 1000) / 10}%`,
      },
      {
        label: t('ESP-IDF'),
        code: `ledc_timer_config_t timer = {\n  .speed_mode = LEDC_LOW_SPEED_MODE,\n  .duty_resolution = LEDC_TIMER_${bits}_BIT,\n  .timer_num = LEDC_TIMER_0,\n  .freq_hz = ${Math.round(freq)},\n  .clk_cfg = LEDC_AUTO_CLK,\n};\nledc_timer_config(&timer);\n// channel: .duty = ${value}`,
      },
    ],
  };
}

// RP2040 Datasheet 4.5.2.6 "Configuring PWM Period": f = clk_sys / (DIV × (TOP + 1)), TOP 16-bit,
// DIV 8.4 fixed point (1 ≤ DIV < 256). The smallest divider gives the most duty steps.
function rpPwm(clk: number, freq: number, duty: number): CalcResult {
  const source = 'RP2040 Datasheet 4.5.2.6 Configuring PWM Period (DIV 8.4 fixed point, TOP 16-bit)';
  if (clk / freq < 2) return fail(t('{f} is too fast for this timer: the highest useful frequency is about {max}.', { f: fmtHz(freq), max: fmtHz(clk / 2) }), source);
  const div = Math.max(1, Math.ceil((clk / (freq * 65536)) * 16) / 16);
  if (div >= 256) return fail(t('{f} is too slow for this timer: the lowest is about {min}.', { f: fmtHz(freq), min: fmtHz(clk / (255.9375 * 65536)) }), source);
  const top = Math.min(65535, Math.round(clk / (div * freq)) - 1);
  const actual = clk / (div * (top + 1));
  const level = Math.round(duty * (top + 1));
  const di = Math.floor(div);
  const df = Math.round((div - di) * 16);
  return {
    ok: true,
    summary: pwmSummary(clk, freq, actual, top + 1),
    values: [
      ['DIV', `${di} + ${df}/16`],
      ['TOP (wrap)', String(top)],
      [t('Level'), String(level)],
    ],
    actual,
    errorPct: pct(actual, freq),
    verdict: 'fine',
    source,
    code: [
      {
        label: t('Pico SDK'),
        code: `const uint PWM_PIN = 15; // your pin\ngpio_set_function(PWM_PIN, GPIO_FUNC_PWM);\nuint slice = pwm_gpio_to_slice_num(PWM_PIN);\npwm_set_clkdiv_int_frac(slice, ${di}, ${df});\npwm_set_wrap(slice, ${top});\npwm_set_gpio_level(PWM_PIN, ${level}); // ${Math.round(duty * 1000) / 10}%\npwm_set_enabled(slice, true); // ${fmtHz(actual)}`,
      },
      {
        label: t('Arduino (Pico core)'),
        code: `analogWriteFreq(${Math.round(freq)});\nanalogWriteRange(${top + 1});\nanalogWrite(15, ${level}); // your pin`,
      },
    ],
  };
}

// nRF52840 Product Specification, PWM: 16 MHz / 2^PRESCALER (0..7), COUNTERTOP 3..32767, up mode:
// f = 16 MHz / (2^PRESCALER × COUNTERTOP).
function nrfPwm(clk: number, freq: number, duty: number): CalcResult {
  const source = 'nRF52840 Product Specification, PWM: PRESCALER (DIV_1 to DIV_128), COUNTERTOP 15-bit';
  for (let p = 0; p <= 7; p++) {
    const div = 2 ** p;
    const top = Math.round(clk / (div * freq));
    if (top > 32767) continue;
    if (top < 3) return fail(t('{f} is too fast for this timer: the highest useful frequency is about {max}.', { f: fmtHz(freq), max: fmtHz(clk / 3) }), source);
    const actual = clk / (div * top);
    const value = Math.round(duty * top);
    return {
      ok: true,
      summary: pwmSummary(clk, freq, actual, top),
      values: [['PRESCALER', `DIV_${div}`], ['COUNTERTOP', String(top)], [t('Duty value'), String(value)]],
      actual,
      errorPct: pct(actual, freq),
      verdict: 'fine',
      source,
      code: [
        {
          label: t('Arduino (Adafruit nRF52 core)'),
          code: `HwPWM0.addPin(PWM_PIN);\nHwPWM0.setClockDiv(PWM_PRESCALER_PRESCALER_DIV_${div});\nHwPWM0.setMaxValue(${top});\nHwPWM0.writePin(PWM_PIN, ${value}); // ${Math.round(duty * 1000) / 10}%, ${fmtHz(actual)}`,
        },
        { label: t('Registers'), code: `NRF_PWM0->PRESCALER = PWM_PRESCALER_PRESCALER_DIV_${div};\nNRF_PWM0->COUNTERTOP = ${top};` },
      ],
    };
  }
  return fail(t('{f} is too slow for this timer: the lowest is about {min}.', { f: fmtHz(freq), min: fmtHz(clk / (128 * 32767)) }), source);
}

/* ------------------------------------------------------------------ UART */

function uartVerdict(err: number): 'fine' | 'ok' | 'risky' {
  const e = Math.abs(err);
  return e <= 1 ? 'fine' : e <= 2 ? 'ok' : 'risky';
}

function uartSummary(clockHz: number, baud: number, actual: number, err: number, v: 'fine' | 'ok' | 'risky', exactList = false): string {
  const tail = v === 'fine' ? t('which is fine.') : v === 'ok' ? t('which usually works if the other side is accurate.') : t('which is too much: pick another speed.');
  if (Math.abs(err) < 0.001) return t('{clock} makes exactly {baud} baud.', { clock: exactList ? t('This UART') : fmtHz(clockHz), baud });
  return t('{clock} cannot make exactly {baud} baud: nearest is {actual}, {err} error, {tail}', {
    clock: exactList ? t('This UART') : fmtHz(clockHz),
    baud,
    actual: Math.round(actual),
    err: fmtPct(err),
    tail,
  });
}

export function uartCalc(board: BoardDef, clockHz: number, baud: number): CalcResult {
  const f = board.family;
  if (!(baud > 0) || !(clockHz > 0)) return fail(t('Enter a baud rate above 0.'));
  if (f === 'avr') return avrUart(clockHz, baud);
  if (f === 'stm32') return stm32Uart(clockHz, baud);
  if (isEsp(f)) return espUart(clockHz, baud);
  if (isRp(f)) return rpUart(clockHz, baud);
  if (f === 'nrf52') return nrfUart(baud);
  return fail(t('There is no UART calculator for this chip yet.'));
}

// ATmega328P datasheet, USART0 "Baud Rate Generation": normal speed UBRR = clk/(16·baud) − 1,
// double speed (U2X0 = 1) UBRR = clk/(8·baud) − 1. Its table "Examples of UBRRn Settings" at 16 MHz:
// 9600 → UBRR 103 (0.2%), 115200 → 8 (−3.5%) normal or 16 (2.1%) with U2X. The Arduino core
// picks the setting itself in Serial.begin().
function avrUart(clk: number, baud: number): CalcResult {
  const source = 'ATmega328P datasheet, USART0: Baud Rate Generation; Examples of UBRRn Settings';
  const opts = [16, 8].map((div) => {
    const ubrr = Math.min(4095, Math.max(0, Math.round(clk / (div * baud)) - 1));
    const actual = clk / (div * (ubrr + 1));
    return { div, ubrr, actual, err: pct(actual, baud) };
  });
  const best = Math.abs(opts[1].err) < Math.abs(opts[0].err) ? opts[1] : opts[0];
  const v = uartVerdict(best.err);
  const u2x = best.div === 8;
  return {
    ok: true,
    summary: uartSummary(clk, baud, best.actual, best.err, v),
    values: [['UBRR0', String(best.ubrr)], ['U2X0', u2x ? '1' : '0'], [t('Real rate'), String(Math.round(best.actual))]],
    actual: best.actual,
    errorPct: best.err,
    verdict: v,
    source,
    code: [
      { label: t('Arduino'), code: `Serial.begin(${baud}); // the core picks UBRR and U2X itself` },
      { label: t('Registers'), code: `UBRR0 = ${best.ubrr};\nUCSR0A = ${u2x ? '_BV(U2X0)' : '0'};\nUCSR0B = _BV(RXEN0) | _BV(TXEN0);\nUCSR0C = _BV(UCSZ01) | _BV(UCSZ00); // 8N1` },
    ],
  };
}

// RM0368 19.3.4 "Fractional baud rate generation" (oversampling by 16): USARTDIV = fck / (16 × baud),
// BRR = 12-bit mantissa and 4-bit fraction, so BRR = round(fck / baud). Its table at 84 MHz:
// 115200 → USARTDIV 45.5625, real 115 226 (0.02%).
function stm32Uart(clk: number, baud: number): CalcResult {
  const source = 'RM0368 / RM0383, USART: Fractional baud rate generation (oversampling by 16)';
  const brr = Math.round(clk / baud);
  if (brr < 16 || brr > 0xffff) return fail(t('{baud} baud is out of range for this UART clock.', { baud }), source);
  const actual = clk / brr;
  const err = pct(actual, baud);
  const v = uartVerdict(err);
  return {
    ok: true,
    summary: uartSummary(clk, baud, actual, err, v),
    values: [['USARTDIV', String(brr / 16)], ['BRR', hex(brr)], [t('Real rate'), String(Math.round(actual))]],
    actual,
    errorPct: err,
    verdict: v,
    source,
    code: [
      { label: t('Arduino'), code: `Serial.begin(${baud});` },
      { label: t('STM32 HAL (CubeMX)'), code: `huart2.Init.BaudRate = ${baud};\nhuart2.Init.OverSampling = UART_OVERSAMPLING_16;` },
      { label: t('Registers'), code: `USART2->BRR = ${hex(brr)}; // mantissa ${brr >> 4}, fraction ${brr & 15}` },
    ],
  };
}

// ESP32 TRM, UART: baud = UART_CLK / (CLKDIV + FRAG/16), APB_CLK 80 MHz as the source.
function espUart(clk: number, baud: number): CalcResult {
  const source = 'ESP32 TRM, UART Controller: baud rate generation (CLKDIV integer + 4-bit FRAG)';
  const div16 = Math.round((16 * clk) / baud);
  if (div16 < 16) return fail(t('{baud} baud is out of range for this UART clock.', { baud }), source);
  const actual = (16 * clk) / div16;
  const err = pct(actual, baud);
  const v = uartVerdict(err);
  return {
    ok: true,
    summary: uartSummary(clk, baud, actual, err, v),
    values: [['CLKDIV', String(div16 >> 4)], ['FRAG', String(div16 & 15)], [t('Real rate'), String(Math.round(actual))]],
    actual,
    errorPct: err,
    verdict: v,
    source,
    code: [
      { label: t('Arduino'), code: `Serial.begin(${baud});` },
      { label: t('ESP-IDF'), code: `uart_config_t cfg = { .baud_rate = ${baud}, .data_bits = UART_DATA_8_BITS, .parity = UART_PARITY_DISABLE, .stop_bits = UART_STOP_BITS_1 };\nuart_param_config(UART_NUM_1, &cfg);` },
    ],
  };
}

// Pico SDK uart_set_baudrate() (hardware_uart/uart.c), PL011 divider with 16-bit integer and 6-bit
// fraction: div = 8·clk/baud + 1, IBRD = div >> 7, FBRD = ((div & 0x7f) + 1) / 2,
// real baud = 4·clk / (64·IBRD + FBRD). RP2040 Datasheet 4.2.7.1 "Baud Rate Calculation".
function rpUart(clk: number, baud: number): CalcResult {
  const source = 'RP2040 Datasheet 4.2.7.1 Baud Rate Calculation; Pico SDK uart_set_baudrate()';
  const div = Math.floor((8 * clk) / baud) + 1;
  let ibrd = div >> 7;
  let fbrd = ((div & 0x7f) + 1) >> 1;
  if (ibrd === 0) {
    ibrd = 1;
    fbrd = 0;
  } else if (ibrd >= 65535) {
    ibrd = 65535;
    fbrd = 0;
  }
  const actual = (4 * clk) / (64 * ibrd + fbrd);
  const err = pct(actual, baud);
  const v = uartVerdict(err);
  return {
    ok: true,
    summary: uartSummary(clk, baud, actual, err, v),
    values: [['IBRD', String(ibrd)], ['FBRD', String(fbrd)], [t('Real rate'), String(Math.round(actual))]],
    actual,
    errorPct: err,
    verdict: v,
    source,
    code: [
      { label: t('Pico SDK'), code: `uint real = uart_init(uart0, ${baud}); // returns ${Math.round(actual)}\ngpio_set_function(0, GPIO_FUNC_UART);\ngpio_set_function(1, GPIO_FUNC_UART);` },
      { label: t('Arduino (Pico core)'), code: `Serial1.begin(${baud});` },
    ],
  };
}

// nRF52840 Product Specification, UARTE BAUDRATE register: only these rates exist; the real rate
// of each is in the register table ("Actual rate").
const NRF_BAUDS: [number, number][] = [
  [1200, 1205],
  [2400, 2396],
  [4800, 4808],
  [9600, 9598],
  [14400, 14401],
  [19200, 19208],
  [28800, 28777],
  [31250, 31250],
  [38400, 38369],
  [56000, 55944],
  [57600, 57554],
  [76800, 76923],
  [115200, 115108],
  [230400, 231884],
  [250000, 250000],
  [460800, 457143],
  [921600, 941176],
  [1000000, 1000000],
];
function nrfUart(baud: number): CalcResult {
  const source = 'nRF52840 Product Specification, UARTE: BAUDRATE register (actual rates)';
  const [nominal, actual] = NRF_BAUDS.reduce((a, b) => (Math.abs(b[1] - baud) < Math.abs(a[1] - baud) ? b : a));
  const err = pct(actual, baud);
  const v = uartVerdict(err);
  const name = nominal === 1000000 ? 'Baud1M' : `Baud${nominal}`;
  const summary = nominal === baud || Math.abs(err) < 0.001 ? uartSummary(0, baud, actual, err, v, true) : uartSummary(0, baud, actual, err, v, true) + ' ' + t('The nearest setting is {nominal}.', { nominal });
  return {
    ok: true,
    summary,
    values: [['BAUDRATE', `UARTE_BAUDRATE_BAUDRATE_${name}`], [t('Real rate'), String(actual)]],
    actual,
    errorPct: err,
    verdict: v,
    source,
    code: [
      { label: t('Arduino'), code: `Serial1.begin(${nominal});` },
      { label: t('Registers'), code: `NRF_UARTE0->BAUDRATE = UARTE_BAUDRATE_BAUDRATE_${name};` },
    ],
  };
}

/* ------------------------------------------------------------------ ADC */

export interface AdcOption {
  id: string;
  label: string;
}

const AVR_ADC_PRESCALERS = [2, 4, 8, 16, 32, 64, 128];
const STM32_SAMPLE_CYCLES = [3, 15, 28, 56, 84, 112, 144, 480];
const STM32_ADC_PRESCALERS = [2, 4, 6, 8];
const NRF_TACQ_US = [3, 5, 10, 15, 20, 40];

/** The settings the user can pick for the ADC on this board. */
export function adcOptions(board: BoardDef): AdcOption[] {
  const f = board.family;
  if (f === 'avr') return AVR_ADC_PRESCALERS.map((p) => ({ id: String(p), label: p === 128 ? t('Prescaler {p} (Arduino default)', { p }) : t('Prescaler {p}', { p }) }));
  if (f === 'stm32')
    return STM32_ADC_PRESCALERS.flatMap((p) => STM32_SAMPLE_CYCLES.map((c) => ({ id: `${p}:${c}`, label: t('PCLK2 / {p}, sample time {c} cycles', { p, c }) })));
  if (isRp(f)) return [0, 96, 480, 960, 9600, 47999].map((d) => ({ id: String(d), label: d === 0 ? t('Back to back (CLKDIV 0)') : t('CLKDIV {d}', { d }) }));
  if (f === 'nrf52') return NRF_TACQ_US.map((us) => ({ id: String(us), label: t('Acquisition time {us} µs', { us }) }));
  return [];
}

export function adcCalc(board: BoardDef, adcClockHz: number, optionId: string): CalcResult {
  const f = board.family;
  if (f === 'avr') {
    // ATmega328P datasheet, ADC "Prescaling and Conversion Timing": a normal conversion takes 13
    // ADC clocks (25 for the first); 50 to 200 kHz is needed for full 10-bit resolution.
    const source = 'ATmega328P datasheet, ADC: Prescaling and Conversion Timing (13 ADC clocks; 50–200 kHz for 10 bits)';
    const p = Number(optionId) || 128;
    const adc = adcClockHz / p;
    const rate = adc / 13;
    const warn = adc > 200000 ? ' ' + t('The ADC clock is above 200 kHz, so you get less than 10-bit accuracy.') : adc < 50000 ? ' ' + t('The ADC clock is below 50 kHz, which the datasheet does not recommend.') : '';
    return {
      ok: true,
      summary: t('ADC clock {adc}: one conversion takes {us} µs, so at most about {rate} readings per second.', { adc: fmtHz(adc), us: Math.round((13 / adc) * 1e7) / 10, rate: Math.round(rate) }) + warn,
      values: [[t('ADC clock'), fmtHz(adc)], [t('Conversion'), `13 ${t('clocks')}`], [t('Max rate'), `${Math.round(rate)} /s`]],
      actual: rate,
      source,
      code: [{ label: t('Registers'), code: `// ADPS2:0 selects the prescaler (${p})\nADCSRA = (ADCSRA & ~0x07) | ${AVR_ADC_PRESCALERS.indexOf(p) + 1};` }],
    };
  }
  if (f === 'stm32') {
    // RM0368 11.5 "Channel-wise programmable sampling time": Tconv = sampling time + 12 cycles.
    // STM32F401 datasheet: fADC max 36 MHz (VDDA 2.4 to 3.6 V).
    const source = 'RM0368 11.5 Channel-wise programmable sampling time (Tconv = sampling + 12 cycles); fADC max 36 MHz';
    const [p, c] = optionId.split(':').map(Number);
    const adc = adcClockHz / (p || 4);
    const cycles = (c || 15) + 12;
    const rate = adc / cycles;
    if (adc > 36e6) return fail(t('The ADC clock would be {adc}, above the 36 MHz limit. Pick a bigger prescaler.', { adc: fmtHz(adc) }), source);
    return {
      ok: true,
      summary: t('ADC clock {adc}: one conversion takes {us} µs, so at most about {rate} readings per second.', { adc: fmtHz(adc), us: Math.round((cycles / adc) * 1e8) / 100, rate: Math.round(rate) }),
      values: [[t('ADC clock'), fmtHz(adc)], [t('Conversion'), `${cycles} ${t('clocks')}`], [t('Max rate'), `${Math.round(rate)} /s`]],
      actual: rate,
      source,
      code: [
        {
          label: t('STM32 HAL (CubeMX)'),
          code: `hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV${p};\nsConfig.SamplingTime = ADC_SAMPLETIME_${c}CYCLES;`,
        },
      ],
    };
  }
  if (isRp(f)) {
    // RP2040 Datasheet 4.9 ADC: 48 MHz clock, 96 cycles per conversion (500 kS/s). With DIV set,
    // conversions start every 1 + INT + FRAC/256 cycles (4.9.2.1), never faster than 96.
    const source = 'RP2040 Datasheet 4.9 ADC (96 cycles per conversion at 48 MHz; DIV register)';
    const d = Number(optionId) || 0;
    const period = Math.max(96, 1 + d);
    const rate = adcClockHz / period;
    return {
      ok: true,
      summary: t('One conversion every {us} µs, so {rate} readings per second.', { us: Math.round((period / adcClockHz) * 1e8) / 100, rate: Math.round(rate) }),
      values: [[t('ADC clock'), fmtHz(adcClockHz)], ['CLKDIV', String(d)], [t('Max rate'), `${Math.round(rate)} /s`]],
      actual: rate,
      source,
      code: [{ label: t('Pico SDK'), code: `adc_init();\nadc_gpio_init(26);\nadc_select_input(0);\nadc_set_clkdiv(${d}); // ${Math.round(rate)} samples/s with adc_run(true) and the FIFO` }],
    };
  }
  if (f === 'nrf52') {
    // nRF52840 PS, SAADC: conversion time tCONV < 2 µs; sample time = TACQ + tCONV.
    const source = 'nRF52840 Product Specification, SAADC: TACQ and tCONV (< 2 µs)';
    const us = Number(optionId) || 10;
    const rate = 1e6 / (us + 2);
    return {
      ok: true,
      summary: t('One reading takes about {us} µs, so at most about {rate} readings per second.', { us: us + 2, rate: Math.round(rate) }),
      values: [['TACQ', `${us} µs`], [t('Max rate'), `${Math.round(rate)} /s`]],
      actual: rate,
      source,
      code: [{ label: t('Registers'), code: `NRF_SAADC->CH[0].CONFIG = (SAADC_CH_CONFIG_TACQ_${us}us << SAADC_CH_CONFIG_TACQ_Pos);` }],
    };
  }
  if (isEsp(f)) return fail(t('Espressif does not publish a fixed conversion time for analogRead(). Measure it in your sketch with micros() around a few hundred reads.'));
  return fail(t('There is no ADC calculator for this chip yet.'));
}
