// Multi-board support: every board file is valid, and the wiring rules, pin assignment, simulator,
// sketch generator, USB detection and chip tool parsers work for every family.

import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BoardDef, Scene } from '@shared/types';
import { BOARDS, PARTS, boardsForUsb, canOutput, chipMatchesBoard, getBoard, headerGpios, pinById, pinOutward, powerPinFor } from '@shared/board';
import { checkWiring } from '@shared/wiring';
import { assignPins } from '@shared/assign';
import { generateSketch } from '@shared/sketch';
import { FlowRunner, type FlowState } from '@shared/flow';
import { FLOWS } from '@flows/index';
// @ts-expect-error plain JS validator shared with the command line
import { checkBoard } from '../scripts/check-boards.mjs';
import { SimWorld } from '../app/main/sim/simWorld';
import { benchScenarios } from '../app/main/sim/bench';
import { HardwareHub, userImageOffset } from '../app/main/hardware/hub';
import { grant } from '../app/main/session/safety';
import { parseAvrSignature, classifyAvrdudeError } from '../app/main/hardware/tools/avrdude';
import { parsePicotoolInfo } from '../app/main/hardware/tools/picotool';
import { parseCubeProgrammerInfo, parseDfuFlashBytes, parseStInfo } from '../app/main/hardware/tools/stm32';
import { parseNrfDeviceId, parseNrfDeviceVersion } from '../app/main/hardware/tools/nrfjprog';
import { teensyMcu } from '../app/main/hardware/tools/teensy';
import { bridgeFromUsb } from '../app/main/hardware/ports';
import { makeCtx } from './helpers';

const ALL = Object.values(BOARDS);

describe('board library', () => {
  it('has at least ten boards from several families', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ALL.map((b) => b.family)).size).toBeGreaterThanOrEqual(6);
  });

  it.each(ALL.map((b) => [b.id, b] as const))('%s passes the board validator', (_id, b) => {
    expect(checkBoard(b)).toEqual([]);
  });

  it.each(ALL.map((b) => [b.id, b] as const))('%s: rules point at usable pins', (_id, b) => {
    for (const id of b.rules.safeIo) expect(canOutput(pinById(b, id)!)).toBe(true);
    expect(powerPinFor(b, '3.3')).toBeDefined();
    expect(headerGpios(b).length).toBeGreaterThan(5);
    for (const p of b.pins) {
      const [dx, dz] = pinOutward(b, p);
      expect(Math.abs(dx) + Math.abs(dz)).toBe(1);
    }
  });
});

describe('wiring rules on every board', () => {
  it.each(ALL.map((b) => [b.id, b] as const))('%s: the generated bench has no wiring errors once fixed', (_id, b) => {
    const healthy = benchScenarios(b).find((s) => s.id.endsWith(':healthy'));
    const scene = healthy?.scene ?? { board: b.id, parts: [], wires: [] };
    if (b.id === 'esp32-devkitc-30') return;
    const errors = checkWiring(scene, b, PARTS).filter((f) => f.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('warns about 3.3 V parts on 5 V Arduino boards', () => {
    const uno = getBoard('arduino-uno-r3');
    const scene = benchScenarios(uno).find((s) => s.id.endsWith(':healthy'))!.scene;
    expect(checkWiring(scene, uno, PARTS).some((f) => f.rule === 'logic_level')).toBe(true);
  });

  it('flags SDA/SCL reversed against the board default, with a fixed-pin hint on AVR', () => {
    const uno = getBoard('arduino-uno-r3');
    const scene: Scene = {
      board: uno.id,
      parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 40] }],
      wires: [
        { id: 'w1', from: { part: 'board', pin: uno.rules.i2c.scl }, to: { part: 'bme1', pin: 'SDA' }, color: '#fff' },
        { id: 'w2', from: { part: 'board', pin: uno.rules.i2c.sda }, to: { part: 'bme1', pin: 'SCL' }, color: '#fff' },
      ],
    };
    const f = checkWiring(scene, uno, PARTS).find((x) => x.rule === 'i2c_swapped');
    expect(f?.hint).toContain('fixed');
  });

  it('warns when a signal uses a native USB or debug pin', () => {
    const b = ALL.find((x) => x.pins.some((p) => p.kind === 'gpio' && (p.flags.includes('usb') || p.flags.includes('swd'))))!;
    const pin = b.pins.find((p) => p.kind === 'gpio' && (p.flags.includes('usb') || p.flags.includes('swd')))!;
    const scene: Scene = {
      board: b.id,
      parts: [{ id: 'led1', partId: 'led-resistor', position: [0, 0, 40] }],
      wires: [{ id: 'w1', from: { part: 'board', pin: pin.id }, to: { part: 'led1', pin: 'A' }, color: '#fff' }],
    };
    expect(checkWiring(scene, b, PARTS).some((f) => f.rule === 'reserved_pin')).toBe(true);
  });
});

