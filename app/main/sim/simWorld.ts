// The simulated bench. Holds the physical truth of a scenario and answers agent commands the way
// the real agent firmware would, including the pin safety rules.

import type { AgentPinState, AgentReplyMap, AgentRequest, BoardDef, I2cTraceStep, StreamFrame } from '@shared/types';
import { DEFAULT_BOARD_ID, getBoard, headerGpios, isAdcPin, pinByGpio } from '@shared/board';
import { benchScenarios } from './bench';
import { DriverError } from '../hardware/errors';
import { t } from '@shared/i18n';
import { agentErrorText } from '@shared/protocol';
import type { Scenario, SimPhysical, SimI2cDevice } from './scenario';
import { simRegister } from './registers';

import swapped from './scenarios/weather-station-swapped.json';
import healthy from './scenarios/healthy.json';
import bmp280 from './scenarios/bmp280-mixup.json';
import unpowered from './scenarios/sensor-unpowered.json';
import noBoard from './scenarios/no-board.json';
import portBusy from './scenarios/port-busy.json';
import resetting from './scenarios/keeps-resetting.json';
import garbage from './scenarios/garbage-serial.json';
import labMistakes from './scenarios/lab-mistakes.json';
import imuAsleep from './scenarios/imu-asleep.json';

/** Hand-written benches for the ESP32 DevKit. Other boards get generated benches (see bench.ts). */
export const SCENARIOS: Scenario[] = [swapped, healthy, bmp280, unpowered, noBoard, portBusy, resetting, garbage, labMistakes, imuAsleep].map(
  (s) => s as unknown as Scenario,
);

export const DEFAULT_SCENARIO = 'weather-station-swapped';

export function scenariosFor(board: BoardDef): Scenario[] {
  return board.id === DEFAULT_BOARD_ID ? SCENARIOS : benchScenarios(board);
}

function agentError(code: string): DriverError {
  const text = agentErrorText(code);
  return new DriverError(`agent_${code}`, text.humanMessage, text.hint);
}

export class SimWorld {
  board: BoardDef;
  scenario: Scenario;
  firmware: 'user' | 'agent' = 'user';
  fixed = false;
  private driven = new Map<number, AgentPinState>();
  private knobSweepStart = 0;
  private buttonDownUntil = 0;
  private readonly bootTime = Date.now();

  constructor(scenarioId: string = DEFAULT_SCENARIO, board: BoardDef = getBoard()) {
    this.board = board;
    const list = scenariosFor(board);
    this.scenario = list.find((s) => s.id === scenarioId) ?? list[0];
  }

  get scenarios(): Scenario[] {
    return scenariosFor(this.board);
  }

  /** Put a different board on the simulated bench. Keeps the same kind of scenario when there is one. */
  setBoard(board: BoardDef) {
    if (board.id === this.board.id) return;
    const kind = this.scenario.id.replace(/^.*:/, '');
    this.board = board;
    const list = scenariosFor(board);
    this.scenario = list.find((s) => s.id.replace(/^.*:/, '') === kind) ?? list[0];
    this.firmware = 'user';
    this.fixed = false;
    this.driven.clear();
  }

  load(id: string) {
    this.scenario = this.scenarios.find((s) => s.id === id) ?? this.scenario;
    this.firmware = 'user';
    this.fixed = false;
    this.driven.clear();
  }

  private get adcMax() {
    return this.board.rules.adcMaxMv;
  }

  private get sensorPins() {
    return this.scenario.serial.pins ?? { sda: 21, scl: 22, pot: 34 };
  }

  get physical(): SimPhysical {
    return this.fixed && this.scenario.fixedPhysical ? this.scenario.fixedPhysical : this.scenario.physical;
  }

  fixWiring() {
    this.fixed = true;
  }

  turnKnob() {
    this.knobSweepStart = Date.now();
  }

  /** "Press the button" demo: every simulated button is held down for 4 s. */
  pressButton() {
    this.buttonDownUntil = Date.now() + 4000;
  }

  agentBoot() {
    this.firmware = 'agent';
    this.driven.clear();
    for (const [g, s] of Object.entries(this.scenario.initialAgentPins ?? {})) this.driven.set(Number(g), { ...s });
  }

