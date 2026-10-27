// Project builder ("Describe it"): part search, proposals built from library parts with the
// app's own pin rules, and the assistant loop that turns tool calls into choice cards and a
// proposal card. The model is scripted here; tests/live/ runs the same flows against real Claude.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BOARDS, PARTS, getBoard } from '@shared/board';
import { buildProposal, checkScene, findBoardPin, formatMa, searchParts, type ProposalInput } from '@shared/projectBuilder';
import { TEMPLATES, templateFits } from '@shared/templates';
import type { AiContext, Scene } from '@shared/types';
import type { ChatRequest, ChatResponse } from '../app/main/ai/providers/types';

const empty = (board = 'esp32-devkitc-30'): Scene => ({ board, parts: [], wires: [] });
const input = (over: Partial<ProposalInput>): ProposalInput => ({ title: 'Test', summary: '', board: '', keepExisting: false, parts: [], wires: [], links: [], ...over });

describe('searchParts', () => {
  const esp = getBoard('esp32-devkitc-30');
  it('finds sensors by what they measure', () => {
    const ids = searchParts('temperature humidity pressure', PARTS, esp).map((p) => p.id);
    expect(ids.slice(0, 3)).toContain('bme280-gy');
  });
  it('finds displays and filters by category', () => {
    const r = searchParts('oled', PARTS, esp, { category: 'display' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.category === 'display')).toBe(true);
    expect(r.map((p) => p.id)).toContain('ssd1306-i2c');
  });
  it('says how a 5 V part fits a 3.3 V board', () => {
    const sonar = searchParts('hc-sr04 ultrasonic', PARTS, esp)[0];
    expect(sonar.voltage).toBe('5');
    expect(sonar.fit).toMatch(/5 V part on a 3.3 V board/);
  });
  it('gives currents with their unit (models misread bare mA numbers)', () => {
    expect(formatMa(0.0036)).toBe('3.6 µA');
    expect(formatMa(12)).toBe('12 mA');
    expect(formatMa(2500)).toBe('2.5 A');
    expect(searchParts('bme280', PARTS, esp)[0].current).toMatch(/^3\.6 µA typical/);
  });
  it('caps the result list', () => {
    expect(searchParts('sensor led display button', PARTS, esp, { limit: 50 }).length).toBeLessThanOrEqual(12);
  });
});

describe('boardArg', () => {
  it('keeps the current board for null, empty, quoted-empty and "current"', async () => {
    const { boardArg } = await import('../app/main/ai/tools');
    for (const v of [null, undefined, '', '""', "''", ' current ', 'null']) expect(boardArg(v)).toBe('');
    expect(boardArg('"rpi-pico"')).toBe('rpi-pico');
  });
});

describe('findBoardPin', () => {
  it('matches ids, labels and GPIO numbers', () => {
    const esp = getBoard('esp32-devkitc-30');
    expect(findBoardPin(esp, 'd21')?.id).toBe('D21');
    expect(findBoardPin(esp, 'GPIO21')?.id).toBe('D21');
    expect(findBoardPin(esp, 'nope')).toBeUndefined();
  });
});

