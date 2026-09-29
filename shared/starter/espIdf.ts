// ESP-IDF starter project for ESP32 family boards (ESP32, ESP32-S3, ESP32-C3), generated from
// the project scene.
//
// Output: the standard idf.py layout: CMakeLists.txt, main/CMakeLists.txt, main/main.c,
// sdkconfig.defaults and README.md. main.c uses only the GPIOs wired in the scene, with the numbers
// from the board file. ESP32 chips route I2C, SPI and LEDC (PWM) through the GPIO matrix, so any
// output-capable pin works for them; what the board file says a pin cannot do (input only, flash,
// no internal pull-up, not an ADC1 input) decides the rest. ADC channels are looked up at run time
// with adc_oneshot_io_to_channel(), never hard-coded. Part "drivers" stay trivial, as in the Pico
// SDK starter: a chip id register when the part file documents one (idCheck), an address probe
// otherwise, a digital level or a calibrated ADC reading.

import type { BoardDef, PartDef, Scene } from '../types';
import { isEspFamily, pinById } from '../board';
import { pwmCalc } from '../clocks';
import { t } from '../i18n';
import {
  boardSource,
  cIdent,
  cStr,
  hex2,
  i2cAddresses,
  i2cPairs,
  isButton,
  isLed,
  oneLine,
  partSource,
  pinClaims,
  sceneParts,
  sceneSignals,
  sceneTag,
  slug,
  wiringComment,
  wiringTable,
  type Signal,
  type StarterProject,
} from './common';

/** The CMake project name (build/boardpilot_starter.bin). */
export const IDF_PROJECT = 'boardpilot_starter';
/** Oldest ESP-IDF this builds with: driver/i2c_master.h arrived in 5.2, the esp_driver_* components in 5.3. */
export const IDF_MIN_VERSION = '5.3';

/** I2C clock for every part: 100 kHz standard mode, which every I2C part supports. */
const I2C_HZ = 100_000;
/** Timeout of each I2C transfer, so a missing part prints a message instead of hanging. */
const I2C_TIMEOUT_MS = 50;
/** LED PWM frequency. */
const PWM_HZ = 1000;
/** LEDC channels the starter uses at most: the ESP32-C3 has 6 (the ESP32 and ESP32-S3 have 8). */
const LEDC_CHANNELS = 6;
/** Main loop period and how often values are printed. */
const TICK_MS = 20;
const REPORT_TICKS = 50;

export const isIdfBoard = (b: BoardDef) => isEspFamily(b) && !!b.toolchain.idfTarget;

export interface EspIdfOptions {
  /** Project name for the header and the folder, e.g. the template name. */
  name?: string;
}

