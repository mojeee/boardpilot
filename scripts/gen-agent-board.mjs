#!/usr/bin/env node
// Generates firmware/agent/bp_board.h (the board facts the diagnostic agent needs) from
// boards/<boardId>.json.
//
//   node scripts/gen-agent-board.mjs esp32-devkitc-30            writes firmware/agent/bp_board.h
//   node scripts/gen-agent-board.mjs esp32-devkitc-30 --out x.h  writes x.h
//   node scripts/gen-agent-board.mjs esp32-devkitc-30 --stdout   prints it
//
// Pin facts come from the board file (pin gpio numbers and flags). A few chip-level facts that the
// board file does not list, because the pins are not on the header (ESP32 flash pins, GPIO 0),
// come from the FAMILY table below, with the datasheet section they come from.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/**
 * Chip facts per board family.
 *  chipGpios   every GPIO that exists on the chip (ESP only; other families: the header pins).
 *  flash       pins wired to the SPI flash (never touched).
 *  strapping   strapping pins, read at boot and reported in the boot event.
 *  inputOnly   pads without an output driver.
 *  noPull      pads without internal pull-up / pull-down.
 *  adc         ADC-capable pads.
 *  adcBits     resolution the agent reads the ADC with.
 *  noun        how the protocol pin numbers are called in messages ("GPIO" or "pin").
 */
const FAMILY = {
  // ESP32 Series Datasheet v4.x: section 2.2 "Pin Description" (GPIO 0-19, 21-23, 25-27, 32-39),
  // section 2.4 "Strapping Pins" (GPIO 0, 2, 5, 12, 15), section 4.1.1 (GPIO 34-39 input only, no
  // pulls), section 4.1.2 ADC (ADC1: 32-39, ADC2: 0, 2, 4, 12-15, 25-27).
  // ESP32-WROOM-32 datasheet, "Pin Description": GPIO 6-11 connect to the integrated SPI flash.
  esp32: {
    chipGpios: [...range(0, 19), ...range(21, 23), ...range(25, 27), ...range(32, 39)],
    flash: range(6, 11),
    strapping: [0, 2, 5, 12, 15],
    inputOnly: range(34, 39),
    noPull: range(34, 39),
    adc: [32, 33, 34, 35, 36, 39, 0, 2, 4, 12, 13, 14, 15, 25, 26, 27],
    adc1: [32, 33, 34, 35, 36, 39],
    adcBits: 12,
    noun: 'GPIO',
  },
  // ESP32-S3 Series Datasheet v1.x: section 2.3 "Pin Overview" (GPIO 0-21, 26-48), section 2.3.4 /
  // 3.1 "Strapping Pins" (GPIO 0, 3, 45, 46), section 2.3 note: GPIO 26-32 are used by the SPI
  // flash / PSRAM of the module; section 2.3.4 ADC (ADC1: GPIO 1-10, ADC2: GPIO 11-20).
  esp32s3: {
    chipGpios: [...range(0, 21), ...range(26, 48)],
    flash: range(26, 32),
    strapping: [0, 3, 45, 46],
    inputOnly: [],
    noPull: [],
    adc: range(1, 20),
    adc1: range(1, 10),
    adcBits: 12,
    noun: 'GPIO',
  },
  // ESP32-C3 Series Datasheet v1.x: section 2.2 "Pin Description" (GPIO 0-21), section 2.4
  // "Strapping Pins" (GPIO 2, 8, 9), SPI flash pins GPIO 12-17, ADC1: GPIO 0-4, ADC2: GPIO 5.
  esp32c3: {
    chipGpios: range(0, 21),
    flash: range(12, 17),
    strapping: [2, 8, 9],
    inputOnly: [],
    noPull: [],
    adc: range(0, 5),
    adc1: range(0, 4),
    adcBits: 12,
    noun: 'GPIO',
  },
  // RP2040 / RP2350 datasheets, chapter "ADC": 12-bit SAR ADC.
  rp2040: { adcBits: 12, noun: 'GPIO' },
  rp2350: { adcBits: 12, noun: 'GPIO' },
  // ATmega328P / ATmega2560 datasheets, chapter "Analog-to-Digital Converter": 10-bit ADC.
  avr: { adcBits: 10, noun: 'pin' },
  // STM32F401/F411 reference manual RM0368/RM0383, chapter "ADC": 12-bit ADC.
  stm32: { adcBits: 12, noun: 'pin' },
  // nRF52840 Product Specification, chapter "SAADC": up to 14-bit, 12-bit used.
  nrf52: { adcBits: 12, noun: 'pin' },
  // i.MX RT1060 reference manual, chapter "ADC": 12-bit (Teensy 4.x).
  imxrt: { adcBits: 12, noun: 'pin' },
};