describe('buildProposal', () => {
  it('builds a weather station with safe pins, no errors and nothing unwired', () => {
    const r = buildProposal(
      input({
        title: 'Weather station',
        parts: [
          { id: 'bme1', partId: 'bme280-gy', label: 'Sensor', why: 'temperature, humidity, pressure' },
          { id: 'oled1', partId: 'ssd1306-i2c', label: 'Display', why: 'shows the values' },
        ],
      }),
      empty(),
      PARTS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.proposal;
    expect(p.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(p.unwired).toEqual([]);
    expect(p.wiring.find((w) => w.part === 'bme1' && w.pin === 'SDA')?.boardPin).toBe('D21');
    expect(p.wiring.every((w) => w.auto)).toBe(true);
    // Stable ids: the same request gives the same proposal.
    const again = buildProposal(input({ title: 'Weather station', parts: p.parts.map((x) => ({ id: x.id, partId: x.partId, label: x.label, why: x.why })) }), empty(), PARTS);
    expect(again.ok && again.proposal.scene.wires.map((w) => w.id)).toEqual(p.scene.wires.map((w) => w.id));
  });

  it('refuses part ids that are not in the library and suggests close ones', () => {
    const r = buildProposal(input({ parts: [{ id: 'x', partId: 'bme-280', label: '', why: '' }] }), empty(), PARTS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/Unknown part id "bme-280"/);
    expect(r.errors[0]).toMatch(/bme280/);
  });

  it('keeps good wires, drops bad ones and picks a safe pin instead', () => {
    const r = buildProposal(
      input({
        parts: [{ id: 'led1', partId: 'led-resistor', label: 'LED', why: '' }],
        wires: [
          { boardPin: 'D99', part: 'led1', pin: PARTS['led-resistor'].pins.find((p) => p.role !== 'ground')!.name },
          { boardPin: 'GND', part: 'led1', pin: 'NOPE' },
        ],
      }),
      empty(),
      PARTS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.notes.length).toBe(2);
    expect(r.proposal.unwired).toEqual([]);
  });

  it('flags a wire the assistant asked for on an input-only pin', () => {
    const led = PARTS['led-resistor'];
    const signal = led.pins.find((p) => p.role === 'digital_in')!;
    const r = buildProposal(input({ parts: [{ id: 'led1', partId: 'led-resistor', label: 'LED', why: '' }], wires: [{ boardPin: 'D34', part: 'led1', pin: signal.name }] }), empty(), PARTS);
    expect(r.ok && r.proposal.findings.some((f) => f.rule === 'output_on_input_only' && f.severity === 'error')).toBe(true);
    expect(r.ok && r.proposal.wiring.find((w) => w.pin === signal.name)?.auto).toBe(false);
  });

  it('adds to the drawing with keepExisting and switches boards when asked', () => {
    const first = buildProposal(input({ parts: [{ id: 'bme1', partId: 'bme280-gy', label: '', why: '' }] }), empty(), PARTS);
    if (!first.ok) throw new Error('first proposal failed');
    const more = buildProposal(input({ keepExisting: true, parts: [{ id: 'led1', partId: 'led-resistor', label: '', why: '' }] }), first.proposal.scene, PARTS);
    expect(more.ok && more.proposal.scene.parts.map((p) => p.id)).toEqual(['bme1', 'led1']);
    expect(more.ok && more.proposal.parts.find((p) => p.id === 'bme1')?.added).toBe(false);
    const pico = buildProposal(input({ board: 'rpi-pico', parts: [{ id: 'bme1', partId: 'bme280-gy', label: '', why: '' }] }), first.proposal.scene, PARTS);
    expect(pico.ok && pico.proposal.scene.board).toBe('rpi-pico');
    expect(pico.ok && pico.proposal.scene.parts.length).toBe(1);
    expect(buildProposal(input({ board: 'nope', parts: [] }), empty(), PARTS).ok).toBe(false);
  });

  it('wires every template’s parts on every board it fits without errors', () => {
    const bad: string[] = [];
    for (const board of Object.values(BOARDS)) {
      for (const tpl of TEMPLATES) {
        if (templateFits(tpl, board)) continue;
        const r = buildProposal(input({ parts: tpl.parts.map((p) => ({ id: p.id, partId: p.partId, label: p.label ?? '', why: '' })) }), empty(board.id), PARTS);
        if (!r.ok) bad.push(`${board.id}/${tpl.id}: ${r.errors.join(' ')}`);
        else {
          const errs = r.proposal.findings.filter((f) => f.severity === 'error');
          if (errs.length || r.proposal.unwired.length) bad.push(`${board.id}/${tpl.id}: ${errs.map((e) => e.message).join('; ')} ${r.proposal.unwired.join(',')}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('draws part-to-part links (a pump on a MOSFET module) and refuses bad ones', () => {
    const r = buildProposal(
      input({
        board: 'rpi-pico',
        parts: [
          { id: 'fet1', partId: 'mosfet-aod4184', label: 'Pump switch', why: '' },
          { id: 'pump1', partId: 'water-pump-5v', label: 'Pump', why: '' },
        ],
        links: [
          { fromPart: 'pump1', fromPin: '+', toPart: 'fet1', toPin: PARTS['mosfet-aod4184'].pins.find((p) => /\+/.test(p.name))?.name ?? 'V+' },
          { fromPart: 'pump1', fromPin: 'nope', toPart: 'fet1', toPin: 'GND' },
        ],
      }),
      empty(),
      PARTS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const link = r.proposal.scene.wires.find((w) => w.from.part === 'pump1');
    expect(link?.to.part).toBe('fet1');
    expect(r.proposal.wiring.some((w) => w.part === 'pump1' && w.boardPin === '')).toBe(true);
    expect(r.proposal.notes.some((n) => n.includes('pump1.nope'))).toBe(true);
    // The pump's library notes ask for a flyback diode: it is on the shopping list.
    expect(r.proposal.extras.some((e) => /flyback diode/.test(e))).toBe(true);
  });

  it('routes a 3.3 V RC522 through a level shifter on a 5 V Uno, never straight to the board', () => {
    const r = buildProposal(
      input({
        board: 'arduino-uno-r3',
        parts: [
          { id: 'rfid1', partId: 'rc522-rfid', label: 'Reader', why: '' },
          { id: 'ls1', partId: 'bss138-level-shifter', label: 'Shifter', why: '' },
        ],
        wires: [
          { boardPin: '5V', part: 'ls1', pin: 'HV' },
          { boardPin: 'D13', part: 'ls1', pin: 'HV1' },
          { boardPin: 'D11', part: 'ls1', pin: 'HV2' },
          { boardPin: 'D10', part: 'ls1', pin: 'HV3' },
          { boardPin: 'D9', part: 'ls1', pin: 'HV4' },
        ],
        links: [
          { fromPart: 'ls1', fromPin: 'LV1', toPart: 'rfid1', toPin: 'SCK' },
          { fromPart: 'ls1', fromPin: 'LV2', toPart: 'rfid1', toPin: 'MOSI' },
          { fromPart: 'ls1', fromPin: 'LV3', toPart: 'rfid1', toPin: 'SDA' },
          { fromPart: 'ls1', fromPin: 'LV4', toPart: 'rfid1', toPin: 'RST' },
        ],
      }),
      empty('arduino-uno-r3'),
      PARTS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const toBoard = (pin: string) => r.proposal.scene.wires.some((w) => (w.to.part === 'rfid1' && w.to.pin === pin && w.from.part === 'board') || (w.from.part === 'rfid1' && w.from.pin === pin && w.to.part === 'board'));
    for (const pin of ['SCK', 'MOSI', 'SDA', 'RST']) expect(toBoard(pin)).toBe(false);
    // The shifter's HV supply on 5V is not "a signal on a power pin".
    expect(r.proposal.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('puts the divider resistor of a bare LDR on the shopping list (from its library note)', () => {
    const r = buildProposal(input({ parts: [{ id: 'ldr1', partId: 'photoresistor', label: 'LDR', why: '' }] }), empty(), PARTS);
    expect(r.ok && r.proposal.extras.some((e) => /10 kΩ resistor from LDR 2 to GND/.test(e))).toBe(true);
  });

  it('checks the current drawing for the assistant', () => {
    const c = checkScene({ board: 'esp32-devkitc-30', parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 40] }], wires: [] }, PARTS);
    expect(c.unwired).toContain('bme1.SDA');
  });
});

/* ---------------- the assistant loop with a scripted model ---------------- */

const script: ChatResponse[] = [];
const seen: ChatRequest[] = [];
vi.mock('../app/main/ai/providers/anthropic', () => ({
  AnthropicProvider: class {
    readonly id = 'anthropic';
    async chat(req: ChatRequest) {
      seen.push(structuredClone(req));
      const next = script.shift();
      if (!next) throw new Error('script ended');
      return next;
    }
    complete(req: ChatRequest) {
      return this.chat(req);
    }
    async listModels() {
      return [];
    }
  },
}));

const call = (name: string, input: Record<string, unknown>, id = name): ChatResponse => ({ text: '', toolCalls: [{ id, name, input }], stop: 'tool_use', raw: { provider: 'demo', data: null } });
const answer = (message: string): ChatResponse => ({
  text: JSON.stringify({ message, confidence: 'documented', sources: [{ kind: 'library', label: 'bme280-gy' }], highlight: [], nextOptions: [] }),
  toolCalls: [],
  stop: 'end',
  raw: { provider: 'demo', data: null },
});

async function makeAssistant() {
  const { Assistant } = await import('../app/main/ai/assistant');
  const { AiSettingsStore } = await import('../app/main/settings/settings');
  const box = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() };
  const env = { BOARDPILOT_DEMO_AI_URL: 'off' };
  const settings = new AiSettingsStore(join(mkdtempSync(join(tmpdir(), 'bp-builder-')), 'settings.json'), box, env);
  expect(settings.save({ provider: 'anthropic', model: 'claude-test', apiKey: 'sk-ant-test-000000000000000000' }).ok).toBe(true);
  // The builder tools never touch hardware.
  return new Assistant({} as never, settings, env);
}

const ctx = (scene: Scene): AiContext => ({ screen: 'new-project', answers: {}, log: [], live: null, scene });

describe('Assistant with the builder tools (scripted model)', () => {
  it('turns offer_choices into cards and ends the turn', async () => {
    const a = await makeAssistant();
    script.push(
      call('search_parts', { query: 'temperature humidity pressure', category: 'sensor', limit: 5 }),
      call('offer_choices', {
        question: 'Which sensor?',
        choices: [
          { label: 'BME280', detail: 'Temperature, humidity and pressure over I2C.', partId: 'bme280-gy' },
          { label: 'DHT22', detail: 'Temperature and humidity on one data pin.', partId: 'dht22' },
          { label: 'Made up', detail: 'Not in the library.', partId: 'nope' },
        ],
      }),
      answer('Pick one of these two sensors.'),
    );
    const r = await a.ask('I want to measure the temperature in my room', ctx(empty()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.choices?.map((c) => c.label)).toEqual(['BME280', 'DHT22', 'Made up']);
    expect(r.value.choices?.[2].partId).toBeUndefined();
    expect(r.value.message).toContain('Which sensor?');
    expect(r.value.nextOptions).toEqual([]);
    // Once the cards are up, the next request forbids tools: the model must answer now.
    expect(seen.map((q) => q.toolChoice)).toEqual(['auto', 'auto', 'none']);
    // The search result reached the model as a tool result.
    const toolMsg = seen[1].messages.find((m) => m.role === 'tool');
    expect(toolMsg && toolMsg.role === 'tool' && toolMsg.results[0].content).toContain('bme280-gy');
  });

  it('never ends in "too many steps": the last round forbids tools', async () => {
    const a = await makeAssistant();
    seen.length = 0;
    for (let i = 0; i < 11; i++) script.push(call('check_project', {}, `c${i}`));
    script.push(answer('Here is what I found.'));
    const r = await a.ask('Check my project', ctx(empty()));
    expect(r.ok).toBe(true);
    expect(seen.at(-1)?.toolChoice).toBe('none');
    expect(seen.slice(0, -1).every((q) => q.toolChoice === 'auto')).toBe(true);
  });

  it('lets the model fix a refused proposal, then returns the proposal card', async () => {
    const a = await makeAssistant();
    seen.length = 0;
    script.push(
      call('propose_project', { title: 'Weather', summary: '', board: '', keepExisting: false, parts: [{ id: 'b1', partId: 'bme-280', label: '', why: '' }], wires: [] }),
      call('propose_project', { title: 'Weather', summary: 'Shows the weather.', board: '', keepExisting: false, parts: [{ id: 'b1', partId: 'bme280-gy', label: 'Sensor', why: 'three readings' }], wires: [], links: [] }),
      {
        ...answer('Here is your project. Press Apply to use it.'),
        text: JSON.stringify({ message: 'Here is your project.', confidence: 'documented', sources: [{ kind: 'library', label: 'bme280-gy' }], highlight: ['part:b1', 'part:bme280-gy', 'pin:D21', 'pin:D99'], nextOptions: [] }),
      },
    );
    const r = await a.ask('Build it', ctx(empty()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.proposal?.parts.map((p) => p.partId)).toEqual(['bme280-gy']);
    expect(r.value.proposal?.unwired).toEqual([]);
    expect(r.value.toolCalls?.map((c) => c.ok)).toEqual([false, true]);
    expect(r.value.confidence).toBe('documented');
    // Library ids and pins the board does not have are dropped from the highlights.
    expect(r.value.highlight).toEqual(['part:b1', 'pin:D21']);
    const firstResult = seen[1].messages.find((m) => m.role === 'tool');
    expect(firstResult && firstResult.role === 'tool' && firstResult.results[0].isError).toBe(true);
  });
});