export function generateEspIdf(scene: Scene, board: BoardDef, parts: Record<string, PartDef>, opts: EspIdfOptions = {}): StarterProject {
  const name = opts.name?.trim() || 'BoardPilot project';
  const target = board.toolchain.idfTarget ?? board.family;
  const tag = sceneTag(scene);
  const notes: string[] = [];
  const signals = sceneSignals(scene, board, parts);
  const { claim } = pinClaims(notes);
  const matrixSrc = boardSource(board, /GPIO Matrix/i) ?? boardSource(board, /IO_MUX|Pin Description/i) ?? `${board.rules.datasheet}, IO MUX and GPIO matrix`;
  const adcSrc = boardSource(board, /ADC Oneshot/i) ?? `ESP-IDF Programming Guide (${target}), ADC Oneshot Mode Driver`;

  const defines: string[] = [];
  const globals: string[] = [];
  const helpers: string[] = [];
  const setup: string[] = [];
  const fast: string[] = [];
  const report: string[] = [];
  const requires = new Set<string>();
  const includes = new Set<string>(['#include <stdio.h>', '#include <stdint.h>', '#include <stdbool.h>', '#include "freertos/FreeRTOS.h"', '#include "freertos/task.h"']);
  const useGpio = () => {
    requires.add('esp_driver_gpio');
    includes.add('#include "driver/gpio.h"');
  };
  const defined = new Set<string>();
  const define = (macro: string, gpio: number, comment: string) => {
    if (defined.has(macro)) return;
    defined.add(macro);
    defines.push(`#define ${macro} GPIO_NUM_${gpio}`.padEnd(34) + `// ${oneLine(comment)}`);
  };
  const who = (s: Signal) => `${s.inst.label ?? s.def.name} ${s.pin}`;
  /** Pins the chip cannot use for this job: a note, and false. */
  const usable = (s: Signal, output: boolean): boolean => {
    if (s.board.flags.includes('flash')) {
      notes.push(t('{pin} is connected to the flash or PSRAM chip, so the starter does not use it for {part}. Move the wire to a free pin.', { pin: s.board.label, part: who(s) }));
      return false;
    }
    if (output && s.board.flags.includes('input_only')) {
      notes.push(t('{pin} can only be an input, so the starter cannot drive {part} there. Move the wire to an output-capable pin.', { pin: s.board.label, part: who(s) }));
      return false;
    }
    return true;
  };

  /* ---------------- I2C: one bus per SDA/SCL pair, any output-capable pins ---------------- */
  const { pairs, lone, i2cParts } = i2cPairs(scene, signals, notes);
  for (const s of lone) {
    claim(s, `${s.inst.id}.${s.pin}`);
    define(`${cIdent(s.inst.id)}_${cIdent(s.pin)}_PIN`, s.gpio, `${who(s)} (${s.board.label}), not used: the other I2C wire is missing`);
  }
  interface Bus {
    sda: Signal;
    scl: Signal;
    parts: Signal[];
    handle: string | null;
  }
  const buses: Bus[] = [];
  pairs.forEach((pair, i) => {
    const base = i === 0 ? 'I2C' : `I2C_BUS${i}`;
    const key = `${base} bus`;
    const okSda = claim(pair.sda, key);
    const okScl = claim(pair.scl, key);
    // SDA and SCL are open-drain outputs, so neither may be an input-only pin.
    const ok = okSda && okScl && usable(pair.sda, true) && usable(pair.scl, true);
    const users = pair.parts.map((s) => s.inst.id).join(', ') + (ok ? '' : ', I2C not started (see the notes in README.md)');
    define(`${base}_SDA_PIN`, pair.sda.gpio, `${pair.sda.board.label}, SDA of ${users}`);
    define(`${base}_SCL_PIN`, pair.scl.gpio, `${pair.scl.board.label}, SCL of ${users}`);
    const handle = ok ? `i2c_bus${i}` : null;
    buses.push({ ...pair, handle });
    if (!handle) return;
    requires.add('esp_driver_i2c');
    includes.add('#include "driver/i2c_master.h"');
    includes.add('#include "esp_err.h"');
    globals.push(`static i2c_master_bus_handle_t ${handle};  // NULL until the bus starts`);
    setup.push(
      '',
      `    // I2C at ${I2C_HZ / 1000} kHz on ${pair.sda.board.label} (SDA) and ${pair.scl.board.label} (SCL). The chip routes I2C through`,
      `    // its GPIO matrix, so any output-capable pin works: ${oneLine(matrixSrc)}.`,
      '    // Weak internal pull-ups on as well; breakouts usually have their own.',
      '    {',
      '        i2c_master_bus_config_t cfg = {',
      '            .i2c_port = -1,  // any free I2C controller',
      `            .sda_io_num = ${base}_SDA_PIN,`,
      `            .scl_io_num = ${base}_SCL_PIN,`,
      '            .clk_source = I2C_CLK_SRC_DEFAULT,',
      '            .glitch_ignore_cnt = 7,',
      '            .flags.enable_internal_pullup = true,',
      '        };',
      `        esp_err_t err = i2c_new_master_bus(&cfg, &${handle});`,
      `        if (err != ESP_OK) printf("I2C on ${cStr(pair.sda.board.label)}/${cStr(pair.scl.board.label)} did not start: %s\\n", esp_err_to_name(err));`,
      '    }',
    );
  });
  const busOf = (instId: string) => buses.find((b) => b.handle && b.parts.some((s) => s.inst.id === instId));
  let needFind = false;
  let needAnswers = false;

  /* ---------------- SPI: one bus (SPI2_HOST) on the wired pins, CS per part ---------------- */
  let spiBus: { sck: Signal; mosi?: Signal; miso?: Signal } | null = null;
  const spiParts: { inst: string; label: string; cs?: Signal }[] = [];
  for (const inst of scene.parts) {
    const get = (role: Signal['role']) => signals.find((s) => s.inst.id === inst.id && s.role === role);
    const sck = get('spi_sck');
    const mosi = get('spi_mosi');
    const miso = get('spi_miso');
    const cs = get('spi_cs');
    if (!sck && !mosi && !miso && !cs) continue;
    const label = inst.label ?? parts[inst.partId]?.name ?? inst.id;
    const same = (a?: Signal, b?: Signal) => !a || !b || a.gpio === b.gpio;
    let ok = !!sck;
    if (!sck) notes.push(t('{part}: SCK is not wired, so the starter does not start SPI for it.', { part: label }));
    else if (spiBus && !(same(sck, spiBus.sck) && same(mosi, spiBus.mosi) && same(miso, spiBus.miso))) {
      notes.push(t('{part} uses other pins of an SPI block that another part already uses, so the starter leaves its SPI out.', { part: label }));
      ok = false;
    }
    for (const [role, s] of [['SCK', sck], ['MOSI', mosi], ['MISO', miso]] as const) {
      if (!s) continue;
      if (!ok) {
        if (claim(s, `${s.inst.id}.${s.pin}`)) define(`${cIdent(inst.id)}_${role}_PIN`, s.gpio, `${s.board.label}, ${role} of ${inst.id}, SPI not started (see the notes in README.md)`);
        continue;
      }
      if (!claim(s, 'SPI bus') || !usable(s, role !== 'MISO')) {
        ok = false;
        continue;
      }
      define(`SPI_${role}_PIN`, s.gpio, `${s.board.label}, SPI ${role}`);
    }
    if (ok && sck) {
      spiBus ??= { sck };
      if (mosi) spiBus.mosi ??= mosi;
      if (miso) spiBus.miso ??= miso;
    }
    let csOk = false;
    if (cs && claim(cs, `${cs.inst.id}.${cs.pin}`)) {
      define(`${cIdent(inst.id)}_CS_PIN`, cs.gpio, `${cs.board.label}, chip select of ${inst.id}`);
      csOk = usable(cs, true);
    }
    if (ok) spiParts.push({ inst: inst.id, label, cs: csOk ? cs : undefined });
  }
  if (spiBus) {
    requires.add('esp_driver_spi');
    includes.add('#include "driver/spi_master.h"');
    includes.add('#include "esp_err.h"');
    setup.push(
      '',
      `    // SPI2 on the wired pins (the GPIO matrix routes SPI to any pin: ${oneLine(matrixSrc)}).`,
      '    {',
      '        spi_bus_config_t bus = {',
      '            .sclk_io_num = SPI_SCK_PIN,',
      `            .mosi_io_num = ${spiBus.mosi ? 'SPI_MOSI_PIN' : '-1'},`,
      `            .miso_io_num = ${spiBus.miso ? 'SPI_MISO_PIN' : '-1'},`,
      '            .quadwp_io_num = -1,',
      '            .quadhd_io_num = -1,',
      '        };',
      '        esp_err_t err = spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_CH_AUTO);',
      '        if (err != ESP_OK) printf("SPI did not start: %s\\n", esp_err_to_name(err));',
      '    }',
    );
    for (const p of spiParts) {
      const v = `${cIdent(p.inst).toLowerCase()}_spi`;
      globals.push(`static spi_device_handle_t ${v};  // ${oneLine(p.label)}`);
      setup.push(
        '',
        `    // ${oneLine(p.label)} on SPI2 at 1 MHz, mode 0; the driver drives chip select. Talking to the part needs its`,
        '    // command set: see the part datasheet.',
        '    {',
        '        spi_device_interface_config_t dev = {',
        '            .clock_speed_hz = 1000 * 1000,',
        '            .mode = 0,',
        `            .spics_io_num = ${p.cs ? `${cIdent(p.inst)}_CS_PIN` : '-1'},`,
        '            .queue_size = 1,',
        '        };',
        `        esp_err_t err = spi_bus_add_device(SPI2_HOST, &dev, &${v});`,
        `        if (err != ESP_OK) printf("${cStr(p.inst)} (${cStr(p.label)}): SPI device not added: %s\\n", esp_err_to_name(err));`,
        '    }',
      );
    }
  }

  /* ---------------- everything else, part by part ---------------- */
  // LEDC: one timer for every LED, from the 80 MHz APB clock (board clocks.pwmHz), with the most
  // duty bits that still give PWM_HZ (shared/clocks.ts, the same maths as the PWM calculator).
  const apbHz = board.clocks?.pwmHz ?? 80_000_000;
  const pwm = pwmCalc(board, apbHz, PWM_HZ, 0);
  const pwmBits = Number(/^(\d+) bits$/.exec(pwm.values.find(([k]) => k === t('Resolution'))?.[1] ?? '')?.[1] ?? 10);
  const clockSrc = board.clocks ? `${board.clocks.source.title}, ${board.clocks.source.section ?? ''}`.replace(/, $/, '') : board.rules.datasheet;
  let ledcUsed = 0;
  let adcUsed = false;

  for (const inst of scene.parts) {
    const def = parts[inst.partId];
    if (!def) continue;
    const label = oneLine(inst.label ?? def.name);
    const mine = signals.filter((s) => s.inst.id === inst.id && !['i2c_sda', 'i2c_scl', 'spi_sck', 'spi_mosi', 'spi_miso', 'spi_cs'].includes(s.role));
    const src = partSource(def);
    const driverSrc = def.sources[0]?.title ?? 'the part datasheet';
    const v = cIdent(inst.id).toLowerCase();

    // I2C part: chip id register when the part file documents one, else an address probe.
    if (i2cParts.has(inst.id)) {
      const bus = busOf(inst.id);
      const addrs = i2cAddresses(def);
      if (bus?.handle && addrs.length) {
        const list = addrs.map(hex2);
        report.push('', `        // ${label} (${inst.id}) on the I2C bus, address ${list.join(' or ')}.`);
        if (def.idCheck) {
          needFind = true;
          const reg = parseInt(def.idCheck.register, 16);
          const expect = parseInt(def.idCheck.expect, 16);
          globals.push(`static i2c_master_dev_handle_t ${v}_dev;  // ${label}, NULL until it answers`, `static uint16_t ${v}_addr;`);
          report.push(
            `        // Chip id: register ${def.idCheck.register} reads ${def.idCheck.expect}. Source: ${oneLine(partSource(def, def.idCheck.register) ?? def.name)}.`,
            `        // Real readings need the part's driver: see ${oneLine(driverSrc)}.`,
            '        {',
            `            static const uint16_t addr[] = {${list.join(', ')}};`,
            `            if (!${v}_dev) ${v}_dev = find_part(${bus.handle}, addr, sizeof addr / sizeof addr[0], &${v}_addr);`,
            `            uint8_t reg = ${hex2(reg)}, id = 0;`,
            `            if (${v}_dev && i2c_master_transmit_receive(${v}_dev, &reg, 1, &id, 1, I2C_TIMEOUT_MS) == ESP_OK) {`,
            `                printf("${cStr(inst.id)} (${cStr(label)}) at 0x%02X: chip id 0x%02X (expected ${hex2(expect)})\\n", (unsigned)${v}_addr, (unsigned)id);`,
            ...Object.entries(def.idCheck.otherValues ?? {}).flatMap(([val, text]) => {
              const n = parseInt(val, 16);
              return Number.isFinite(n) ? [`                if (id == ${hex2(n)}) printf("  ${cStr(text)}\\n");`] : [];
            }),
            '            } else {',
            `                printf("${cStr(inst.id)} (${cStr(label)}): no answer at ${list.join(' or ')}. Check the wiring, or run Debug in BoardPilot.\\n");`,
            '            }',
            '        }',
          );
        } else {
          needAnswers = true;
          report.push(
            '        // No chip id register in the parts library: only checks that the part answers.',
            `        // Using it needs the part's driver: see ${oneLine(driverSrc)}.`,
            '        {',
            `            static const uint16_t addr[] = {${list.join(', ')}};`,
            `            int at = answers(${bus.handle}, addr, sizeof addr / sizeof addr[0]);`,
            `            if (at >= 0) printf("${cStr(inst.id)} (${cStr(label)}) answers at 0x%02X\\n", (unsigned)at);`,
            `            else printf("${cStr(inst.id)} (${cStr(label)}): no answer at ${list.join(' or ')}. Check the wiring, or run Debug in BoardPilot.\\n");`,
            '        }',
          );
        }
      }
    }

    for (const s of mine) {
      if (!claim(s, `${s.inst.id}.${s.pin}`)) continue;
      const macro = mine.length === 1 ? `${cIdent(inst.id)}_PIN` : `${cIdent(inst.id)}_${cIdent(s.pin)}_PIN`;
      const at = `${s.board.label}`;
      const shown = `${inst.id} ${s.pin} (${at})`;
      const pv = cIdent(`${inst.id}_${mine.length > 1 ? s.pin : ''}`).toLowerCase();

      // Part input driven by the board: an LED fades with LEDC PWM, anything else starts LOW.
      if (s.role === 'digital_in') {
        if (!usable(s, true)) {
          define(macro, s.gpio, `${label} pin ${s.pin}, not used: see the notes in README.md`);
          continue;
        }
        useGpio();
        if (isLed(def) && ledcUsed < LEDC_CHANNELS && pwm.ok) {
          const ch = ledcUsed++;
          requires.add('esp_driver_ledc');
          includes.add('#include "driver/ledc.h"');
          includes.add('#include "esp_err.h"');
          define(macro, s.gpio, `${label} pin ${s.pin}, LEDC channel ${ch}`);
          if (ch === 0)
            setup.push(
              '',
              `    // LED PWM (LEDC) timer 0: ${PWM_HZ} Hz with ${pwmBits}-bit duty from the ${apbHz / 1e6} MHz APB clock.`,
              `    // f = APB_CLK / (divider x 2^bits). Sources: ${oneLine(pwm.source)}; APB_CLK: ${oneLine(clockSrc)}.`,
              '    {',
              '        ledc_timer_config_t timer = {',
              '            .speed_mode = LEDC_LOW_SPEED_MODE,',
              `            .duty_resolution = LEDC_TIMER_${pwmBits}_BIT,`,
              '            .timer_num = LEDC_TIMER_0,',
              `            .freq_hz = ${PWM_HZ},`,
              '            .clk_cfg = LEDC_USE_APB_CLK,',
              '        };',
              '        ESP_ERROR_CHECK(ledc_timer_config(&timer));',
              '    }',
            );
          setup.push(
            '',
            `    // ${label}: LEDC channel ${ch} on timer 0 (the GPIO matrix routes it to ${at}).`,
            `    gpio_reset_pin(${macro});`,
            '    {',
            '        ledc_channel_config_t ch = {',
            `            .gpio_num = ${macro},`,
            '            .speed_mode = LEDC_LOW_SPEED_MODE,',
            `            .channel = LEDC_CHANNEL_${ch},`,
            '            .timer_sel = LEDC_TIMER_0,',
            '            .duty = 0,',
            '            .hpoint = 0,',
            '        };',
            '        ESP_ERROR_CHECK(ledc_channel_config(&ch));',
            '    }',
          );
          fast.push(
            `        ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_${ch}, fade);  // ${label}: fades up and down`,
            `        ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_${ch});`,
          );
        } else {
          define(macro, s.gpio, `${label} pin ${s.pin}, output`);
          setup.push('', `    // ${label} ${s.pin}: output, starts LOW.`, `    gpio_reset_pin(${macro});`, `    gpio_set_direction(${macro}, GPIO_MODE_OUTPUT);`, `    gpio_set_level(${macro}, 0);`);
          if (isLed(def)) fast.push(`        gpio_set_level(${macro}, (tick / 25) % 2);  // ${label}: blinks (0.5 s on, 0.5 s off)`);
          else fast.push(`        // gpio_set_level(${macro}, 1);  // switches ${label} ${s.pin} on`);
        }
        continue;
      }

      // Analog output of the part: ADC oneshot, on the board's analog pins (ADC1: ADC2 stops
      // working while Wi-Fi is on, and the ESP32-C3 has no ADC2 oneshot mode).
      if (s.role === 'analog_out') {
        if (board.rules.adcPins.includes(s.board.id) || (s.board.sameAs && board.rules.adcPins.includes(s.board.sameAs))) {
          adcUsed = true;
          requires.add('esp_adc');
          includes.add('#include "esp_adc/adc_oneshot.h"');
          includes.add('#include "esp_adc/adc_cali.h"');
          includes.add('#include "esp_adc/adc_cali_scheme.h"');
          includes.add('#include "esp_err.h"');
          define(macro, s.gpio, `${label} pin ${s.pin}, analog input`);
          globals.push(`static adc_unit_t ${pv}_unit;`, `static adc_channel_t ${pv}_ch;`, `static adc_cali_handle_t ${pv}_cali;  // NULL when the chip has no calibration data`);
          setup.push(
            '',
            `    // ${label} ${s.pin}: ADC oneshot, 12 dB attenuation (about 0 to 3.1 V). The unit and channel come from the`,
            `    // driver (adc_oneshot_io_to_channel), not from a table. Source: ${oneLine(adcSrc)}.`,
            `    ESP_ERROR_CHECK(adc_oneshot_io_to_channel(${macro}, &${pv}_unit, &${pv}_ch));`,
            `    ESP_ERROR_CHECK(adc_oneshot_config_channel(adc_unit(${pv}_unit), ${pv}_ch, &adc_chan_cfg));`,
            `    ${pv}_cali = adc_calibration(${pv}_unit, ${pv}_ch);`,
          );
          report.push(
            '        {',
            '            int raw = 0, mv = 0;',
            `            if (adc_oneshot_read(adc_unit(${pv}_unit), ${pv}_ch, &raw) != ESP_OK) printf("${cStr(shown)}: ADC read failed\\n");`,
            `            else if (${pv}_cali && adc_cali_raw_to_voltage(${pv}_cali, raw, &mv) == ESP_OK) printf("${cStr(shown)}: raw %d, %d mV (calibrated)\\n", raw, mv);`,
            `            else printf("${cStr(shown)}: raw %d of 4095 (no calibration data, so no mV)\\n", raw);`,
            '        }',
          );
          continue;
        }
        notes.push(
          t('{part}: {pin} is not an analog pin, so the starter reads it as a digital level. Move the wire to {pins} for a real reading.', {
            part: label,
            pin: at,
            pins: board.rules.adcPins.map((id) => pinById(board, id)?.label ?? id).join(', '),
          }),
        );
      }

      // Everything the board reads: buttons with the internal pull-up, other outputs as they are.
      if (!usable(s, false)) {
        define(macro, s.gpio, `${label} pin ${s.pin}, not used: see the notes in README.md`);
        continue;
      }
      useGpio();
      define(macro, s.gpio, `${label} pin ${s.pin}, input`);
      const pull = !s.board.flags.includes('no_internal_pull');
      if (s.role === 'onewire') {
        setup.push(
          '',
          `    // ${label} ${s.pin}: single-wire data line, idle HIGH through a pull-up. Reading the part`,
          `    // needs exact microsecond timing: see ${oneLine(src ?? 'the part datasheet')}. The starter only shows the level.`,
          `    gpio_reset_pin(${macro});`,
          `    gpio_set_direction(${macro}, GPIO_MODE_INPUT);`,
          ...(pull ? [`    gpio_set_pull_mode(${macro}, GPIO_PULLUP_ONLY);`] : []),
        );
        report.push(`        printf("${cStr(shown)}: level %d\\n", gpio_get_level(${macro}));`);
      } else if (isButton(def)) {
        if (!pull) notes.push(t('{part}: {pin} has no internal pull-up, so the button needs a 10 kΩ resistor from {pin} to 3.3 V.', { part: label, pin: at }));
        globals.push(`static bool ${v}_was = false;`);
        setup.push(
          '',
          pull
            ? `    // ${label}: input with the internal pull-up; pressing connects the pin to GND (reads 0).`
            : `    // ${label}: input. ${at} has no internal pull-up (${oneLine(matrixSrc)}): add a 10 kOhm resistor to 3.3 V.`,
          `    gpio_reset_pin(${macro});`,
          `    gpio_set_direction(${macro}, GPIO_MODE_INPUT);`,
          ...(pull ? [`    gpio_set_pull_mode(${macro}, GPIO_PULLUP_ONLY);`] : []),
        );
        fast.push(
          '        {',
          `            bool now = gpio_get_level(${macro}) == 0;`,
          `            if (now != ${v}_was) printf("${cStr(inst.id)} (${cStr(label)}): %s\\n", now ? "pressed" : "released");`,
          `            ${v}_was = now;`,
          '        }',
        );
      } else {
        setup.push('', `    // ${label} ${s.pin}: input; the part drives the level.`, `    gpio_reset_pin(${macro});`, `    gpio_set_direction(${macro}, GPIO_MODE_INPUT);`);
        report.push(`        printf("${cStr(shown)}: level %d\\n", gpio_get_level(${macro}));`);
      }
    }
  }

  if (needFind)
    helpers.push(
      '// Looks for an I2C part at each of its addresses and adds it to the bus. NULL when none answers.',
      'static i2c_master_dev_handle_t find_part(i2c_master_bus_handle_t bus, const uint16_t *addr, size_t n, uint16_t *found) {',
      '    for (size_t i = 0; bus && i < n; i++) {',
      '        if (i2c_master_probe(bus, addr[i], I2C_TIMEOUT_MS) != ESP_OK) continue;',
      '        i2c_device_config_t dev = {',
      '            .dev_addr_length = I2C_ADDR_BIT_LEN_7,',
      '            .device_address = addr[i],',
      '            .scl_speed_hz = I2C_HZ,',
      '        };',
      '        i2c_master_dev_handle_t handle = NULL;',
      '        if (i2c_master_bus_add_device(bus, &dev, &handle) == ESP_OK) {',
      '            *found = addr[i];',
      '            return handle;',
      '        }',
      '    }',
      '    return NULL;',
      '}',
      '',
    );
  if (needAnswers)
    helpers.push(
      '// The first address a device acknowledges, or -1.',
      'static int answers(i2c_master_bus_handle_t bus, const uint16_t *addr, size_t n) {',
      '    for (size_t i = 0; bus && i < n; i++)',
      '        if (i2c_master_probe(bus, addr[i], I2C_TIMEOUT_MS) == ESP_OK) return addr[i];',
      '    return -1;',
      '}',
      '',
    );
  if (adcUsed)
    helpers.push(
      '// ADC units are created the first time a channel needs them (ADC_UNIT_1 = 0, ADC_UNIT_2 = 1).',
      'static adc_oneshot_unit_handle_t adc_units[2];',
      'static const adc_oneshot_chan_cfg_t adc_chan_cfg = {',
      '    .atten = ADC_ATTEN_DB_12,',
      '    .bitwidth = ADC_BITWIDTH_12,',
      '};',
      '',
      'static adc_oneshot_unit_handle_t adc_unit(adc_unit_t unit) {',
      '    if (!adc_units[unit]) {',
      '        adc_oneshot_unit_init_cfg_t cfg = {.unit_id = unit};',
      '        ESP_ERROR_CHECK(adc_oneshot_new_unit(&cfg, &adc_units[unit]));',
      '    }',
      '    return adc_units[unit];',
      '}',
      '',
      '// Calibration from the chip\'s eFuse data, as in the ESP-IDF oneshot_read example. NULL when the',
      '// chip has none: then only raw values are printed, never a guessed voltage.',
      'static adc_cali_handle_t adc_calibration(adc_unit_t unit, adc_channel_t channel) {',
      '    adc_cali_handle_t handle = NULL;',
      '#if ADC_CALI_SCHEME_CURVE_FITTING_SUPPORTED',
      '    adc_cali_curve_fitting_config_t cfg = {.unit_id = unit, .chan = channel, .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_12};',
      '    if (adc_cali_create_scheme_curve_fitting(&cfg, &handle) != ESP_OK) handle = NULL;',
      '#elif ADC_CALI_SCHEME_LINE_FITTING_SUPPORTED',
      '    (void)channel;',
      '    adc_cali_line_fitting_config_t cfg = {.unit_id = unit, .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_12};',
      '    if (adc_cali_create_scheme_line_fitting(&cfg, &handle) != ESP_OK) handle = NULL;',
      '#else',
      '    (void)unit;',
      '    (void)channel;',
      '#endif',
      '    return handle;',
      '}',
      '',
    );

  const flashMb = board.flashBytes ? board.flashBytes / (1024 * 1024) : 0;
  const header = [`${name}: ESP-IDF starter generated by BoardPilot`, `Board: ${board.name} (${board.id}, ${board.chip}, IDF target ${target})`, `Scene ${tag}: ${sceneParts(scene, parts).join('; ') || 'no parts'}`].map(oneLine);
  const consts = [
    ...(buses.some((b) => b.handle) ? [`#define I2C_HZ ${I2C_HZ}`, `#define I2C_TIMEOUT_MS ${I2C_TIMEOUT_MS}`] : []),
    ...(ledcUsed ? [`#define DUTY_MAX ${2 ** pwmBits}  // ${pwmBits}-bit LEDC duty`] : []),
  ];

  const main = [
    ...header.map((l) => `// ${l}`),
    `// Needs ESP-IDF ${IDF_MIN_VERSION} or newer.`,
    '//',
    '// Wiring (as in the 3D view):',
    ...wiringComment(signals, (s) => `GPIO ${s.gpio}`),
    '//',
    '// Output: the serial console (115200 baud, idf.py monitor). Values are printed once a second.',
    '',
    ...[...includes],
    '',
    ...(defines.length ? [...defines, ''] : []),
    ...(consts.length ? [...consts, ''] : []),
    ...(globals.length ? [...globals, ''] : []),
    ...helpers,
    'void app_main(void) {',
    `    printf("${cStr(name)} on ${cStr(board.name)} (scene ${tag})\\n");`,
    ...setup,
    '',
    '    uint32_t tick = 0;',
    '    while (true) {',
    ...(ledcUsed ? ['        uint32_t fade = ((tick / 100) % 2 ? 100 - tick % 100 : tick % 100) * (DUTY_MAX / 100);'] : []),
    ...fast,
    `        if (tick % ${REPORT_TICKS} == 0) {`,
    ...(report.length ? report.map((l) => (l ? `    ${l}` : l)).slice(report[0] === '' ? 1 : 0) : [`            printf("running, %lu s\\n", (unsigned long)(tick / ${REPORT_TICKS}));`]),
    '        }',
    '        tick++;',
    `        vTaskDelay(pdMS_TO_TICKS(${TICK_MS}));  // FreeRTOS: lets other tasks (and the idle task) run`,
    '    }',
    '}',
    '',
  ].join('\n');

  const req = [...requires].sort();
  const cmake = [
    ...header.map((l) => `# ${l}`),
    `# Needs ESP-IDF ${IDF_MIN_VERSION} or newer (driver/i2c_master.h came in 5.2, the esp_driver_* components in 5.3).`,
    `# Build: idf.py set-target ${target}, then idf.py build`,
    '',
    'cmake_minimum_required(VERSION 3.16)',
    'include($ENV{IDF_PATH}/tools/cmake/project.cmake)',
    '# Builds only main and the components it needs, which is much faster than the whole IDF.',
    'set(COMPONENTS main)',
    `project(${IDF_PROJECT})`,
    '',
  ].join('\n');

  const mainCmake = [
    ...header.map((l) => `# ${l}`),
    '',
    'idf_component_register(SRCS "main.c"',
    `                       INCLUDE_DIRS "."${req.length ? '' : ')'}`,
    ...(req.length ? [`                       REQUIRES ${req.join(' ')})`] : []),
    '',
  ].join('\n');

  const sdkconfig = [
    ...header.map((l) => `# ${l}`),
    '# Settings idf.py uses when it creates sdkconfig (delete sdkconfig to apply changes here).',
    '',
    `CONFIG_IDF_TARGET="${target}"`,
    ...([1, 2, 4, 8, 16, 32].includes(flashMb) ? [`# Flash size of the ${board.module} (board file: ${flashMb} MB).`, `CONFIG_ESPTOOLPY_FLASHSIZE_${flashMb}MB=y`] : []),
    '',
  ].join('\n');

  const readme = [
    `# ${oneLine(name)}`,
    '',
    `ESP-IDF starter project generated by BoardPilot for the **${board.name}** (\`${board.id}\`, ${board.chip}, IDF target \`${target}\`).`,
    `Scene \`${tag}\`: ${sceneParts(scene, parts).join('; ') || 'no parts'}.`,
    '',
    '## Wiring',
    '',
    ...wiringTable(signals, 'GPIO', (s) => String(s.gpio)),
    ...(notes.length ? ['', '## Notes', '', ...notes.map((n) => `- ${oneLine(n)}`)] : []),
    '',
    '## Build',
    '',
    `1. Install ESP-IDF ${IDF_MIN_VERSION} or newer (Espressif's "Get Started" guide) and open its terminal, or run \`. $IDF_PATH/export.sh\`.`,
    `2. In this folder: \`idf.py set-target ${target}\`, then \`idf.py build\`.`,
    '3. Plug in the board and run `idf.py -p PORT flash monitor` (PORT is for example `/dev/ttyUSB0` or `COM3`).',
    board.toolchain.uploadNote ? `   ${oneLine(board.toolchain.uploadNote)}` : '',
    '4. The program prints the values once a second. Leave the monitor with Ctrl+].',
    '',
    `main.c needs the components \`${req.join('`, `') || 'none beyond the defaults'}\` (listed in main/CMakeLists.txt).`,
    'Every hardware fact used in `main.c` has its datasheet source in a comment next to it.',
    '',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');

  return {
    folder: `${slug(name)}-esp-idf`,
    files: [
      { name: 'CMakeLists.txt', text: cmake },
      { name: 'main/CMakeLists.txt', text: mainCmake },
      { name: 'main/main.c', text: main },
      { name: 'sdkconfig.defaults', text: sdkconfig },
      { name: 'README.md', text: readme },
    ],
    notes,
  };
}
