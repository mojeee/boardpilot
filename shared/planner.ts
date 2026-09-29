// Peripheral and pin planner: the user says what the project needs (1 × I2C, 2 × PWM, 3 × analog
// inputs…) and the planner picks pins from the board file only, explaining every choice. Nothing is
// hard-coded to a board: defaults, safe pins, ADC pins and pin functions all come from /boards.

import type { BoardDef, PinDef, Scene } from './types';
import { canOutput, isAdcPin, isEspFamily, pinById } from './board';
import { t } from './i18n';

export interface PlanRequest {
  i2c: number;
  spi: number;
  uart: number;
  pwm: number;
  adc: number;
  out: number;
  in: number;
  /** ESP32: Wi-Fi on (ADC2 pins stop working) */
  wifi?: boolean;
}

export interface PlanPin {
  /** what it is for, e.g. "I2C SDA", "PWM 1" */
  need: string;
  /** code name, e.g. I2C_SDA, PWM_1 */
  name: string;
  pin: PinDef;
  why: string;
}

export interface Plan {
  pins: PlanPin[];
  problems: string[];
  /** #define lines for the code */
  defines: string;
}

/** How a pin is written in Arduino code on this board (GPIO number, STM32 name, nRF header number). */
export function codePinName(board: BoardDef, p: PinDef): string {
  if (p.gpio === null) return p.label;
  if (board.family === 'stm32') return p.chipPin ?? (/^P[A-K]\d+$/.test(p.id) ? p.id : String(p.gpio));
  if (board.family === 'nrf52') return p.id.replace(/^D/, '');
  return String(p.gpio);
}

/** Hardware UART units on the board: unit name → TX and RX pins (from pin function names). */
function uartUnits(board: BoardDef): Map<string, { tx?: PinDef; rx?: PinDef }> {
  const units = new Map<string, { tx?: PinDef; rx?: PinDef }>();
  for (const p of board.pins) {
    if (p.kind !== 'gpio') continue;
    for (const f of p.functions) {
      const m = /^(?:UART(\d*)_?|U(\d)|Serial(\d))(TX|RX)D?$/.exec(f);
      if (!m) continue;
      const key = m[3] !== undefined ? `Serial${m[3]}` : `UART${m[1] ?? m[2] ?? ''}`;
      const u = units.get(key) ?? {};
      if (m[4] === 'TX') u.tx ??= p;
      else u.rx ??= p;
      units.set(key, u);
    }
  }
  return units;
}