/** "GPIO 6 to 11", "GPIO 1 and 3", "GPIO 2, 5 and 9", or with labels "D0 and D1". */
function listText(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return String(items[0]);
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
function gpioRangeText(nums) {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  // Runs of three or more consecutive numbers become "a to b".
  const parts = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    if (j - i >= 2) parts.push(`${s[i]} to ${s[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(s[k]));
    i = j + 1;
  }
  return listText(parts);
}

function cString(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function generate(board) {
  const fam = FAMILY[board.family];
  if (!fam) throw new Error(`Unknown board family "${board.family}".`);
  const isEsp = board.family.startsWith('esp32');

  const gpioPins = board.pins.filter((p) => p.kind === 'gpio' && Number.isInteger(p.gpio));
  const header = [...new Set(gpioPins.map((p) => p.gpio))].sort((a, b) => a - b);
  const withFlag = (f) => [...new Set(gpioPins.filter((p) => p.flags.includes(f)).map((p) => p.gpio))];
  const idsWithFlag = (f) => {
    const seen = new Set();
    const out = [];
    for (const p of gpioPins) {
      if (!p.flags.includes(f) || p.sameAs || seen.has(p.gpio)) continue;
      seen.add(p.gpio);
      out.push(p);
    }
    // Pin ids (D0, A6, PA11): plain ASCII, and the names the app shows (labels can hold arrows).
    return out.sort((a, b) => a.gpio - b.gpio).map((p) => p.id);
  };

  const valid = [...new Set([...(fam.chipGpios ?? []), ...header])].sort((a, b) => a - b);
  const flash = [...new Set([...(fam.flash ?? []), ...withFlag('flash')])];
  const uart = withFlag('uart0');
  const inputOnly = [...new Set([...(fam.inputOnly ?? []), ...withFlag('input_only')])];
  const noPull = [...new Set([...(fam.noPull ?? []), ...withFlag('no_internal_pull'), ...inputOnly])];
  const adc = [...new Set([...(fam.adc ?? []), ...withFlag('adc'), ...withFlag('adc1'), ...withFlag('adc2')])];
  // USB data lines and the debug port: touching them (even as an input) cuts the USB link or the
  // debug probe, so the agent refuses them. Pins flagged "reserved" stay usable on request, but the
  // agent does not reconfigure them at start-up.
  const usb = withFlag('usb');
  const swd = withFlag('swd');
  const blocked = [...new Set([...usb, ...swd])];
  const reserved = withFlag('reserved');
  const strapping = [...new Set([...(fam.strapping ?? []), ...withFlag('strapping'), ...withFlag('strapping_critical')])]
    .filter((g) => valid.includes(g))
    .sort((a, b) => a - b);

  const maxGpio = Math.max(...valid, ...flash, 0);
  const count = maxGpio + 1;
  if (count > 255) throw new Error('GPIO numbers above 254 are not supported by the agent.');
  const bytes = Math.ceil(count / 8);
  const bitmap = (nums) => {
    const b = new Array(bytes).fill(0);
    for (const g of nums) if (g >= 0 && g < count) b[g >> 3] |= 1 << (g & 7);
    return '{' + b.map((v) => '0x' + v.toString(16).toUpperCase().padStart(2, '0')).join(', ') + '}';
  };

  // Messages (plain language, same wording as the original ESP32 agent).
  const noun = fam.noun;
  const pinsText = (flag, nums) => (isEsp ? `GPIO ${gpioRangeText(nums)}` : listText(idsWithFlag(flag)));
  const plural = (nums) => nums.length !== 1;
  const chipOrBoard = isEsp || board.family.startsWith('rp') ? board.chip : board.name;
  const msgBadPin = `This ${noun} number does not exist on the ${chipOrBoard}.`;
  const msgFlash = flash.length
    ? `${pinsText('flash', flash)} ${plural(flash) ? 'are' : 'is'} wired to the ${isEsp ? 'internal flash' : 'flash memory'}. Using ${plural(flash) ? 'them' : 'it'} would crash the board.`
    : 'This pin is wired to the flash memory. Using it would crash the board.';
  const msgUart = uart.length
    ? `${pinsText('uart0', uart)} ${plural(uart) ? 'carry' : 'carries'} the serial link to the computer. Using ${plural(uart) ? 'them' : 'it'} would cut the connection.`
    : 'This pin carries the serial link to the computer. Using it would cut the connection.';
  const msgInputOnly = inputOnly.length
    ? `${pinsText('input_only', inputOnly)} ${plural(inputOnly) ? 'are' : 'is'} input only. ${plural(inputOnly) ? 'They' : 'It'} cannot drive a signal or be used as I2C lines.`
    : 'This pin is input only. It cannot drive a signal or be used as I2C lines.';
  const blockedIds = [...idsWithFlag('usb'), ...idsWithFlag('swd')];
  const blockedWhat = usb.length && swd.length ? 'the USB connection and the debug probe' : usb.length ? 'the USB connection' : 'the debug probe';
  const msgBlocked = blocked.length
    ? `${isEsp ? `GPIO ${gpioRangeText(blocked)}` : listText(blockedIds)} ${plural(blocked) ? 'are' : 'is'} used by ${blockedWhat}. The agent leaves ${plural(blocked) ? 'them' : 'it'} alone so the link keeps working.`
    : 'This pin is used by the USB connection or the debug probe. The agent leaves it alone.';

  const i2cSda = board.pins.find((p) => p.id === board.rules?.i2c?.sda)?.gpio ?? header[0] ?? 0;
  const i2cScl = board.pins.find((p) => p.id === board.rules?.i2c?.scl)?.gpio ?? header[1] ?? 1;
  let adcHint;
  if (isEsp) {
    const a1 = fam.adc1.filter((g) => valid.includes(g));
    adcHint = `best GPIO ${Math.min(...a1)} to ${Math.max(...a1)}`;
  } else {
    const first = board.pins.find((p) => p.id === board.rules?.adcPins?.[0]);
    adcHint = first ? `for example ${first.id}` : 'marked A0, A1 and so on';
  }
  const msgNotAdcFmt = isEsp
    ? `GPIO %d cannot measure voltage. Use an ADC pin, ${adcHint}.`
    : `This pin (%d) cannot measure voltage. Use an analog pin, ${adcHint}.`;

  const lines = [];
  const L = (s = '') => lines.push(s);
  L(`// Generated by scripts/gen-agent-board.mjs from boards/${board.id}.json. Do not edit by hand:`);
  L(`//   node scripts/gen-agent-board.mjs ${board.id}`);
  L('// The committed copy is for the ESP32 DevKit, so the sketch also compiles on its own.');
  L('// Pin numbers are the ones used in Arduino code (PinDef.gpio in shared/types.ts).');
  L('#pragma once');
  L();
  L(`#define BP_BOARD_ID ${cString(board.id)}`);
  L(`#define BP_BOARD_FAMILY ${cString(board.family)}`);
  L(`#define BP_FAMILY_${board.family.toUpperCase()} 1`);
  L(`// Chip name reported by "hello" where the core cannot read it from the chip.`);
  L(`#define BP_CHIP_NAME ${cString(board.chip)}`);
  L(`// Word used for pin numbers in messages.`);
  L(`#define BP_PIN_NOUN ${cString(noun)}`);
  L();
  if (board.family === 'nrf52' && board.toolchain?.link === 'debug-probe') {
    // nRF52840 DK: the USB port of the on-board J-Link (interface MCU) is a virtual COM port wired
    // to P0.06 (TXD) / P0.08 (RXD) (nRF52840 DK User Guide, "Virtual COM port"). bp_port.h picks
    // the core's UART on those pins; Serial is the nRF52840's own USB port.
    L(`// Talk on the debug probe's virtual COM port (a UART), not the native USB port.`);
    L(`#define BP_SERIAL_DEBUG_VCP 1`);
    L();
  }
  L(`// ADC: full scale (rules.adcMaxMv) and the resolution the agent reads with.`);
  L(`#define BP_ADC_MAX_MV ${board.rules.adcMaxMv}`);
  L(`#define BP_ADC_BITS ${fam.adcBits}`);
  L();
  L(`// Default I2C pins of the board (used as examples in messages).`);
  L(`#define BP_EXAMPLE_SDA ${i2cSda}`);
  L(`#define BP_EXAMPLE_SCL ${i2cScl}`);
  L();
  L(`// Pins on the header, reported by the "pins" command.`);
  L(`#define BP_HEADER_PIN_COUNT ${header.length}`);
  L(`#define BP_HEADER_PINS {${header.join(', ')}}`);
  L();
  L(`// Strapping pins, read at boot (none: the boot event has no "strapping" field).`);
  L(`#define BP_STRAP_COUNT ${strapping.length}`);
  if (strapping.length) L(`#define BP_STRAP_PINS {${strapping.join(', ')}}`);
  L();
  L(`// Bitmaps over pin numbers 0..BP_GPIO_COUNT-1 (bit g of byte g/8).`);
  L(`#define BP_GPIO_COUNT ${count}`);
  L(`#define BP_MAP_BYTES ${bytes}`);
  L(`// Pins that exist.`);
  L(`#define BP_MAP_VALID ${bitmap(valid)}`);
  L(`// Wired to the flash: always refused.${flash.length ? ' ' + JSON.stringify(flash.sort((a, b) => a - b)) : ''}`);
  L(`#define BP_MAP_FLASH ${bitmap(flash)}`);
  L(`// Carry the agent's serial link (uart0): always refused, reported as mode "uart".${uart.length ? ' ' + JSON.stringify(uart.sort((a, b) => a - b)) : ''}`);
  L(`#define BP_MAP_UART ${bitmap(uart)}`);
  L(`// USB data lines and debug port: always refused.${blocked.length ? ' ' + JSON.stringify(blocked.sort((a, b) => a - b)) : ''}`);
  L(`#define BP_MAP_BLOCKED ${bitmap(blocked)}`);
  L(`// Input only: outputs, PWM and I2C refused.${inputOnly.length ? ' ' + JSON.stringify(inputOnly.sort((a, b) => a - b)) : ''}`);
  L(`#define BP_MAP_INPUT_ONLY ${bitmap(inputOnly)}`);
  L(`// No internal pull-up / pull-down.`);
  L(`#define BP_MAP_NO_PULL ${bitmap(noPull)}`);
  L(`// ADC capable.`);
  L(`#define BP_MAP_ADC ${bitmap(adc)}`);
  L(`// Used by something on the board: left alone at start-up, usable on request.${reserved.length ? ' ' + JSON.stringify(reserved.sort((a, b) => a - b)) : ''}`);
  L(`#define BP_MAP_RESERVED ${bitmap(reserved)}`);
  L();
  L(`// Messages.`);
  L(`#define BP_MSG_BAD_PIN ${cString(msgBadPin)}`);
  L(`#define BP_MSG_FLASH ${cString(msgFlash)}`);
  L(`#define BP_MSG_UART ${cString(msgUart)}`);
  L(`#define BP_MSG_BLOCKED ${cString(msgBlocked)}`);
  L(`#define BP_MSG_INPUT_ONLY ${cString(msgInputOnly)}`);
  L(`#define BP_MSG_NOT_ADC_FMT ${cString(msgNotAdcFmt)}`);
  L();
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--'));
  if (!id) {
    console.error('Usage: node scripts/gen-agent-board.mjs <boardId> [--out file.h | --stdout]');
    process.exit(2);
  }
  const board = JSON.parse(readFileSync(join(ROOT, 'boards', `${id}.json`), 'utf8'));
  const text = generate(board);
  if (args.includes('--stdout')) {
    process.stdout.write(text);
    return;
  }
  const oi = args.indexOf('--out');
  const out = oi >= 0 ? args[oi + 1] : join(ROOT, 'firmware', 'agent', 'bp_board.h');
  writeFileSync(out, text);
  console.log(`Wrote ${out} for ${board.id}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