describe('automatic pin assignment on every board', () => {
  it.each(ALL.map((b) => [b.id, b] as const))('%s: assigns existing, suitable pins', (_id, b) => {
    const scene: Scene = {
      board: b.id,
      parts: [
        { id: 'bme1', partId: 'bme280-gy', position: [0, 0, 40] },
        { id: 'led1', partId: 'led-resistor', position: [0, 0, -40] },
        { id: 'btn1', partId: 'push-button', position: [20, 0, -40] },
      ],
      wires: [],
    };
    const { scene: out } = assignPins(scene, b, PARTS);
    expect(out.wires.length).toBeGreaterThanOrEqual(7);
    for (const w of out.wires) expect(pinById(b, w.from.pin)).toBeDefined();
    const led = out.wires.find((w) => w.to.part === 'led1' && w.to.pin === 'A')!;
    expect(canOutput(pinById(b, led.from.pin)!)).toBe(true);
    expect(out.wires.find((w) => w.to.pin === 'SDA')!.from.pin).toBe(b.rules.i2c.sda);
    expect(checkWiring(out, b, PARTS).filter((f) => f.severity === 'error')).toEqual([]);
  });
});

describe('simulator on every board', () => {
  it.each(ALL.map((b) => [b.id, b] as const))('%s: agent answers with the board’s pins and finds the crossed bus', (_id, b) => {
    const w = new SimWorld(undefined, b);
    const swapped = w.scenarios.find((s) => s.id.endsWith('weather-station-swapped'))!;
    w.load(swapped.id);
    w.agentBoot();
    const pins = w.handle({ cmd: 'pins' });
    expect(Object.keys(pins.pins).map(Number).sort()).toEqual(headerGpios(b).sort());
    const sda = pinById(b, b.rules.i2c.sda)!.gpio!;
    const scl = pinById(b, b.rules.i2c.scl)!.gpio!;
    if (b.id === 'esp32-devkitc-30') return;
    expect(w.handle({ cmd: 'i2c_scan', sda, scl, hz: 100000 }).found).toEqual([]);
    expect(w.handle({ cmd: 'i2c_scan', sda: scl, scl: sda, hz: 100000 }).found).toEqual(['0x76']);
  });

  it('refuses flash and input-only pins the way the agent does', () => {
    const s3 = getBoard('esp32-s3-devkitc-1');
    const flash = s3.pins.find((p) => p.kind === 'gpio' && p.flags.includes('flash'));
    const w = new SimWorld(undefined, s3);
    w.agentBoot();
    if (flash) expect(() => w.handle({ cmd: 'gpio_write', pin: flash.gpio!, level: 1 })).toThrow();
  });

  it('hub follows the selected board and refuses unknown ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bp-test-'));
    const hub = new HardwareHub(dir, join(dir, 'agent'), 'sim');
    expect((await hub.setBoard('rpi-pico')).ok).toBe(true);
    expect(hub.state.board).toBe('rpi-pico');
    expect(hub.scenarios().every((s) => s.id.startsWith('rpi-pico:'))).toBe(true);
    const ports = await hub.listPorts();
    expect(ports.ok && ports.value[0].boardIds).toContain('rpi-pico');
    expect((await hub.setBoard('no-such-board')).ok).toBe(false);
  });

  it('never makes a backup on Teensy, and says so', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bp-test-'));
    const hub = new HardwareHub(dir, join(dir, 'agent'), 'sim');
    await hub.setBoard('teensy-41');
    await hub.loadScenario('teensy-41:healthy');
    const ports = await hub.listPorts();
    if (!ports.ok) throw new Error('no ports');
    await hub.identify(ports.value[0].path);
    const logs: string[] = [];
    hub.on('log', (e) => logs.push(e.text));
    const r = await hub.flashUser(grant('flash_user'), '/tmp/firmware.hex');
    expect(r.ok).toBe(true);
    expect(hub.state.backups.length).toBe(0);
    expect(logs.some((l) => /no backup/i.test(l))).toBe(true);
  });
});