export function planPins(board: BoardDef, req: PlanRequest, scene?: Scene): Plan {
  const used = new Set<string>();
  // Pins already wired in the project stay as they are.
  for (const w of scene?.wires ?? []) {
    if (w.from.part === 'board') used.add(w.from.pin);
    if (w.to.part === 'board') used.add(w.to.pin);
  }
  const out: PlanPin[] = [];
  const problems: string[] = [];
  const ds = board.rules.datasheet;
  const free = (p: PinDef | undefined): p is PinDef => !!p && p.kind === 'gpio' && !used.has(p.id) && !p.flags.includes('flash');
  const take = (need: string, name: string, p: PinDef, why: string) => {
    used.add(p.id);
    out.push({ need, name, pin: p, why });
  };
  const safeOutputs = () => board.rules.safeIo.map((id) => pinById(board, id)).filter(free).filter(canOutput);

  // I2C: the board's default pins (the ones libraries use without setup).
  for (let i = 0; i < Math.min(req.i2c, 1); i++) {
    const sda = pinById(board, board.rules.i2c.sda);
    const scl = pinById(board, board.rules.i2c.scl);
    if (free(sda) && free(scl)) {
      const why = board.rules.i2c.remappable
        ? t('Default I2C pins of this board ({ds}). Any GPIO works on this chip, but libraries expect these.', { ds })
        : t('The I2C pins of this board are fixed ({ds}).', { ds });
      take('I2C SDA', 'I2C_SDA', sda, why);
      take('I2C SCL', 'I2C_SCL', scl, why);
    } else problems.push(t('The default I2C pins are already in use.'));
  }
  if (req.i2c > 1) problems.push(t('One I2C bus is enough for many parts: they share SDA and SCL, each at its own address.'));

  // SPI: the default bus from the board file, and one chip-select per device.
  if (req.spi > 0) {
    const spi = board.rules.spi;
    if (!spi) problems.push(t('This board file has no default SPI pins.'));
    else {
      const why = t('Default SPI pins of this board ({ds}).', { ds });
      for (const [need, name, id] of [
        ['SPI MOSI', 'SPI_MOSI', spi.mosi],
        ['SPI MISO', 'SPI_MISO', spi.miso],
        ['SPI SCK', 'SPI_SCK', spi.sck],
      ] as const) {
        const p = pinById(board, id);
        if (free(p)) take(need, name, p, why);
        else problems.push(t('{need} ({pin}) is already in use.', { need, pin: (p as PinDef | undefined)?.label ?? id }));
      }
      for (let i = 0; i < req.spi; i++) {
        const cs = i === 0 ? pinById(board, spi.cs) : undefined;
        const p = free(cs) && canOutput(cs) ? cs : safeOutputs()[0];
        if (p) take(`SPI CS ${i + 1}`, `SPI_CS_${i + 1}`, p, i === 0 && p === cs ? why : t('Chip select: any free output pin; one per SPI device.'));
        else problems.push(t('No free output pin left for SPI chip select {n}.', { n: i + 1 }));
      }
    }
  }

  // UART: a hardware serial port that is not the USB one.
  for (let i = 0; i < req.uart; i++) {
    const unit = [...uartUnits(board).entries()].find(
      ([, u]) => free(u.tx) && free(u.rx) && !u.tx.flags.includes('uart0') && !u.rx.flags.includes('uart0') && !u.tx.flags.includes('usb'),
    );
    if (unit && unit[1].tx && unit[1].rx) {
      const why = t('Hardware serial port {unit}, separate from the USB serial ({ds}). Connect its TX to the other device’s RX.', { unit: unit[0], ds });
      take(`UART ${i + 1} TX`, `UART${i + 1}_TX`, unit[1].tx, why);
      take(`UART ${i + 1} RX`, `UART${i + 1}_RX`, unit[1].rx, why);
    } else {
      const pins = safeOutputs().slice(0, 2);
      problems.push(t('No free hardware serial port besides the USB one. Use a software serial port on two free pins, at 9600 baud or less.'));
      if (pins.length === 2) {
        const why = t('Software serial: any two free pins.');
        take(`UART ${i + 1} TX`, `UART${i + 1}_TX`, pins[0], why);
        take(`UART ${i + 1} RX`, `UART${i + 1}_RX`, pins[1], why);
      }
    }
  }

  // Analog inputs: the board's ADC pins in its order of preference; on ESP32 with Wi-Fi only ADC1.
  const adcList = board.rules.adcPins.map((id) => pinById(board, id)).filter(free).filter(isAdcPin);
  const adcOk = req.wifi && board.rules.adcWifiConflict ? adcList.filter((p) => !p.flags.includes('adc2')) : adcList;
  for (let i = 0; i < req.adc; i++) {
    const p = adcOk.find((x) => !used.has(x.id));
    if (!p) {
      problems.push(
        req.wifi && board.rules.adcWifiConflict
          ? t('Not enough analog pins that work with Wi-Fi on (ADC1). Use fewer analog inputs, or an external ADC such as the ADS1115.')
          : t('Not enough free analog pins on this board. An external ADC such as the ADS1115 adds 4 more.'),
      );
      break;
    }
    take(`ADC ${i + 1}`, `ADC_${i + 1}`, p, p.flags.includes('adc1') && board.rules.adcWifiConflict ? t('ADC1 pin: keeps working with Wi-Fi on ({ds}).', { ds }) : t('Analog input ({ds}).', { ds }));
  }

  // PWM: pins with a PWM function, or any output pin where the chip can route PWM anywhere (ESP32 LEDC).
  const anyPinPwm = isEspFamily(board);
  for (let i = 0; i < req.pwm; i++) {
    const p = safeOutputs().find((x) => anyPinPwm || x.functions.some((f) => /PWM/.test(f)));
    if (!p) {
      problems.push(t('No free PWM-capable pin left.'));
      break;
    }
    take(`PWM ${i + 1}`, `PWM_${i + 1}`, p, anyPinPwm ? t('Any output pin can make PWM on this chip (LEDC); this one has no side effects at boot.') : t('This pin has a hardware PWM output ({fn}).', { fn: p.functions.find((f) => /PWM/.test(f)) ?? 'PWM' }));
  }

  // Plain digital outputs and inputs: the board's safe pins (inputs first on input-only pins).
  for (let i = 0; i < req.out; i++) {
    const p = safeOutputs()[0];
    if (!p) {
      problems.push(t('No free output pin left.'));
      break;
    }
    take(`OUT ${i + 1}`, `OUT_${i + 1}`, p, t('A safe output: not a strapping, flash or USB pin.'));
  }
  const inputs = [...(board.rules.inputPins ?? []), ...board.rules.safeIo].map((id) => pinById(board, id)).filter(free);
  for (let i = 0; i < req.in; i++) {
    const p = inputs.find((x) => !used.has(x.id));
    if (!p) {
      problems.push(t('No free input pin left.'));
      break;
    }
    take(
      `IN ${i + 1}`,
      `IN_${i + 1}`,
      p,
      p.flags.includes('input_only')
        ? t('Input-only pin: fine for a button or sensor, and keeps output pins free. No internal pull-up: add a 10 kΩ resistor.')
        : t('A safe input: not a strapping, flash or USB pin. Use INPUT_PULLUP for a button to GND.'),
    );
  }

  const defines = out.map((x) => `#define ${x.name.padEnd(10)} ${codePinName(board, x.pin).padEnd(5)} // ${x.pin.label}`).join('\n');
  return { pins: out, problems, defines };
}

export function planToMarkdown(board: BoardDef, plan: Plan): string {
  return [
    `# ${t('Pin plan for {board}', { board: board.name })}`,
    '',
    `| ${t('Use')} | ${t('Pin')} | ${t('Why')} |`,
    '|---|---|---|',
    ...plan.pins.map((p) => `| ${p.need} | ${p.pin.label}${p.pin.gpio !== null ? ` (GPIO ${p.pin.gpio})` : ''} | ${p.why.replace(/\|/g, '\\|')} |`),
    ...(plan.problems.length ? ['', `## ${t('To check')}`, '', ...plan.problems.map((x) => `- ${x}`)] : []),
    '',
    '```cpp',
    plan.defines,
    '```',
    '',
  ].join('\n');
}
