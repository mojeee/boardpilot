// STM32 HAL starter project for STM32F4 boards, generated from the project scene.
//
// Output: a CMake project for arm-none-eabi-gcc with STM32CubeMX's folder layout:
// CMakeLists.txt, cmake/gcc-arm-none-eabi.cmake, Core/Inc/stm32f4xx_hal_conf.h (only the HAL
// modules main.c uses), Core/Src/main.c, Core/Src/syscalls.c (printf to the UART), the linker
// script and README.md. ST's HAL and CMSIS are not copied: CMake fetches them from ST's official
// GitHub repositories at pinned tags (STM32_REPOS), or uses a local STM32CubeF4 package given with
// -DSTM32CUBE_F4_DIR. The startup file and system_stm32f4xx.c come from those repositories.
//
// Everything board-specific comes from the board file: the clock tree (toolchain.stm32Hal, which
// scripts/check-boards.mjs checks against `clocks`), the printf UART, and for every pin its
// peripheral functions and their alternate function numbers (`af`, from the datasheet's alternate
// function table). A function that is not in the board file is never guessed: the pin then stays a
// plain GPIO and README.md says why.

import type { BoardDef, PartDef, Scene, Stm32HalConfig } from '../types';
import { pinById } from '../board';
import { adcCalc, pwmCalc } from '../clocks';
import { t } from '../i18n';
import {
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

/** The CMake target: build/boardpilot_starter.elf, .bin and .hex. */
export const STM32_TARGET = 'boardpilot_starter';

/** ST's official repositories and the tags the project pins (FetchContent names as keys). */
export const STM32_REPOS = {
  stm32f4xx_hal_driver: { url: 'https://github.com/STMicroelectronics/stm32f4xx-hal-driver.git', tag: 'v1.8.5' },
  cmsis_device_f4: { url: 'https://github.com/STMicroelectronics/cmsis-device-f4.git', tag: 'v2.6.11' },
  cmsis_core: { url: 'https://github.com/STMicroelectronics/cmsis-core.git', tag: 'v5.9.0' },
} as const;

/** I2C clock: 100 kHz standard mode, which every I2C part supports. */
const I2C_HZ = 100_000;
const I2C_TIMEOUT_MS = 10;
/** LED PWM frequency. */
const PWM_HZ = 1000;
/** ADC: 84-cycle sampling time (ADC_SMPRx), and the smallest PCLK2 prescaler (ADC_CCR ADCPRE) that keeps fADC at or under 36 MHz. */
const ADC_SAMPLE_CYCLES = 84;
const ADC_PRESCALERS = [2, 4, 6, 8];
/** SPI: PCLK / 128, well under 1 MHz on every STM32F4 bus. */
const SPI_PRESCALER = 128;
const TICK_MS = 20;
const REPORT_TICKS = 50;

/**
 * Timers and U(S)ARTs on APB2; the rest are on APB1. RM0368 / RM0383 section 2.3 memory map
 * (APB2: TIM1, TIM8, TIM9-11, USART1, USART6, SPI1, SPI4, SPI5, ADC1).
 */
const APB2 = new Set(['TIM1', 'TIM8', 'TIM9', 'TIM10', 'TIM11', 'USART1', 'USART6', 'SPI1', 'SPI4', 'SPI5', 'ADC1']);
/** On STM32F4, USART1, 2, 3 and 6 are USARTs; 4, 5, 7 and 8 are UARTs (RM0368 / RM0383, chapter 19). */
const usartName = (n: string) => (['1', '2', '3', '6'].includes(n) ? `USART${n}` : `UART${n}`);

export const isStm32HalBoard = (b: BoardDef) => b.family === 'stm32' && !!b.toolchain.stm32Hal && /^STM32F4/.test(b.toolchain.stm32Hal.device);

/** HAL peripheral name of a board-file function: "UART2_TX" → "USART2", "I2C1_SDA" → "I2C1". */
function peripheralOf(fn: string): string {
  const m = /^(TIM|I2C|SPI|UART|USART)(\d+)_/.exec(fn);
  if (!m) return fn;
  return m[1] === 'UART' ? usartName(m[2]) : `${m[1]}${m[2]}`;
}

/** Port letter and pin number: PinDef.gpio is port × 16 + pin on STM32 (PA0 = 0, PB0 = 16). */
const portOf = (gpio: number) => 'ABCDEFGHIJK'[Math.floor(gpio / 16)] ?? 'A';
const chipPin = (gpio: number) => `P${portOf(gpio)}${gpio % 16}`;

export interface Stm32Options {
  name?: string;
}

export function generateStm32Hal(scene: Scene, board: BoardDef, parts: Record<string, PartDef>, opts: Stm32Options = {}): StarterProject {
  const hal = board.toolchain.stm32Hal as Stm32HalConfig;
  const name = opts.name?.trim() || 'BoardPilot project';
  const tag = sceneTag(scene);
  const notes: string[] = [];
  const signals = sceneSignals(scene, board, parts);
  const { claim, owner } = pinClaims(notes);
  const afSrc = board.sources.find((s) => /Alternate function/i.test(s.section ?? ''));
  const afCite = afSrc ? `${afSrc.title}, ${afSrc.section}` : `${board.rules.datasheet}, alternate function mapping`;
  const pinSrc = board.sources.find((s) => /pin definitions|ADC1_IN/i.test(s.section ?? ''));
  const pinCite = pinSrc ? `${pinSrc.title}, ${pinSrc.section}` : board.rules.datasheet;

  // Clock tree from the board file.
  const inHz = hal.pllSource === 'hse' ? hal.hseHz : 16_000_000;
  const sysHz = (inHz / hal.pllM) * hal.pllN / hal.pllP;
  const pclk1 = sysHz / hal.apb1Div;
  const pclk2 = sysHz / hal.apb2Div;
  const busHz = (periph: string) => (APB2.has(periph) ? pclk2 : pclk1);
  // RM0368 / RM0383 6.2: timer clocks are twice the APB clock when its prescaler is not 1.
  const timHz = (periph: string) => (APB2.has(periph) ? pclk2 * (hal.apb2Div === 1 ? 1 : 2) : pclk1 * (hal.apb1Div === 1 ? 1 : 2));
  const clockCite = `${hal.source.title}${hal.source.section ? `, ${hal.source.section}` : ''}`;
  const timerCite = board.clocks ? `${board.clocks.source.title}${board.clocks.source.section ? `, ${board.clocks.source.section}` : ''}` : clockCite;

  const defines: string[] = [];
  const globals: string[] = [];
  const helpers: string[] = [];
  const setup: string[] = [];
  const fast: string[] = [];
  const report: string[] = [];
  const modules = new Set<string>(['gpio', 'rcc', 'rcc_ex', 'cortex', 'dma', 'flash', 'flash_ex', 'pwr', 'pwr_ex', 'uart']);
  const ports = new Set<string>();
  const defined = new Set<string>();
  const define = (base: string, gpio: number, comment: string) => {
    if (defined.has(base)) return;
    defined.add(base);
    ports.add(portOf(gpio));
    defines.push(`#define ${base}_PORT GPIO${portOf(gpio)}`, `#define ${base}_PIN GPIO_PIN_${gpio % 16}`.padEnd(36) + `// ${chipPin(gpio)}, ${oneLine(comment)}`);
  };
  const who = (s: Signal) => `${s.inst.label ?? s.def.name} ${s.pin}`;
  const at = (s: Signal) => (s.board.label === chipPin(s.gpio) ? s.board.label : `${s.board.label} (${chipPin(s.gpio)})`);
  /** AF number of `fn` on this pin from the board file, or null (with a note) when it is missing. */
  const afOf = (s: Signal, fn: string): number | null => {
    const n = s.board.af?.[fn];
    if (n === undefined) {
      notes.push(t('The board file has no alternate function number for {fn} on {pin}, so the starter does not set it up.', { fn, pin: s.board.label }));
      return null;
    }
    return n;
  };
  const afMacro = (fn: string, n: number) => `GPIO_AF${n}_${peripheralOf(fn)}`;

  // Pins the starter keeps for itself: the printf UART and the SWD debug pins.
  const stdioTx = pinById(board, hal.stdio.tx);
  const stdioRx = pinById(board, hal.stdio.rx);
  const uart = peripheralOf(`${hal.stdio.uart}_TX`);
  for (const p of [stdioTx, stdioRx]) if (p?.gpio !== null && p?.gpio !== undefined) owner.set(p.gpio, { key: 'stdio', label: `${uart} (printf)` });
  const usable = (s: Signal): boolean => {
    if (owner.get(s.gpio)?.key === 'stdio') {
      notes.push(t('{pin} carries the printf output ({uart}) on this board, so the starter does not use it for {part}. Move the wire to a free pin.', { pin: s.board.label, uart, part: who(s) }));
      return false;
    }
    if (s.board.flags.includes('swd')) {
      notes.push(t('{pin} is a debug (SWD) pin that programs the board, so the starter does not use it for {part}. Move the wire to a free pin.', { pin: s.board.label, part: who(s) }));
      return false;
    }
    return true;
  };

  /* ---------------- I2C: SDA and SCL must be the same I2C block in the board file ---------------- */
  const { pairs, lone, i2cParts } = i2cPairs(scene, signals, notes);
  for (const s of lone) {
    claim(s, `${s.inst.id}.${s.pin}`);
    define(`${cIdent(s.inst.id)}_${cIdent(s.pin)}`, s.gpio, `${who(s)}, not used: the other I2C wire is missing`);
  }
  interface Bus {
    parts: Signal[];
    block: number | null;
    handle: string;
  }
  const buses: Bus[] = [];
  let unusedBus = 0;
  for (const pair of pairs) {
    const sclFns = pair.scl.board.functions.filter((f) => /^I2C\d_SCL$/.test(f));
    let block: number | null = null;
    // SDA and SCL of the same block (a pin can offer several blocks, e.g. PB3 = I2C2_SDA).
    for (const f of pair.sda.board.functions.filter((x) => /^I2C\d_SDA$/.test(x))) {
      const b = Number(f[3]);
      if (sclFns.includes(`I2C${b}_SCL`)) {
        block = b;
        break;
      }
    }
    if (block === null) {
      notes.push(
        t('SDA ({sda}) and SCL ({scl}) are not an I2C pair on this chip, so the starter does not start I2C there. Move the wires to a pair such as {dsda} and {dscl}.', {
          sda: pair.sda.board.label,
          scl: pair.scl.board.label,
          dsda: pinById(board, board.rules.i2c.sda)?.label ?? board.rules.i2c.sda,
          dscl: pinById(board, board.rules.i2c.scl)?.label ?? board.rules.i2c.scl,
        }),
      );
    } else if (buses.some((x) => x.block === block)) {
      notes.push(t('The I2C pins {sda} and {scl} use the same I2C block as another pair, so the starter leaves them out. Put all I2C parts on the same two pins.', { sda: pair.sda.board.label, scl: pair.scl.board.label }));
      block = null;
    }
    const base = block !== null ? `I2C${block}` : `I2C_UNUSED${++unusedBus}`;
    const key = block !== null ? `I2C${block}` : `${pair.sda.inst.id} I2C`;
    const ok = usable(pair.sda) && usable(pair.scl) && claim(pair.sda, key) && claim(pair.scl, key);
    const users = pair.parts.map((s) => s.inst.id).join(', ') + (block === null || !ok ? ', I2C not started (see the notes in README.md)' : '');
    define(`${base}_SDA`, pair.sda.gpio, `${pair.sda.board.label}, SDA of ${users}`);
    define(`${base}_SCL`, pair.scl.gpio, `${pair.scl.board.label}, SCL of ${users}`);
    if (block === null || !ok) continue;
    const afSda = afOf(pair.sda, `I2C${block}_SDA`);
    const afScl = afOf(pair.scl, `I2C${block}_SCL`);
    if (afSda === null || afScl === null) continue;
    const handle = `hi2c${block}`;
    buses.push({ parts: pair.parts, block, handle });
    modules.add('i2c');
    globals.push(`static I2C_HandleTypeDef ${handle};`);
    setup.push(
      '',
      `    // I2C${block} at ${I2C_HZ / 1000} kHz on ${at(pair.sda)} (SDA) and ${at(pair.scl)} (SCL): open drain, with the weak internal`,
      `    // pull-ups (breakouts usually have their own). I2C${block}_SDA is AF${afSda} and I2C${block}_SCL is AF${afScl}: ${oneLine(afCite)}.`,
      `    __HAL_RCC_I2C${block}_CLK_ENABLE();`,
      `    pin_init(${base}_SDA_PORT, ${base}_SDA_PIN, GPIO_MODE_AF_OD, GPIO_PULLUP, ${afMacro(`I2C${block}_SDA`, afSda)});`,
      `    pin_init(${base}_SCL_PORT, ${base}_SCL_PIN, GPIO_MODE_AF_OD, GPIO_PULLUP, ${afMacro(`I2C${block}_SCL`, afScl)});`,
      `    ${handle}.Instance = I2C${block};`,
      `    ${handle}.Init.ClockSpeed = I2C_HZ;`,
      `    ${handle}.Init.DutyCycle = I2C_DUTYCYCLE_2;`,
      `    ${handle}.Init.OwnAddress1 = 0;`,
      `    ${handle}.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;`,
      `    ${handle}.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;`,
      `    ${handle}.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;`,
      `    ${handle}.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;`,
      `    if (HAL_I2C_Init(&${handle}) != HAL_OK) printf("I2C${block} did not start\\n");`,
    );
  }
  const busOf = (instId: string) => buses.find((b) => b.parts.some((s) => s.inst.id === instId));

  /* ---------------- SPI: SCK, MOSI and MISO on one SPI block, CS as a plain GPIO ---------------- */
  interface SpiBus {
    block: number;
    sck?: Signal;
    mosi?: Signal;
    miso?: Signal;
  }
  const spiBuses: SpiBus[] = [];
  for (const inst of scene.parts) {
    const get = (role: Signal['role']) => signals.find((s) => s.inst.id === inst.id && s.role === role);
    const sck = get('spi_sck');
    const mosi = get('spi_mosi');
    const miso = get('spi_miso');
    const cs = get('spi_cs');
    if (!sck && !mosi && !miso && !cs) continue;
    const label = inst.label ?? parts[inst.partId]?.name ?? inst.id;
    // The first SPI block that SCK offers and MOSI / MISO (when wired) also offer.
    const blocks = (sck?.board.functions ?? []).map((f) => /^SPI(\d)_SCK$/.exec(f)?.[1]).filter((x): x is string => !!x).map(Number);
    let block: number | null = blocks.find((b) => (!mosi || mosi.board.functions.includes(`SPI${b}_MOSI`)) && (!miso || miso.board.functions.includes(`SPI${b}_MISO`))) ?? null;
    let bus = block !== null ? spiBuses.find((b) => b.block === block) : undefined;
    if (bus && ((sck && bus.sck && bus.sck.gpio !== sck.gpio) || (mosi && bus.mosi && bus.mosi.gpio !== mosi.gpio) || (miso && bus.miso && bus.miso.gpio !== miso.gpio))) {
      notes.push(t('{part} uses other pins of an SPI block that another part already uses, so the starter leaves its SPI out.', { part: label }));
      block = null;
      bus = undefined;
    } else if (block === null) {
      notes.push(t('The SPI pins of {part} are not one SPI block on this chip, so the starter does not start SPI for it.', { part: label }));
    }
    const base = block !== null ? `SPI${block}` : `${cIdent(inst.id)}_SPI`;
    let ok = block !== null;
    const afs: [string, Signal, number][] = [];
    for (const [role, s] of [['SCK', sck], ['MOSI', mosi], ['MISO', miso]] as const) {
      if (!s) continue;
      if (!usable(s) || !claim(s, block !== null ? `SPI${block}` : `${inst.id} SPI`)) {
        ok = false;
        continue;
      }
      define(`${base}_${role}`, s.gpio, `${s.board.label}, ${role}${block === null ? ' (SPI not started)' : ''}`);
      if (block === null) continue;
      const n = afOf(s, `SPI${block}_${role}`);
      if (n === null) ok = false;
      else afs.push([role, s, n]);
    }
    if (ok && block !== null) {
      if (!bus) {
        bus = { block };
        spiBuses.push(bus);
        modules.add('spi');
        const handle = `hspi${block}`;
        const periph = `SPI${block}`;
        globals.push(`static SPI_HandleTypeDef ${handle};`);
        setup.push(
          '',
          `    // SPI${block} master, mode 0, ${Math.round(busHz(periph) / SPI_PRESCALER / 1000)} kHz (PCLK${APB2.has(periph) ? 2 : 1} ${busHz(periph) / 1e6} MHz / ${SPI_PRESCALER}). Pins and AF numbers: ${oneLine(afCite)}.`,
          `    // Talking to the part needs its command set: see the part datasheet.`,
          `    __HAL_RCC_SPI${block}_CLK_ENABLE();`,
          ...afs.map(([role, , n]) => `    pin_init(${base}_${role}_PORT, ${base}_${role}_PIN, GPIO_MODE_AF_PP, GPIO_NOPULL, ${afMacro(`SPI${block}_${role}`, n)});`),
          `    ${handle}.Instance = SPI${block};`,
          `    ${handle}.Init.Mode = SPI_MODE_MASTER;`,
          `    ${handle}.Init.Direction = SPI_DIRECTION_2LINES;`,
          `    ${handle}.Init.DataSize = SPI_DATASIZE_8BIT;`,
          `    ${handle}.Init.CLKPolarity = SPI_POLARITY_LOW;`,
          `    ${handle}.Init.CLKPhase = SPI_PHASE_1EDGE;`,
          `    ${handle}.Init.NSS = SPI_NSS_SOFT;`,
          `    ${handle}.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_${SPI_PRESCALER};`,
          `    ${handle}.Init.FirstBit = SPI_FIRSTBIT_MSB;`,
          `    ${handle}.Init.TIMode = SPI_TIMODE_DISABLE;`,
          `    ${handle}.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;`,
          `    ${handle}.Init.CRCPolynomial = 10;`,
          `    if (HAL_SPI_Init(&${handle}) != HAL_OK) printf("SPI${block} did not start\\n");`,
        );
      }
      if (sck) bus.sck ??= sck;
      if (mosi) bus.mosi ??= mosi;
      if (miso) bus.miso ??= miso;
    }
    if (cs && usable(cs) && claim(cs, `${cs.inst.id}.${cs.pin}`)) {
      const base2 = `${cIdent(inst.id)}_CS`;
      define(base2, cs.gpio, `${cs.board.label}, chip select of ${inst.id}`);
      setup.push('', `    // ${oneLine(label)} chip select: a plain output, HIGH = not selected.`, `    HAL_GPIO_WritePin(${base2}_PORT, ${base2}_PIN, GPIO_PIN_SET);`, `    pin_init(${base2}_PORT, ${base2}_PIN, GPIO_MODE_OUTPUT_PP, GPIO_NOPULL, 0);`);
    }
  }

  /* ---------------- everything else, part by part ---------------- */
  interface Pwm {
    timer: string;
    channels: Set<number>;
    psc: number;
    arr: number;
  }
  const timers = new Map<string, Pwm>();
  let fade = false;
  let adcUsed = false;
  const adcPsc = ADC_PRESCALERS.find((p) => pclk2 / p <= 36e6) ?? 8;
  const adcInfo = adcCalc(board, pclk2, `${adcPsc}:${ADC_SAMPLE_CYCLES}`);

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
      if (bus && addrs.length) {
        const list = addrs.map(hex2);
        report.push('', `        // ${label} (${inst.id}) on I2C${bus.block}, address ${list.join(' or ')}. HAL wants the address shifted left by one.`);
        if (def.idCheck) {
          const reg = parseInt(def.idCheck.register, 16);
          const expect = parseInt(def.idCheck.expect, 16);
          report.push(
            `        // Chip id: register ${def.idCheck.register} reads ${def.idCheck.expect}. Source: ${oneLine(partSource(def, def.idCheck.register) ?? def.name)}.`,
            `        // Real readings need the part's driver: see ${oneLine(driverSrc)}.`,
            '        {',
            `            static const uint8_t addr[] = {${list.join(', ')}};`,
            '            bool found = false;',
            '            for (unsigned i = 0; i < sizeof addr && !found; i++) {',
            '                uint8_t id = 0;',
            `                if (HAL_I2C_Mem_Read(&${bus.handle}, (uint16_t)(addr[i] << 1), ${hex2(reg)}, I2C_MEMADD_SIZE_8BIT, &id, 1, I2C_TIMEOUT_MS) == HAL_OK) {`,
            `                    printf("${cStr(inst.id)} (${cStr(label)}) at 0x%02X: chip id 0x%02X (expected ${hex2(expect)})\\n", (unsigned)addr[i], (unsigned)id);`,
            ...Object.entries(def.idCheck.otherValues ?? {}).flatMap(([val, text]) => {
              const n = parseInt(val, 16);
              return Number.isFinite(n) ? [`                    if (id == ${hex2(n)}) printf("  ${cStr(text)}\\n");`] : [];
            }),
            '                    found = true;',
            '                }',
            '            }',
            `            if (!found) printf("${cStr(inst.id)} (${cStr(label)}): no answer at ${list.join(' or ')}. Check the wiring, or run Debug in BoardPilot.\\n");`,
            '        }',
          );
        } else {
          report.push(
            '        // No chip id register in the parts library: only checks that the part answers.',
            `        // Using it needs the part's driver: see ${oneLine(driverSrc)}.`,
            '        {',
            `            static const uint8_t addr[] = {${list.join(', ')}};`,
            '            int at = -1;',
            `            for (unsigned i = 0; i < sizeof addr && at < 0; i++) if (HAL_I2C_IsDeviceReady(&${bus.handle}, (uint16_t)(addr[i] << 1), 2, I2C_TIMEOUT_MS) == HAL_OK) at = addr[i];`,
            `            if (at >= 0) printf("${cStr(inst.id)} (${cStr(label)}) answers at 0x%02X\\n", (unsigned)at);`,
            `            else printf("${cStr(inst.id)} (${cStr(label)}): no answer at ${list.join(' or ')}. Check the wiring, or run Debug in BoardPilot.\\n");`,
            '        }',
          );
        }
      }
    }

    for (const s of mine) {
      const base = mine.length === 1 ? cIdent(inst.id) : `${cIdent(inst.id)}_${cIdent(s.pin)}`;
      const shown = `${inst.id} ${s.pin} (${s.board.label})`;
      if (!usable(s)) {
        define(base, s.gpio, `${label} pin ${s.pin}, not used: see the notes in README.md`);
        continue;
      }
      if (!claim(s, `${s.inst.id}.${s.pin}`)) continue;

      // Part input driven by the board: an LED fades with a timer PWM channel, anything else starts LOW.
      if (s.role === 'digital_in') {
        let pwm: { fn: string; timer: string; ch: number; af: number } | null = null;
        if (isLed(def)) {
          for (const f of s.board.functions) {
            const m = /^TIM(\d+)_CH(\d)$/.exec(f);
            const af = s.board.af?.[f];
            if (!m || af === undefined) continue;
            const timer = `TIM${m[1]}`;
            if (timers.get(timer)?.channels.has(Number(m[2]))) continue;
            pwm = { fn: f, timer, ch: Number(m[2]), af };
            break;
          }
        }
        if (pwm) {
          fade = true;
          modules.add('tim').add('tim_ex');
          define(base, s.gpio, `${label} pin ${s.pin}, ${pwm.fn} (AF${pwm.af})`);
          let tim = timers.get(pwm.timer);
          if (!tim) {
            const clk = timHz(pwm.timer);
            const calc = pwmCalc(board, clk, PWM_HZ, 0);
            const psc = Number(calc.values.find(([k]) => k === 'PSC')?.[1] ?? 0);
            const arr = Number(calc.values.find(([k]) => k === 'ARR')?.[1] ?? 999);
            tim = { timer: pwm.timer, channels: new Set(), psc, arr };
            timers.set(pwm.timer, tim);
            const h = `h${pwm.timer.toLowerCase()}`;
            globals.push(`static TIM_HandleTypeDef ${h};`);
            setup.push(
              '',
              `    // ${pwm.timer}: PWM at ${PWM_HZ} Hz. f = timer clock / ((PSC + 1) x (ARR + 1)) = ${clk / 1e6} MHz / (${psc + 1} x ${arr + 1}).`,
              `    // Sources: ${oneLine(calc.source)}; timer clock: ${oneLine(timerCite)}.`,
              `    __HAL_RCC_${pwm.timer}_CLK_ENABLE();`,
              `    ${h}.Instance = ${pwm.timer};`,
              `    ${h}.Init.Prescaler = ${psc};`,
              `    ${h}.Init.CounterMode = TIM_COUNTERMODE_UP;`,
              `    ${h}.Init.Period = ${arr};`,
              `    ${h}.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;`,
              `    ${h}.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_ENABLE;`,
              `    if (HAL_TIM_PWM_Init(&${h}) != HAL_OK) printf("${pwm.timer} did not start\\n");`,
            );
          }
          tim.channels.add(pwm.ch);
          const h = `h${pwm.timer.toLowerCase()}`;
          setup.push(
            '',
            `    // ${label}: ${pwm.timer} channel ${pwm.ch} on ${at(s)}. ${pwm.fn} is AF${pwm.af}: ${oneLine(afCite)}.`,
            `    pin_init(${base}_PORT, ${base}_PIN, GPIO_MODE_AF_PP, GPIO_NOPULL, ${afMacro(pwm.fn, pwm.af)});`,
            `    pwm_start(&${h}, TIM_CHANNEL_${pwm.ch});`,
          );
          fast.push(`        __HAL_TIM_SET_COMPARE(&${h}, TIM_CHANNEL_${pwm.ch}, fade * ${Math.floor((tim.arr + 1) / 100)}U);  // ${label}: fades up and down`);
        } else {
          define(base, s.gpio, `${label} pin ${s.pin}, output`);
          setup.push('', `    // ${label} ${s.pin}: push-pull output, starts LOW.`, `    HAL_GPIO_WritePin(${base}_PORT, ${base}_PIN, GPIO_PIN_RESET);`, `    pin_init(${base}_PORT, ${base}_PIN, GPIO_MODE_OUTPUT_PP, GPIO_NOPULL, 0);`);
          if (isLed(def)) fast.push(`        HAL_GPIO_WritePin(${base}_PORT, ${base}_PIN, (tick / 25) % 2 ? GPIO_PIN_SET : GPIO_PIN_RESET);  // ${label}: blinks (0.5 s on, 0.5 s off)`);
          else fast.push(`        // HAL_GPIO_WritePin(${base}_PORT, ${base}_PIN, GPIO_PIN_SET);  // switches ${label} ${s.pin} on`);
        }
        continue;
      }

      // Analog output of the part: ADC1, when the pin has an ADC1 input in the board file.
      if (s.role === 'analog_out') {
        const ch = s.board.functions.map((f) => /^ADC1_IN(\d+)$/.exec(f)?.[1]).find((x) => x !== undefined);
        if (ch !== undefined) {
          modules.add('adc').add('adc_ex');
          adcUsed = true;
          define(base, s.gpio, `${label} pin ${s.pin}, ADC1_IN${ch}`);
          setup.push('', `    // ${label} ${s.pin}: analog input, ADC1 channel ${ch} (${pinCite ? oneLine(pinCite) : 'datasheet pin table'}).`, `    pin_init(${base}_PORT, ${base}_PIN, GPIO_MODE_ANALOG, GPIO_NOPULL, 0);`);
          report.push(
            '        {',
            `            int raw = adc_read(ADC_CHANNEL_${ch});`,
            `            if (raw < 0) printf("${cStr(shown)}: ADC read failed\\n");`,
            `            else printf("${cStr(shown)}: raw %d, about %lu mV\\n", raw, (unsigned long)raw * ${board.rules.adcMaxMv}UL / 4095UL);`,
            '        }',
          );
          continue;
        }
        notes.push(
          t('{part}: {pin} is not an analog pin, so the starter reads it as a digital level. Move the wire to {pins} for a real reading.', {
            part: label,
            pin: s.board.label,
            pins: board.rules.adcPins.map((id) => pinById(board, id)?.label ?? id).join(', '),
          }),
        );
      }

      // Everything the board reads: buttons with the internal pull-up, other outputs as they are.
      define(base, s.gpio, `${label} pin ${s.pin}, input`);
      if (s.role === 'onewire') {
        setup.push(
          '',
          `    // ${label} ${s.pin}: single-wire data line, idle HIGH through a pull-up. Reading the part`,
          `    // needs exact microsecond timing: see ${oneLine(src ?? 'the part datasheet')}. The starter only shows the level.`,
          `    pin_init(${base}_PORT, ${base}_PIN, GPIO_MODE_INPUT, GPIO_PULLUP, 0);`,
        );
        report.push(`        printf("${cStr(shown)}: level %d\\n", HAL_GPIO_ReadPin(${base}_PORT, ${base}_PIN) == GPIO_PIN_SET);`);
      } else if (isButton(def)) {
        globals.push(`static bool ${v}_was = false;`);
        setup.push('', `    // ${label}: input with the internal pull-up; pressing connects the pin to GND (reads 0).`, `    pin_init(${base}_PORT, ${base}_PIN, GPIO_MODE_INPUT, GPIO_PULLUP, 0);`);
        fast.push(
          '        {',
          `            bool now = HAL_GPIO_ReadPin(${base}_PORT, ${base}_PIN) == GPIO_PIN_RESET;`,
          `            if (now != ${v}_was) printf("${cStr(inst.id)} (${cStr(label)}): %s\\n", now ? "pressed" : "released");`,
          `            ${v}_was = now;`,
          '        }',
        );
      } else {
        setup.push('', `    // ${label} ${s.pin}: input; the part drives the level.`, `    pin_init(${base}_PORT, ${base}_PIN, GPIO_MODE_INPUT, GPIO_NOPULL, 0);`);
        report.push(`        printf("${cStr(shown)}: level %d\\n", HAL_GPIO_ReadPin(${base}_PORT, ${base}_PIN) == GPIO_PIN_SET);`);
      }
    }
  }

  if (adcUsed) {
    globals.push('static ADC_HandleTypeDef hadc1;');
    setup.unshift(
      '',
      `    // ADC1, 12-bit, one conversion at a time. ADC clock PCLK2 / ${adcPsc} = ${pclk2 / adcPsc / 1e6} MHz (at most 36 MHz),`,
      `    // ${ADC_SAMPLE_CYCLES}-cycle sampling. Source: ${oneLine(adcInfo.source)}.`,
      '    __HAL_RCC_ADC1_CLK_ENABLE();',
      '    hadc1.Instance = ADC1;',
      `    hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV${adcPsc};`,
      '    hadc1.Init.Resolution = ADC_RESOLUTION_12B;',
      '    hadc1.Init.ScanConvMode = DISABLE;',
      '    hadc1.Init.ContinuousConvMode = DISABLE;',
      '    hadc1.Init.DiscontinuousConvMode = DISABLE;',
      '    hadc1.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE;',
      '    hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;',
      '    hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;',
      '    hadc1.Init.NbrOfConversion = 1;',
      '    hadc1.Init.DMAContinuousRequests = DISABLE;',
      '    hadc1.Init.EOCSelection = ADC_EOC_SINGLE_CONV;',
      '    if (HAL_ADC_Init(&hadc1) != HAL_OK) printf("ADC1 did not start\\n");',
    );
    helpers.push(
      '// One ADC1 conversion of `channel`: 0 to 4095, or -1 when it failed.',
      'static int adc_read(uint32_t channel) {',
      '    ADC_ChannelConfTypeDef ch = {0};',
      '    ch.Channel = channel;',
      '    ch.Rank = 1;',
      `    ch.SamplingTime = ADC_SAMPLETIME_${ADC_SAMPLE_CYCLES}CYCLES;`,
      '    if (HAL_ADC_ConfigChannel(&hadc1, &ch) != HAL_OK || HAL_ADC_Start(&hadc1) != HAL_OK) return -1;',
      '    int value = HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK ? (int)HAL_ADC_GetValue(&hadc1) : -1;',
      '    HAL_ADC_Stop(&hadc1);',
      '    return value;',
      '}',
      '',
    );
  }
  if (timers.size)
    helpers.push(
      '// Starts one PWM channel at duty 0 (HAL also sets MOE on the advanced timer TIM1).',
      'static void pwm_start(TIM_HandleTypeDef *htim, uint32_t channel) {',
      '    TIM_OC_InitTypeDef oc = {0};',
      '    oc.OCMode = TIM_OCMODE_PWM1;',
      '    oc.Pulse = 0;',
      '    oc.OCPolarity = TIM_OCPOLARITY_HIGH;',
      '    oc.OCFastMode = TIM_OCFAST_DISABLE;',
      '    if (HAL_TIM_PWM_ConfigChannel(htim, &oc, channel) != HAL_OK || HAL_TIM_PWM_Start(htim, channel) != HAL_OK) printf("PWM did not start\\n");',
      '}',
      '',
    );

  /* ---------------- printf UART, clocks ---------------- */
  const txAf = stdioTx?.af?.[`${hal.stdio.uart}_TX`];
  const rxAf = stdioRx?.af?.[`${hal.stdio.uart}_RX`];
  const uartN = /\d+$/.exec(hal.stdio.uart)?.[0] ?? '2';
  if (stdioTx?.gpio != null) ports.add(portOf(stdioTx.gpio));
  if (stdioRx?.gpio != null) ports.add(portOf(stdioRx.gpio));
  const pllPMacro = `RCC_PLLP_DIV${hal.pllP}`;
  const hsiM = hal.pllSource === 'hse' ? (hal.pllM * 16_000_000) / hal.hseHz : null;
  const hsiFallback = hsiM !== null && Number.isInteger(hsiM) && hsiM >= 2 && hsiM <= 63 ? hsiM : null;
  const clockLines = [
    `// SYSCLK ${sysHz / 1e6} MHz from the PLL: ${hal.pllSource.toUpperCase()} ${inHz / 1e6} MHz / M ${hal.pllM} x N ${hal.pllN} / P ${hal.pllP}; PLL48CK = ${(inHz / hal.pllM) * hal.pllN / hal.pllQ / 1e6} MHz (Q ${hal.pllQ}).`,
    `// APB1 ${pclk1 / 1e6} MHz, APB2 ${pclk2 / 1e6} MHz; flash ${hal.flashLatency} wait states; regulator scale ${hal.vos}.`,
    `// Source: ${oneLine(clockCite)}. These match the board's clocks (${oneLine(board.clocks?.source.title ?? board.name)}).`,
    'static void SystemClock_Config(void) {',
    '    RCC_OscInitTypeDef osc = {0};',
    '    RCC_ClkInitTypeDef clk = {0};',
    '    __HAL_RCC_PWR_CLK_ENABLE();',
    `    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE${hal.vos});`,
    ...(hal.pllSource === 'hse'
      ? [
          '    osc.OscillatorType = RCC_OSCILLATORTYPE_HSE;',
          '    osc.HSEState = RCC_HSE_ON;',
          '    osc.PLL.PLLSource = RCC_PLLSOURCE_HSE;',
          `    osc.PLL.PLLM = ${hal.pllM};`,
        ]
      : ['    osc.OscillatorType = RCC_OSCILLATORTYPE_HSI;', '    osc.HSIState = RCC_HSI_ON;', '    osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;', '    osc.PLL.PLLSource = RCC_PLLSOURCE_HSI;', `    osc.PLL.PLLM = ${hal.pllM};`]),
    '    osc.PLL.PLLState = RCC_PLL_ON;',
    `    osc.PLL.PLLN = ${hal.pllN};`,
    `    osc.PLL.PLLP = ${pllPMacro};`,
    `    osc.PLL.PLLQ = ${hal.pllQ};`,
    ...(hal.pllSource === 'hse' && hsiFallback !== null
      ? [
          '    if (HAL_RCC_OscConfig(&osc) != HAL_OK) {',
          `        // The crystal did not start: same PLL output from the internal 16 MHz HSI (M ${hsiFallback}).`,
          '        osc.OscillatorType = RCC_OSCILLATORTYPE_HSI;',
          '        osc.HSEState = RCC_HSE_OFF;',
          '        osc.HSIState = RCC_HSI_ON;',
          '        osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;',
          '        osc.PLL.PLLSource = RCC_PLLSOURCE_HSI;',
          `        osc.PLL.PLLM = ${hsiFallback};`,
          '        if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();',
          '    }',
        ]
      : ['    if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();']),
    '    clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;',
    '    clk.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;',
    '    clk.AHBCLKDivider = RCC_SYSCLK_DIV1;',
    `    clk.APB1CLKDivider = RCC_HCLK_DIV${hal.apb1Div};`,
    `    clk.APB2CLKDivider = RCC_HCLK_DIV${hal.apb2Div};`,
    `    if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_${hal.flashLatency}) != HAL_OK) Error_Handler();`,
    '}',
    '',
  ];
  const stdioLines = [
    `// printf goes to ${uart} at ${hal.stdio.baud} baud (see syscalls.c). ${oneLine(hal.stdio.note)}`,
    `// ${hal.stdio.uart}_TX is AF${txAf ?? '?'} and ${hal.stdio.uart}_RX is AF${rxAf ?? '?'}: ${oneLine(afCite)}.`,
    'static void stdio_init(void) {',
    `    __HAL_RCC_${uart}_CLK_ENABLE();`,
    ...(stdioTx?.gpio != null && txAf !== undefined ? [`    pin_init(STDIO_TX_PORT, STDIO_TX, GPIO_MODE_AF_PP, GPIO_PULLUP, GPIO_AF${txAf}_${usartName(uartN)});`] : []),
    ...(stdioRx?.gpio != null && rxAf !== undefined ? [`    pin_init(STDIO_RX_PORT, STDIO_RX, GPIO_MODE_AF_PP, GPIO_PULLUP, GPIO_AF${rxAf}_${usartName(uartN)});`] : []),
    `    huart_stdio.Instance = ${uart};`,
    `    huart_stdio.Init.BaudRate = ${hal.stdio.baud};`,
    '    huart_stdio.Init.WordLength = UART_WORDLENGTH_8B;',
    '    huart_stdio.Init.StopBits = UART_STOPBITS_1;',
    '    huart_stdio.Init.Parity = UART_PARITY_NONE;',
    '    huart_stdio.Init.Mode = UART_MODE_TX_RX;',
    '    huart_stdio.Init.HwFlowCtl = UART_HWCONTROL_NONE;',
    '    huart_stdio.Init.OverSampling = UART_OVERSAMPLING_16;',
    '    if (HAL_UART_Init(&huart_stdio) != HAL_OK) Error_Handler();',
    '    setvbuf(stdout, NULL, _IONBF, 0);  // print every character at once',
    '}',
    '',
  ];

  const header = [`${name}: STM32 HAL starter generated by BoardPilot`, `Board: ${board.name} (${board.id}, ${board.chip}, ${hal.device})`, `Scene ${tag}: ${sceneParts(scene, parts).join('; ') || 'no parts'}`].map(oneLine);
  const hasI2c = buses.length > 0;
  const portList = [...ports].sort();
  const main = [
    ...header.map((l) => `// ${l}`),
    '//',
    '// Wiring (as in the 3D view):',
    ...wiringComment(signals, (s) => chipPin(s.gpio)),
    '//',
    `// Output: ${uart} at ${hal.stdio.baud} baud (in BoardPilot: Monitor). Values are printed once a second.`,
    '',
    '#include <stdbool.h>',
    '#include <stdio.h>',
    '#include "stm32f4xx_hal.h"',
    '',
    ...(defines.length ? [...defines, ''] : []),
    ...(stdioTx?.gpio != null ? [`#define STDIO_TX_PORT GPIO${portOf(stdioTx.gpio)}`, `#define STDIO_TX GPIO_PIN_${stdioTx.gpio % 16}`.padEnd(36) + `// ${chipPin(stdioTx.gpio)} (${stdioTx.label}), ${hal.stdio.uart}_TX`] : []),
    ...(stdioRx?.gpio != null ? [`#define STDIO_RX_PORT GPIO${portOf(stdioRx.gpio)}`, `#define STDIO_RX GPIO_PIN_${stdioRx.gpio % 16}`.padEnd(36) + `// ${chipPin(stdioRx.gpio)} (${stdioRx.label}), ${hal.stdio.uart}_RX`] : []),
    ...(hasI2c ? [`#define I2C_HZ ${I2C_HZ}`, `#define I2C_TIMEOUT_MS ${I2C_TIMEOUT_MS}`] : []),
    '',
    'UART_HandleTypeDef huart_stdio;  // used by _write() in syscalls.c',
    ...globals,
    '',
    '// HAL time base: SysTick every 1 ms (HAL_Init sets it up).',
    'void SysTick_Handler(void) {',
    '    HAL_IncTick();',
    '}',
    '',
    '// Stops here when the clock or the UART cannot start. A debugger shows where.',
    'static void Error_Handler(void) {',
    '    __disable_irq();',
    '    while (1) {',
    '    }',
    '}',
    '',
    '// Sets up one pin; alternate is the AF number for GPIO_MODE_AF_* (0 otherwise).',
    'static void pin_init(GPIO_TypeDef *port, uint32_t pin, uint32_t mode, uint32_t pull, uint32_t alternate) {',
    '    GPIO_InitTypeDef io = {0};',
    '    io.Pin = pin;',
    '    io.Mode = mode;',
    '    io.Pull = pull;',
    '    io.Speed = GPIO_SPEED_FREQ_LOW;',
    '    io.Alternate = alternate;',
    '    HAL_GPIO_Init(port, &io);',
    '}',
    '',
    ...clockLines,
    ...stdioLines,
    ...helpers,
    'int main(void) {',
    '    HAL_Init();',
    '    SystemClock_Config();',
    ...portList.map((p) => `    __HAL_RCC_GPIO${p}_CLK_ENABLE();`),
    '    stdio_init();',
    `    printf("${cStr(name)} on ${cStr(board.name)} (scene ${tag})\\n");`,
    ...setup,
    '',
    '    uint32_t tick = 0;',
    '    while (1) {',
    ...(fade ? ['        uint32_t fade = (tick / 100) % 2 ? 100 - tick % 100 : tick % 100;  // 0 to 100 %'] : []),
    ...fast,
    `        if (tick % ${REPORT_TICKS} == 0) {`,
    ...(report.length ? report.map((l) => (l ? `    ${l}` : l)).slice(report[0] === '' ? 1 : 0) : [`            printf("running, %lu s\\n", (unsigned long)(tick / ${REPORT_TICKS}));`]),
    '        }',
    '        tick++;',
    `        HAL_Delay(${TICK_MS});`,
    '    }',
    '}',
    '',
  ].join('\n');

  /* ---------------- HAL configuration: only the modules main.c uses ---------------- */
  const ORDER = ['rcc', 'gpio', 'dma', 'cortex', 'adc', 'flash', 'i2c', 'pwr', 'spi', 'tim', 'uart'];
  const enabled = ORDER.filter((m) => modules.has(m));
  const conf = [
    ...header.map((l) => `// ${l}`),
    '// HAL configuration: only the modules this project uses (the full list is in the HAL\'s',
    '// Inc/stm32f4xx_hal_conf_template.h).',
    '',
    '#ifndef STM32F4xx_HAL_CONF_H',
    '#define STM32F4xx_HAL_CONF_H',
    '',
    '#define HAL_MODULE_ENABLED',
    ...enabled.map((m) => `#define HAL_${m.toUpperCase()}_MODULE_ENABLED`),
    '',
    `// Oscillators. HSE_VALUE: ${oneLine(hal.pllSource === 'hse' ? `the board's ${hal.hseHz / 1e6} MHz crystal` : `the board's HSE input (${hal.hseHz / 1e6} MHz), not used by this clock setup`)}.`,
    `#define HSE_VALUE ${hal.hseHz}U`,
    '#define HSE_STARTUP_TIMEOUT 100U',
    '#define HSI_VALUE 16000000U',
    '#define LSI_VALUE 32000U',
    '#define LSE_VALUE 32768U',
    '#define LSE_STARTUP_TIMEOUT 5000U',
    '#define EXTERNAL_CLOCK_VALUE 12288000U',
    '',
    '#define VDD_VALUE 3300U',
    '#define TICK_INT_PRIORITY 0x0FU',
    '#define USE_RTOS 0U',
    '#define PREFETCH_ENABLE 1U',
    '#define INSTRUCTION_CACHE_ENABLE 1U',
    '#define DATA_CACHE_ENABLE 1U',
    '#define USE_SPI_CRC 0U',
    ...enabled.filter((m) => ['adc', 'i2c', 'spi', 'tim', 'uart'].includes(m)).map((m) => `#define USE_HAL_${m.toUpperCase()}_REGISTER_CALLBACKS 0U`),
    '',
    ...enabled.flatMap((m) => [`#ifdef HAL_${m.toUpperCase()}_MODULE_ENABLED`, `#include "stm32f4xx_hal_${m}.h"`, '#endif']),
    '',
    '#define assert_param(expr) ((void)0U)',
    '',
    '#endif',
    '',
  ].join('\n');

  const syscalls = [
    ...header.map((l) => `// ${l}`),
    '// The newlib system calls printf needs: _write sends to the UART, _sbrk hands out the heap',
    '// between the end of .bss and the stack (symbols from the linker script). The rest are stubs.',
    '',
    '#include <errno.h>',
    '#include <stddef.h>',
    '#include <stdint.h>',
    '#include <sys/stat.h>',
    '#include "stm32f4xx_hal.h"',
    '',
    'extern UART_HandleTypeDef huart_stdio;',
    '',
    'int _write(int file, char *ptr, int len) {',
    '    (void)file;',
    '    for (int i = 0; i < len; i++) {',
    "        if (ptr[i] == '\\n') HAL_UART_Transmit(&huart_stdio, (uint8_t *)\"\\r\", 1, HAL_MAX_DELAY);",
    '        HAL_UART_Transmit(&huart_stdio, (uint8_t *)&ptr[i], 1, HAL_MAX_DELAY);',
    '    }',
    '    return len;',
    '}',
    '',
    'void *_sbrk(ptrdiff_t incr) {',
    '    extern uint8_t _end;            // end of .bss',
    '    extern uint8_t _estack;         // top of RAM',
    '    extern uint32_t _Min_Stack_Size;',
    '    static uint8_t *heap_end = NULL;',
    '    const uintptr_t limit = (uintptr_t)&_estack - (uintptr_t)&_Min_Stack_Size;',
    '    if (heap_end == NULL) heap_end = &_end;',
    '    if ((uintptr_t)heap_end + (uintptr_t)incr > limit) {',
    '        errno = ENOMEM;',
    '        return (void *)-1;',
    '    }',
    '    uint8_t *prev = heap_end;',
    '    heap_end += incr;',
    '    return prev;',
    '}',
    '',
    'int _read(int file, char *ptr, int len) {',
    '    (void)file;',
    '    (void)ptr;',
    '    (void)len;',
    '    errno = ENOSYS;',
    '    return -1;',
    '}',
    'int _close(int file) {',
    '    (void)file;',
    '    return -1;',
    '}',
    'int _fstat(int file, struct stat *st) {',
    '    (void)file;',
    '    st->st_mode = S_IFCHR;',
    '    return 0;',
    '}',
    'int _isatty(int file) {',
    '    (void)file;',
    '    return 1;',
    '}',
    'int _lseek(int file, int ptr, int dir) {',
    '    (void)file;',
    '    (void)ptr;',
    '    (void)dir;',
    '    return 0;',
    '}',
    'int _getpid(void) {',
    '    return 1;',
    '}',
    'int _kill(int pid, int sig) {',
    '    (void)pid;',
    '    (void)sig;',
    '    errno = EINVAL;',
    '    return -1;',
    '}',
    'void _exit(int status) {',
    '    (void)status;',
    '    while (1) {',
    '    }',
    '}',
    '',
  ].join('\n');

  const flashK = Math.floor((board.flashBytes ?? 0) / 1024);
  const ramK = Math.floor((board.ramBytes ?? 0) / 1024);
  const ldName = `${board.chip}_FLASH.ld`;
  const linker = [
    ...header.map((l) => `/* ${l.replace(/\*\//g, '* /')} */`),
    `/* Memory: ${flashK} KB flash at 0x08000000, ${ramK} KB SRAM at 0x20000000 (board file flashBytes / ramBytes;`,
    '   STM32F4 memory map: RM0368 / RM0383 section 2.3). Same sections and symbols as STM32CubeMX scripts,',
    '   so the startup file from cmsis-device-f4 finds _sidata, _sdata, _edata, _sbss, _ebss and _estack. */',
    '',
    'ENTRY(Reset_Handler)',
    '',
    '_estack = ORIGIN(RAM) + LENGTH(RAM);',
    '_Min_Heap_Size = 0x400;',
    '_Min_Stack_Size = 0x800;',
    '',
    'MEMORY',
    '{',
    `  RAM (xrw)  : ORIGIN = 0x20000000, LENGTH = ${ramK}K`,
    `  FLASH (rx) : ORIGIN = 0x08000000, LENGTH = ${flashK}K`,
    '}',
    '',
    'SECTIONS',
    '{',
    '  .isr_vector : { . = ALIGN(4); KEEP(*(.isr_vector)) . = ALIGN(4); } >FLASH',
    '  .text : { . = ALIGN(4); *(.text) *(.text*) *(.glue_7) *(.glue_7t) *(.eh_frame) KEEP(*(.init)) KEEP(*(.fini)) . = ALIGN(4); _etext = .; } >FLASH',
    '  .rodata : { . = ALIGN(4); *(.rodata) *(.rodata*) . = ALIGN(4); } >FLASH',
    '  .ARM.extab : { *(.ARM.extab* .gnu.linkonce.armextab.*) } >FLASH',
    '  .ARM : { __exidx_start = .; *(.ARM.exidx*) __exidx_end = .; } >FLASH',
    '  .preinit_array : { PROVIDE_HIDDEN(__preinit_array_start = .); KEEP(*(.preinit_array*)) PROVIDE_HIDDEN(__preinit_array_end = .); } >FLASH',
    '  .init_array : { PROVIDE_HIDDEN(__init_array_start = .); KEEP(*(SORT(.init_array.*))) KEEP(*(.init_array*)) PROVIDE_HIDDEN(__init_array_end = .); } >FLASH',
    '  .fini_array : { PROVIDE_HIDDEN(__fini_array_start = .); KEEP(*(SORT(.fini_array.*))) KEEP(*(.fini_array*)) PROVIDE_HIDDEN(__fini_array_end = .); } >FLASH',
    '',
    '  _sidata = LOADADDR(.data);',
    '  .data : { . = ALIGN(4); _sdata = .; *(.data) *(.data*) *(.RamFunc) *(.RamFunc*) . = ALIGN(4); _edata = .; } >RAM AT> FLASH',
    '',
    '  . = ALIGN(4);',
    '  .bss : { _sbss = .; __bss_start__ = _sbss; *(.bss) *(.bss*) *(COMMON) . = ALIGN(4); _ebss = .; __bss_end__ = _ebss; } >RAM',
    '',
    '  /* Checks that the heap and the stack still fit in RAM. */',
    '  ._user_heap_stack : { . = ALIGN(8); PROVIDE(end = .); PROVIDE(_end = .); . = . + _Min_Heap_Size; . = . + _Min_Stack_Size; . = ALIGN(8); } >RAM',
    '',
    '  .ARM.attributes 0 : { *(.ARM.attributes) }',
    '}',
    '',
  ].join('\n');

  const startup = `startup_${hal.device.toLowerCase()}.s`;
  const halModules = [...modules].sort();
  const cmake = [
    ...header.map((l) => `# ${l}`),
    '# Build: cmake -B build -G Ninja && cmake --build build (needs arm-none-eabi-gcc, CMake 3.22+, Ninja and git).',
    '',
    'cmake_minimum_required(VERSION 3.22)',
    '',
    '# The Arm GCC toolchain file has to be set before project().',
    'if(NOT CMAKE_TOOLCHAIN_FILE)',
    '  set(CMAKE_TOOLCHAIN_FILE ${CMAKE_CURRENT_SOURCE_DIR}/cmake/gcc-arm-none-eabi.cmake)',
    'endif()',
    'if(NOT CMAKE_BUILD_TYPE)',
    '  set(CMAKE_BUILD_TYPE Debug)',
    'endif()',
    '',
    `project(${STM32_TARGET} C ASM)`,
    'set(CMAKE_C_STANDARD 11)',
    '',
    "# ST's HAL and CMSIS. By default CMake downloads them once from ST's official GitHub repositories,",
    '# at the tags below. With -DSTM32CUBE_F4_DIR=<folder> it uses an STM32CubeF4 package you already have',
    '# (STM32CubeIDE keeps one in ~/STM32Cube/Repository/STM32Cube_FW_F4_Vx.y.z) and downloads nothing.',
    'set(STM32CUBE_F4_DIR "" CACHE PATH "STM32CubeF4 package folder (optional)")',
    'if(STM32CUBE_F4_DIR)',
    '  set(HAL_DIR ${STM32CUBE_F4_DIR}/Drivers/STM32F4xx_HAL_Driver)',
    '  set(CMSIS_DEVICE_DIR ${STM32CUBE_F4_DIR}/Drivers/CMSIS/Device/ST/STM32F4xx)',
    '  set(CMSIS_CORE_DIR ${STM32CUBE_F4_DIR}/Drivers/CMSIS/Include)',
    'else()',
    '  include(FetchContent)',
    ...Object.entries(STM32_REPOS).map(([k, r]) => `  FetchContent_Declare(${k} GIT_REPOSITORY ${r.url} GIT_TAG ${r.tag} GIT_SHALLOW TRUE)`),
    `  FetchContent_MakeAvailable(${Object.keys(STM32_REPOS).join(' ')})`,
    '  set(HAL_DIR ${stm32f4xx_hal_driver_SOURCE_DIR})',
    '  set(CMSIS_DEVICE_DIR ${cmsis_device_f4_SOURCE_DIR})',
    '  set(CMSIS_CORE_DIR ${cmsis_core_SOURCE_DIR}/Include)',
    'endif()',
    '',
    '# HAL modules main.c uses (each is Src/stm32f4xx_hal_<module>.c).',
    `set(HAL_MODULES ${halModules.join(' ')})`,
    'list(TRANSFORM HAL_MODULES PREPEND ${HAL_DIR}/Src/stm32f4xx_hal_ OUTPUT_VARIABLE HAL_SOURCES)',
    'list(TRANSFORM HAL_SOURCES APPEND .c)',
    '',
    `add_executable(${STM32_TARGET}`,
    '  Core/Src/main.c',
    '  Core/Src/syscalls.c',
    '  ${HAL_DIR}/Src/stm32f4xx_hal.c',
    '  ${HAL_SOURCES}',
    '  # Startup code and SystemInit() from ST\'s CMSIS device templates.',
    '  ${CMSIS_DEVICE_DIR}/Source/Templates/system_stm32f4xx.c',
    `  \${CMSIS_DEVICE_DIR}/Source/Templates/gcc/${startup})`,
    `set_target_properties(${STM32_TARGET} PROPERTIES SUFFIX .elf)`,
    '',
    `target_compile_definitions(${STM32_TARGET} PRIVATE USE_HAL_DRIVER ${hal.device})`,
    `target_include_directories(${STM32_TARGET} PRIVATE Core/Inc \${HAL_DIR}/Inc \${CMSIS_DEVICE_DIR}/Include \${CMSIS_CORE_DIR})`,
    '# Cortex-M4 with the single-precision FPU.',
    'set(MCU_FLAGS -mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard)',
    `target_compile_options(${STM32_TARGET} PRIVATE \${MCU_FLAGS} -ffunction-sections -fdata-sections -Wall $<$<CONFIG:Debug>:-Og -g3>)`,
    `target_link_options(${STM32_TARGET} PRIVATE \${MCU_FLAGS} -T\${CMAKE_CURRENT_SOURCE_DIR}/${ldName} --specs=nano.specs -Wl,--gc-sections -Wl,-Map=${STM32_TARGET}.map -Wl,--print-memory-usage)`,
    '',
    '# Also writes the .bin (STM32CubeProgrammer, st-flash, drag and drop) and .hex files.',
    `add_custom_command(TARGET ${STM32_TARGET} POST_BUILD`,
    `  COMMAND \${CMAKE_OBJCOPY} -O binary $<TARGET_FILE:${STM32_TARGET}> ${STM32_TARGET}.bin`,
    `  COMMAND \${CMAKE_OBJCOPY} -O ihex $<TARGET_FILE:${STM32_TARGET}> ${STM32_TARGET}.hex)`,
    '',
  ].join('\n');

  const toolchainFile = [
    ...header.map((l) => `# ${l}`),
    '# Arm GNU toolchain (arm-none-eabi-gcc) for bare-metal Cortex-M, found on the PATH.',
    '',
    'set(CMAKE_SYSTEM_NAME Generic)',
    'set(CMAKE_SYSTEM_PROCESSOR arm)',
    'set(TOOLCHAIN_PREFIX arm-none-eabi-)',
    'set(CMAKE_C_COMPILER ${TOOLCHAIN_PREFIX}gcc)',
    'set(CMAKE_ASM_COMPILER ${TOOLCHAIN_PREFIX}gcc)',
    'set(CMAKE_CXX_COMPILER ${TOOLCHAIN_PREFIX}g++)',
    'set(CMAKE_OBJCOPY ${TOOLCHAIN_PREFIX}objcopy)',
    'set(CMAKE_SIZE ${TOOLCHAIN_PREFIX}size)',
    '# Test programs are built as libraries: a bare-metal program cannot link without our linker script.',
    'set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)',
    'set(CMAKE_ASM_FLAGS_INIT "-x assembler-with-cpp")',
    '',
  ].join('\n');

  const probe = board.toolchain.link === 'debug-probe';
  const readme = [
    `# ${oneLine(name)}`,
    '',
    `STM32 HAL starter project generated by BoardPilot for the **${board.name}** (\`${board.id}\`, ${board.chip}, \`${hal.device}\`).`,
    `Scene \`${tag}\`: ${sceneParts(scene, parts).join('; ') || 'no parts'}.`,
    '',
    "The folders follow the layout STM32CubeMX uses for CMake projects (`Core/Inc`, `Core/Src`, `cmake/`).",
    '',
    '## Wiring',
    '',
    ...wiringTable(signals, 'Chip pin', (s) => chipPin(s.gpio)),
    '',
    `printf output: ${uart}, ${hal.stdio.baud} baud. ${oneLine(hal.stdio.note)}`,
    ...(notes.length ? ['', '## Notes', '', ...notes.map((n) => `- ${oneLine(n)}`)] : []),
    '',
    '## Build',
    '',
    '1. Install the Arm GNU toolchain (`arm-none-eabi-gcc`), CMake 3.22 or newer, Ninja and git.',
    '2. In this folder: `cmake -B build -G Ninja`, then `cmake --build build`.',
    `   The first run downloads ST's HAL (${STM32_REPOS.stm32f4xx_hal_driver.tag}), CMSIS device F4 (${STM32_REPOS.cmsis_device_f4.tag}) and CMSIS core (${STM32_REPOS.cmsis_core.tag}) from github.com/STMicroelectronics.`,
    '   To use an STM32CubeF4 package you already have instead: `cmake -B build -G Ninja -DSTM32CUBE_F4_DIR=/path/to/STM32Cube_FW_F4_V1.28.x`.',
    `3. Flash \`build/${STM32_TARGET}.bin\`:`,
    ...(probe
      ? [
          `   - STM32CubeProgrammer: \`STM32_Programmer_CLI -c port=SWD -w build/${STM32_TARGET}.elf -v -rst\``,
          `   - or stlink tools: \`st-flash --reset write build/${STM32_TARGET}.bin 0x08000000\``,
          '   - or copy the .bin file to the board\'s USB drive.',
        ]
      : [
          `   - over USB (DFU): ${oneLine(board.toolchain.uploadNote ?? 'put the board in DFU mode')} Then \`STM32_Programmer_CLI -c port=usb1 -w build/${STM32_TARGET}.bin 0x08000000 -v -rst\``,
          `   - or with an ST-LINK on the SWD pins: \`st-flash --reset write build/${STM32_TARGET}.bin 0x08000000\``,
        ]),
    '4. Open the serial monitor (in BoardPilot: Monitor). The program prints the values once a second.',
    '',
    `HAL modules in this project: ${halModules.join(', ')} (set in CMakeLists.txt and Core/Inc/stm32f4xx_hal_conf.h).`,
    'Every hardware fact used in `main.c` has its datasheet source in a comment next to it.',
    '',
  ].join('\n');

  return {
    folder: `${slug(name)}-stm32-hal`,
    files: [
      { name: 'CMakeLists.txt', text: cmake },
      { name: 'cmake/gcc-arm-none-eabi.cmake', text: toolchainFile },
      { name: ldName, text: linker },
      { name: 'Core/Inc/stm32f4xx_hal_conf.h', text: conf },
      { name: 'Core/Src/main.c', text: main },
      { name: 'Core/Src/syscalls.c', text: syscalls },
      { name: 'README.md', text: readme },
    ],
    notes,
  };
}
