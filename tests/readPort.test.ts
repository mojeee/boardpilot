import { describe, expect, it } from 'vitest';
import { BOARDS, PARTS, boardForChip, getBoard } from '@shared/board';
import { i2cCandidates, identifyI2c, readFromPort, sceneFromRead, type ReadPortHw, type ReadStep } from '@shared/readPort';
import { checkWiring } from '@shared/wiring';
import { partsFromDescription, templateFromDescription } from '@shared/describe';
import { TEMPLATES } from '@shared/templates';
import type { AgentReplyMap, AgentRequest, Result } from '@shared/types';
import { grant } from '../app/main/session/safety';
import { makeHub } from './helpers';

function hwFor(hub: ReturnType<typeof makeHub>['hub'], allowInstall = true): ReadPortHw & { installs: number } {
  const hw = {
    installs: 0,
    listPorts: () => hub.listPorts(),
    setBoard: async (id: string) => {
      await hub.setBoard(id);
    },
    identify: (p: string) => hub.identify(p),
    agentReady: () => !!hub.state.agent,
    installAgent: async () => {
      hw.installs++;
      if (!allowInstall) return false;
      const r = await hub.installAgent(grant('flash_agent'));
      return r.ok;
    },
    agent: <K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>) => hub.agent(req) as Promise<Result<AgentReplyMap[K]>>,
  };
  return hw;
}