  millis() {
    return Date.now() - this.bootTime;
  }

  /* ---------- physics ---------- */

  private devicesOn(gpio: number): SimI2cDevice[] {
    return this.physical.i2c.filter((d) => d.sda === gpio || d.scl === gpio);
  }

  externalPull(gpio: number): 'pullup' | 'pulldown' | null {
    const p = this.physical.pins[String(gpio)];
    if (p?.external) return p.external;
    if (this.devicesOn(gpio).some((d) => d.pullups && d.powered)) return 'pullup';
    return null;
  }

  analogMv(gpio: number): number | null {
    const a = this.physical.pins[String(gpio)]?.analog;
    if (!a) return null;
    let mv = a.mv;
    const since = Date.now() - this.knobSweepStart;
    if (since < 8000 && !a.stuck) {
      // "Turn the knob" demo: sweep 0 → full scale → 0 over 8 s
      const phase = since / 8000;
      mv = Math.round(this.adcMax * (phase < 0.5 ? phase * 2 : (1 - phase) * 2));
    }
    return Math.max(0, Math.min(this.adcMax, Math.round(mv + (Math.random() - 0.5) * 2 * a.noise)));
  }

  levelOf(gpio: number): 0 | 1 {
    const d = this.driven.get(gpio);
    if (d?.mode === 'out') return d.level ?? 0;
    if (d?.mode === 'pwm') {
      // A real square wave: the level follows the PWM phase at the moment of the sample, so slow PWM
      // shows its period in the timing view and fast PWM aliases the way a real sampled signal does.
      const hz = d.hz ?? 0;
      if (!(hz > 0)) return (d.duty ?? 0) >= 100 ? 1 : 0;
      const phase = ((performance.now() / 1000) * hz) % 1;
      return phase * 100 < (d.duty ?? 0) ? 1 : 0;
    }
    const mv = this.analogMv(gpio);
    if (mv !== null) return mv > this.adcMax / 2 ? 1 : 0;
    const pull = this.externalPull(gpio);
    if (this.physical.pins[String(gpio)]?.button) {
      if (Date.now() < this.buttonDownUntil) return 0;
      // Released with no pull-up or pull-down: the pin floats and reads at random.
      if (!pull) return Math.random() < 0.5 ? 1 : 0;
    }
    return pull === 'pullup' ? 1 : 0;
  }

  pinState(gpio: number): AgentPinState {
    if (pinByGpio(this.board, gpio)?.flags.includes('uart0')) return { mode: 'uart' };
    const d = this.driven.get(gpio);
    if (d?.mode === 'pwm') return { mode: 'pwm', duty: d.duty, hz: d.hz, level: this.levelOf(gpio) };
    if (d?.mode === 'out') return { mode: 'out', level: d.level };
    if (d?.mode === 'adc') {
      const mv = this.analogMv(gpio);
      // Honest: an unconnected ADC pin still reads something; the sim returns a low floating value.
      return { mode: 'adc', mv: mv ?? Math.round(Math.random() * 60) };
    }
    return { mode: 'in', level: this.levelOf(gpio) };
  }

  /* ---------- agent command handling ---------- */

  /** Same rules as the agent firmware, read from the board file. */
  private checkPin(gpio: number, output: boolean) {
    const p = pinByGpio(this.board, gpio);
    if (p?.flags.includes('flash')) throw agentError('flash_pin');
    if (!p || p.kind !== 'gpio') throw agentError('bad_pin');
    if (p.flags.includes('uart0')) throw agentError('uart_pin');
    if (output && p.flags.includes('input_only')) throw agentError('input_only');
  }

  private findDevice(sda: number, scl: number, addr?: string): SimI2cDevice | undefined {
    return this.physical.i2c.find(
      (d) => d.powered && d.sda === sda && d.scl === scl && (!addr || d.addr.toLowerCase() === addr.toLowerCase()),
    );
  }

  private busPulledUp(sda: number, scl: number) {
    return this.externalPull(sda) === 'pullup' && this.externalPull(scl) === 'pullup';
  }