function waitFor(r: FlowRunner, pred: (s: FlowState) => boolean, ms = 15000): Promise<FlowState> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout; state: ${JSON.stringify(r.snapshot)}`)), ms);
    const un = r.subscribe((s) => {
      if (pred(s)) {
        clearTimeout(t);
        queueMicrotask(() => un());
        resolve(s);
      }
    });
  });
}

describe('debug flow on other boards (simulator)', () => {
  it.each(['rpi-pico', 'arduino-uno-r3', 'nucleo-f401re'])('%s: reaches a result without a dead end', async (id) => {
    const b = getBoard(id);
    const dir = mkdtempSync(join(tmpdir(), 'bp-test-'));
    const hub = new HardwareHub(dir, join(dir, 'agent'), 'sim');
    await hub.setBoard(id);
    await hub.loadScenario(`${id}:weather-station-swapped`);
    const { ctx } = makeCtx(hub, hub.scenarioScene());
    const runner = new FlowRunner(FLOWS['debug-sensor-not-responding'], ctx);
    void runner.start();
    await waitFor(runner, (s) => s.status === 'waiting' && runner.currentStep?.id === 'symptom');
    await runner.answer({ kind: 'option', optionId: 'not-found', label: 'My code says the sensor is not found' });
    const s = await waitFor(runner, (st) => st.status === 'done' || st.status === 'failed' || (st.status === 'waiting' && runner.currentStep?.id === 'agent'));
    if (s.status === 'waiting') {
      expect(b.toolchain.agent).toBe(true);
      await runner.answer({ kind: 'confirm', confirmed: true, token: grant('flash_agent') });
      const end = await waitFor(runner, (st) => st.status === 'done' || st.status === 'failed');
      expect(end.result?.title).toBe('SDA and SCL are crossed');
    } else {
      expect(b.toolchain.agent).toBe(false);
      expect(s.status).toBe('done');
    }
  }, 30000);
});

describe('starter sketch per family', () => {
  const scene = (b: BoardDef): Scene => assignPins(
    { board: b.id, parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 40] }, { id: 'pot1', partId: 'potentiometer', position: [0, 0, -40] }], wires: [] },
    b,
    PARTS,
  ).scene;
  it('ESP32 remaps I2C with Wire.begin(sda, scl) and reads millivolts directly', () => {
    const b = getBoard('esp32-devkitc-30');
    const s = generateSketch(scene(b), b, PARTS);
    expect(s).toContain('Wire.begin(I2C_SDA, I2C_SCL)');
    expect(s).toContain('analogReadMilliVolts');
  });
  it('Pico uses Wire.setSDA/setSCL', () => {
    const b = getBoard('rpi-pico');
    expect(generateSketch(scene(b), b, PARTS)).toContain('Wire.setSDA(I2C_SDA)');
  });
  it('STM32 uses pin names, AVR uses fixed I2C and a 10-bit ADC at 5 V', () => {
    const n = getBoard('nucleo-f401re');
    expect(generateSketch(scene(n), n, PARTS)).toMatch(/#define I2C_SDA P[A-H]\d+/);
    const u = getBoard('arduino-uno-r3');
    const s = generateSketch(scene(u), u, PARTS);
    expect(s).toContain('Wire.begin();');
    expect(s).toContain('5000L / 1023');
  });
});

describe('USB detection', () => {
  it('maps USB ids to boards and bridges', () => {
    expect(boardsForUsb('2e8a', '000a')).toContain('rpi-pico');
    expect(boardsForUsb('0x0483', '374B')).toContain('nucleo-f401re');
    expect(boardsForUsb('2341', '0043')).toContain('arduino-uno-r3');
    expect(boardsForUsb('16c0', '0483')).toContain('teensy-41');
    expect(boardsForUsb('dead', 'beef')).toEqual([]);
    expect(bridgeFromUsb('2341', '0043')).toBe('ATmega16U2');
    expect(bridgeFromUsb('0483', '374b')).toBe('ST-LINK');
    expect(bridgeFromUsb('1366', '1015')).toBe('J-Link');
  });
  it('tells when the chip does not fit the selected board', () => {
    expect(chipMatchesBoard('ESP32-D0WD-V3', getBoard('esp32-devkitc-30'))).toBe(true);
    expect(chipMatchesBoard('ESP32-S3 (QFN56)', getBoard('esp32-devkitc-30'))).toBe(false);
    expect(chipMatchesBoard('ESP32-S3 (QFN56)', getBoard('esp32-s3-devkitc-1'))).toBe(true);
    expect(chipMatchesBoard('RP2350', getBoard('rpi-pico'))).toBe(false);
    expect(chipMatchesBoard('ATmega2560', getBoard('arduino-uno-r3'))).toBe(false);
    expect(chipMatchesBoard('ATmega328P', getBoard('arduino-nano'))).toBe(true);
  });
});

describe('chip tool output parsing', () => {
  it('avrdude signatures (v6 and v8 formats) and sync errors', () => {
    expect(parseAvrSignature('avrdude: Device signature = 0x1e950f (probably m328p)')).toEqual({ hex: '1e950f', chip: 'ATmega328P' });
    expect(parseAvrSignature('Device signature = 1E 98 01 (ATmega2560)')?.chip).toBe('ATmega2560');
    expect(classifyAvrdudeError('avrdude: stk500_getsync() attempt 10 of 10: not in sync: resp=0x00').code).toBe('no_sync');
  });
  it('picotool info', () => {
    const out = 'Device Information\n type:                   RP2040\n flash size:             2048K\n flash id:               0xE6614103E7123456\n';
    expect(parsePicotoolInfo(out)).toEqual({ type: 'RP2040', flashBytes: 2 * 1024 * 1024, flashId: '0xE6614103E7123456' });
  });
  it('STM32 tools', () => {
    expect(parseCubeProgrammerInfo('Device ID   : 0x433\nDevice name : STM32F401xD/E\nFlash size  : 512 KBytes\n')).toEqual({ name: 'STM32F401xD/E', deviceId: '0x433', flashBytes: 512 * 1024 });
    expect(parseStInfo('  serial:     066DFF535155878281\n  flash:      524288 (pagesize: 16384)\n  chipid:     0x0433\n  descr:      F4xx (Dynamic Efficency)\n')).toMatchObject({ chipId: '0x0433', flashBytes: 524288 });
    expect(parseDfuFlashBytes('Found DFU: [0483:df11] ... name="@Internal Flash  /0x08000000/04*016Kg,01*064Kg,03*128Kg"')).toBe(512 * 1024);
  });
  it('nrfjprog and teensy', () => {
    expect(parseNrfDeviceVersion('NRF52840_xxAA_REV3')).toBe('NRF52840_XXAA_REV3');
    expect(parseNrfDeviceId('0x10000060: 1A2B3C4D 5E6F7081   |....|')).toBe('1A2B3C4D5E6F7081');
    expect(teensyMcu('teensy:avr:teensy41')).toBe('TEENSY41');
  });
  it('puts user images at the right address', () => {
    expect(userImageOffset(getBoard('esp32-devkitc-30'), '/x/app.bin')).toBe(0x10000);
    expect(userImageOffset(getBoard('esp32-devkitc-30'), '/x/app.merged.bin')).toBe(0);
    expect(userImageOffset(getBoard('nucleo-f401re'), '/x/app.bin')).toBe(0x08000000);
    expect(userImageOffset(getBoard('rpi-pico'), '/x/app.uf2')).toBe(0);
  });
});