describe('read from port', () => {
  it('finds the board, installs the agent after asking, and detects the BME280 with crossed wires', async () => {
    const { hub, ready } = makeHub('weather-station-swapped');
    await ready;
    const hw = hwFor(hub);
    const steps: ReadStep[] = [];
    const r = await readFromPort(hw, { currentBoard: 'esp32-devkitc-30', boards: getBoard, parts: PARTS }, (s) => steps.push(s));
    expect(r.board?.id).toBe('esp32-devkitc-30');
    expect(r.chip?.chip).toMatch(/ESP32/);
    expect(hw.installs).toBe(1);
    expect(r.agent).toBe(true);
    const bme = r.i2c.find((f) => f.addr === '0x76');
    expect(bme).toMatchObject({ partId: 'bme280-gy', guess: false, crossed: true });
    expect(bme?.idRead).toEqual({ register: '0xD0', value: '0x60' });
    // Every finished step says where its fact comes from.
    expect(steps.filter((s) => s.status === 'ok' || s.status === 'warn').every((s) => s.source)).toBe(true);
    expect(steps.some((s) => s.status === 'warn' && /crossed/.test(s.text))).toBe(true);

    // The project keeps the wires crossed as found, so the wiring check explains them.
    const { scene, notes } = sceneFromRead(r, PARTS);
    const part = scene.parts.find((p) => p.partId === 'bme280-gy');
    expect(part?.confirmed).toBe(true);
    expect(part?.detected).toMatch(/0xD0 = 0x60/);
    const findings = checkWiring(scene, getBoard(scene.board), PARTS);
    expect(findings.some((f) => f.rule === 'i2c_swapped')).toBe(true);
    expect(findings.some((f) => f.rule === 'missing_ground' || f.rule === 'missing_power')).toBe(false);
    expect(notes.join(' ')).toMatch(/cannot measure/);
  }, 30000);

  it('finds a knob on an ADC pin and adds it only when the user confirms', async () => {
    const { hub, ready } = makeHub('healthy');
    await ready;
    const r = await readFromPort(hwFor(hub), { currentBoard: 'esp32-devkitc-30', boards: getBoard, parts: PARTS }, () => {});
    expect(r.i2c.find((f) => f.partId === 'bme280-gy')?.crossed).toBe(false);
    expect(r.analog.length).toBeGreaterThan(0);
    const knob = r.analog[0];
    expect(sceneFromRead(r, PARTS).scene.parts.some((p) => p.partId === 'potentiometer')).toBe(false);
    const withKnob = sceneFromRead(r, PARTS, [{ gpio: knob.gpio, partId: 'potentiometer' }]).scene;
    const pot = withKnob.parts.find((p) => p.partId === 'potentiometer');
    expect(pot).toBeDefined();
    expect(withKnob.wires.some((w) => w.to.part === pot!.id && w.from.pin === knob.pinId)).toBe(true);
  }, 30000);

  it('writes nothing and stops at the board when the user says no to the agent', async () => {
    const { hub, ready } = makeHub('healthy');
    await ready;
    const hw = hwFor(hub, false);
    const r = await readFromPort(hw, { currentBoard: 'esp32-devkitc-30', boards: getBoard, parts: PARTS }, () => {});
    expect(hw.installs).toBe(1);
    expect(r.agent).toBe(false);
    expect(r.i2c).toEqual([]);
    expect(hub.state.agent).toBeNull();
    expect(sceneFromRead(r, PARTS).scene).toEqual({ board: 'esp32-devkitc-30', parts: [], wires: [] });
  }, 30000);

  it('says so when no board is on USB', async () => {
    const { hub, ready } = makeHub('no-board');
    await ready;
    const steps: ReadStep[] = [];
    const r = await readFromPort(hwFor(hub), { currentBoard: 'esp32-devkitc-30', boards: getBoard, parts: PARTS }, (s) => steps.push(s));
    expect(r.port).toBeNull();
    expect(steps.at(-1)?.status).toBe('fail');
  }, 30000);

  it('marks a device a guess when no chip ID tells the parts apart', async () => {
    const hw: Pick<ReadPortHw, 'agent'> = {
      agent: async () => ({ ok: true, value: { data: ['0x00'], trace: [] } }) as never,
    };
    const f = await identifyI2c(hw, { sda: 21, scl: 22 }, '0x3C', PARTS);
    expect(f.guess).toBe(true);
    expect(f.partId).toBe('ssd1306-i2c');
    expect(f.alternatives.length).toBeGreaterThan(0);
  });

  it('names the BMP280 mix-up from the ID register', async () => {
    const hw: Pick<ReadPortHw, 'agent'> = {
      agent: async (req) => ({ ok: true, value: { data: ['reg' in req && req.reg.toLowerCase() === '0xd0' ? '0x58' : '0x00'], trace: [] } }) as never,
    };
    const f = await identifyI2c(hw, { sda: 21, scl: 22 }, '0x76', PARTS);
    expect(f).toMatchObject({ partId: 'bmp280-gy', guess: false });
  });

  it('ranks the usual part first for a shared address', () => {
    expect(i2cCandidates('0x76', PARTS)[0].id).toBe('bme280-gy');
    expect(i2cCandidates('0x68', PARTS)[0].id).toBe('mpu6050');
  });

  it('picks the board from the chip and the USB ids', () => {
    expect(boardForChip('ESP32-D0WD-V3')?.id).toBe('esp32-devkitc-30');
    expect(boardForChip('ESP32-S3')?.id).toBe('esp32-s3-devkitc-1');
    expect(boardForChip('RP2040')).toBeNull(); // Pico or Pico W: the USB ids decide
    expect(boardForChip('RP2040', ['rpi-pico-w'])?.id).toBe('rpi-pico-w');
    expect(boardForChip('RP2040', [], 'rpi-pico')?.id).toBe('rpi-pico');
    expect(Object.keys(BOARDS).length).toBeGreaterThan(10);
  });
});

describe('describe it (without the AI)', () => {
  it('finds the parts named in plain words', () => {
    const ids = partsFromDescription('a plant waterer: soil sensor, small pump, OLED, runs on USB', PARTS).map((m) => m.partId);
    expect(ids).toEqual(expect.arrayContaining(['soil-moisture-capacitive', 'water-pump-5v', 'ssd1306-i2c']));
    expect(ids).toHaveLength(3);
    expect(partsFromDescription('motion alarm with a PIR and a buzzer', PARTS).map((m) => m.partId)).toEqual(['hc-sr501', 'buzzer-active']);
  });

  it('does not turn general words into parts', () => {
    expect(partsFromDescription('a sensor module on my board', PARTS)).toEqual([]);
  });

  it('points to the closest template', () => {
    expect(templateFromDescription('weather station with a BME280 and an OLED', TEMPLATES, PARTS)?.id).toBe('weather-station');
    expect(templateFromDescription('water my plants when the soil is dry', TEMPLATES, PARTS)?.id).toBe('plant-watering');
    expect(templateFromDescription('hello', TEMPLATES, PARTS)).toBeNull();
  });
});