  handle<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>): AgentReplyMap[K] {
    if (this.firmware !== 'agent') {
      throw new DriverError('agent_missing', t('The diagnostic agent is not on the board.'), t('Install it first (the app asks before writing).'));
    }
    const r = req as AgentRequest;
    switch (r.cmd) {
      case 'hello':
        return {
          agent: 'bp-agent',
          ver: '0.2',
          chip: this.scenario.chip.chip,
          board: this.board.id,
          heapFree: (this.board.ramBytes ? Math.round(this.board.ramBytes * 0.6) : 201344) - Math.round(Math.random() * 400),
        } as AgentReplyMap[K];
      case 'strapping':
        return { strapping: this.scenario.strappingAtBoot } as AgentReplyMap[K];
      case 'pins': {
        const pins: Record<string, AgentPinState> = {};
        for (const g of headerGpios(this.board)) pins[String(g)] = this.pinState(g);
        return { pins } as AgentReplyMap[K];
      }
      case 'pullup_check': {
        const external: Record<string, boolean> = {};
        const levels: Record<string, 0 | 1> = {};
        for (const g of r.pins) {
          this.checkPin(g, false);
          this.driven.delete(g);
          external[String(g)] = this.externalPull(g) === 'pullup';
          levels[String(g)] = this.levelOf(g);
        }
        return { external, levels } as AgentReplyMap[K];
      }
      case 'i2c_scan': {
        this.checkPin(r.sda, true);
        this.checkPin(r.scl, true);
        const found: string[] = [];
        const trace: I2cTraceStep[] = [];
        if (this.busPulledUp(r.sda, r.scl)) {
          for (const d of this.physical.i2c) {
            if (d.powered && d.sda === r.sda && d.scl === r.scl) {
              found.push(d.addr);
              trace.push({ t: 'start' }, { t: 'addr', v: d.addr, rw: 'w', ack: true }, { t: 'stop' });
            }
          }
        }
        if (!found.length) trace.push({ t: 'start' }, { t: 'addr', v: '0x08', rw: 'w', ack: false }, { t: 'stop' });
        return { found, trace } as AgentReplyMap[K];
      }
      case 'i2c_read': {
        this.checkPin(r.sda, true);
        this.checkPin(r.scl, true);
        const dev = this.busPulledUp(r.sda, r.scl) ? this.findDevice(r.sda, r.scl, r.addr) : undefined;
        const trace: I2cTraceStep[] = [{ t: 'start' }, { t: 'addr', v: r.addr, rw: 'w', ack: !!dev }];
        if (!dev) {
          trace.push({ t: 'stop' });
          const text = agentErrorText('nack');
          throw Object.assign(new DriverError('agent_nack', text.humanMessage, text.hint), { trace });
        }
        const data: string[] = [];
        const regNum = parseInt(r.reg, 16);
        for (let i = 0; i < Math.min(r.len, 32); i++) {
          const key = '0x' + (regNum + i).toString(16).toUpperCase().padStart(2, '0');
          data.push(simRegister(dev, key));
        }
        trace.push({ t: 'data', v: r.reg, dir: 'w', ack: true }, { t: 'restart' }, { t: 'addr', v: r.addr, rw: 'r', ack: true });
        data.forEach((v, i) => trace.push({ t: 'data', v, dir: 'r', ack: i < data.length - 1 }));
        trace.push({ t: 'stop' });
        return { data, trace } as AgentReplyMap[K];
      }
      case 'adc': {
        this.checkPin(r.pin, false);
        const ap = pinByGpio(this.board, r.pin);
        if (!ap || !isAdcPin(ap)) throw agentError('not_adc');
        this.driven.set(r.pin, { mode: 'adc' });
        const mv = this.analogMv(r.pin) ?? Math.round(Math.random() * 60);
        const full = this.board.family === 'avr' ? 1023 : 4095;
        return { mv, raw: Math.round((mv / this.adcMax) * full) } as AgentReplyMap[K];
      }
      case 'pwm':
        this.checkPin(r.pin, true);
        this.driven.set(r.pin, { mode: 'pwm', duty: r.duty, hz: r.hz });
        return {} as AgentReplyMap[K];
      case 'gpio_write':
        this.checkPin(r.pin, true);
        this.driven.set(r.pin, { mode: 'out', level: r.level });
        return {} as AgentReplyMap[K];
      case 'gpio_read':
        this.checkPin(r.pin, false);
        return { level: this.levelOf(r.pin) } as AgentReplyMap[K];
      case 'reset_pins':
        this.driven.clear();
        return {} as AgentReplyMap[K];
      case 'stream':
      case 'stream_stop':
        return {} as AgentReplyMap[K];
    }
    throw agentError('unknown_cmd');
  }

  frame(pins: number[]): StreamFrame {
    const out: Record<string, AgentPinState> = {};
    for (const g of pins) out[String(g)] = this.pinState(g);
    return { t: this.millis(), pins: out };
  }

  /* ---------- the user's own firmware on serial ---------- */

  private sensorReachable() {
    const { sda, scl } = this.sensorPins;
    return !!this.findDevice(sda, scl, '0x76') && this.busPulledUp(sda, scl);
  }

  /** Lines the user's firmware prints during one tick. */
  userFirmwareTick(tick: number): string[] {
    const s = this.scenario.serial;
    if (s.mode === 'resetting') {
      const phase = tick % 30;
      if (phase === 0)
        return [
          'ets Jun  8 2016 00:22:57',
          '',
          'rst:0xc (SW_CPU_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)',
          'configsip: 0, SPIWP:0xee',
          'mode:DIO, clock div:1',
          'load:0x3fff0030,len:1184',
          'entry 0x400805e4',
          'Starting Wi-Fi…',
        ];
      if (phase === 8) return ['Brownout detector was triggered', ''];
      return [];
    }
    if (s.mode === 'lines') {
      const lines = s.lines ?? [];
      return lines.length ? [lines[tick % lines.length]] : [];
    }
    // weather
    const out: string[] = [];
    const t = this.millis();
    const sp = this.sensorPins;
    const pot = sp.pot === null ? null : this.analogMv(sp.pot);
    if (!this.sensorReachable()) {
      if (tick % 10 === 0) out.push('Could not find a valid BME280 sensor, check wiring!');
      if (pot !== null) out.push(`@bp {"t":${t},"v":{"pot":${pot}},"pins":{"pot":${sp.pot}}}`);
      return out;
    }
    const temp = 22.4 + Math.sin(t / 20000) * 0.6 + (Math.random() - 0.5) * 0.05;
    const hum = 41.2 + Math.sin(t / 31000) * 2 + (Math.random() - 0.5) * 0.2;
    const pres = 1013.2 + Math.sin(t / 60000) * 0.4 + (Math.random() - 0.5) * 0.05;
    const v: Record<string, number> = {
      temperature: +temp.toFixed(2),
      humidity: +hum.toFixed(1),
      pressure: +pres.toFixed(2),
    };
    if (pot !== null) v.pot = pot;
    out.push(
      `@bp {"t":${t},"v":${JSON.stringify(v)},"pins":{"temperature":${sp.sda},"humidity":${sp.sda},"pressure":${sp.sda}${sp.pot === null ? '' : `,"pot":${sp.pot}`}}}`,
    );
    if (tick % 10 === 0) {
      out.push(`T=${temp.toFixed(1)} C  H=${hum.toFixed(0)} %  P=${pres.toFixed(1)} hPa  knob=${pot ?? '-'} mV`);
      const heap = 201000 - Math.round(Math.random() * 2000) - ((tick / 10) % 50) * 16;
      out.push(`@bp {"t":${t},"mem":{"heapFree":${heap},"heapMin":188200,"heapSize":327680,"stackFree":5912}}`);
    }
    return out;
  }
}

/** Turn a clean line into what a terminal shows at the wrong baud rate. */
export function garble(line: string, seed: number): string {
  const junk = ['⸮', 'ÿ', 'à', 'ø', '\u0000', '¾', 'ƒ', 'x', '§', 'Ñ'];
  let s = '';
  let x = seed + line.length * 7;
  const n = Math.max(3, Math.round(line.length * 0.35));
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    s += junk[x % junk.length];
  }
  return s;
}
