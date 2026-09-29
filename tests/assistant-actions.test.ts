import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_ACTIONS, actionChain, bestAction, searchActions } from '@shared/actions';
import { getBoard } from '@shared/board';
import type { AiContext, Scene } from '@shared/types';
import { runTool, TOOLS, type ToolTurnState } from '../app/main/ai/tools';
import { buildContextBlock, numberedCode } from '../app/main/ai/prompt';
import { Assistant } from '../app/main/ai/assistant';
import { AiSettingsStore, type SecretBox } from '../app/main/settings/settings';
import type { HardwareHub } from '../app/main/hardware/hub';

const turn = (): ToolTurnState => ({ highlight: [], calls: [] });

describe('app actions', () => {
  it('each action has a label, a hint and a place in the UI', () => {
    for (const a of APP_ACTIONS) {
      expect(a.label.length).toBeGreaterThan(3);
      expect(a.hint).toMatch(/\.$/);
      expect(a.where).toMatch(/^[a-z]+(:[a-z]+)?$/);
    }
    // Actions that write only ever open the confirmation dialog: they are marked, reads are not.
    expect(APP_ACTIONS.filter((a) => a.writes).map((a) => a.id)).toEqual(['restore_firmware', 'install_agent', 'flash_firmware']);
  });

  it('finds actions by what people say', () => {
    expect(bestAction('back up my board')?.id).toBe('backup_flash');
    expect(bestAction('open the serial monitor')?.id).toBe('open_monitor');
    expect(bestAction('flash my code')?.id).toBe('flash_firmware');
    expect(bestAction('hello there')).toBeNull();
    expect(searchActions('monitor')[0].id).toBe('open_monitor');
    expect(searchActions('')).toHaveLength(8);
  });

  it('runs "…, then …" as several actions in order', () => {
    expect(actionChain('flash my code, then open the monitor')?.map((a) => a.id)).toEqual(['flash_firmware', 'open_monitor']);
    expect(actionChain('back up my board')).toBeNull();
    expect(actionChain('back up my board, then sing a song')).toBeNull();
  });
});

describe('assistant tools for doing things', () => {
  it('offers app_action, propose_parts and write_code', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['app_action', 'propose_parts', 'write_code']));
    const app = TOOLS.find((t) => t.name === 'app_action')!;
    expect(JSON.stringify(app.parameters)).toContain('backup_flash');
  });

  it('queues app actions for the app to run, and refuses unknown ones', async () => {
    const tt = turn();
    const r = await runTool('app_action', { action: 'backup_flash', arg: '' }, {} as HardwareHub, [], tt);
    expect(r.isError).toBe(false);
    expect(tt.actions).toEqual([{ action: 'backup_flash', arg: '' }]);
    const w = await runTool('app_action', { action: 'flash_firmware', arg: '' }, {} as HardwareHub, [], tt);
    expect(JSON.parse(w.content).note).toMatch(/confirmation dialog/);
    const bad = await runTool('app_action', { action: 'erase_everything', arg: '' }, {} as HardwareHub, [], turn());
    expect(bad.isError).toBe(true);
  });

  it('proposes only parts from the library and says which ids were unknown', async () => {
    const tt = turn();
    const r = await runTool('propose_parts', { partIds: ['bme280-gy', 'flux-capacitor', 'ssd1306-i2c'], reason: 'weather' }, {} as HardwareHub, [], tt);
    expect(tt.proposal).toEqual({ partIds: ['bme280-gy', 'ssd1306-i2c'], reason: 'weather' });
    expect(JSON.parse(r.content).unknownIds).toEqual(['flux-capacitor']);
    const none = await runTool('propose_parts', { partIds: ['nope'], reason: '' }, {} as HardwareHub, [], turn());
    expect(none.isError).toBe(true);
  });

  it('asks the app to write code in the Code panel', async () => {
    const tt = turn();
    await runTool('write_code', { request: 'read the temperature every 2 s' }, {} as HardwareHub, [], tt);
    expect(tt.codeRequest).toBe('read the temperature every 2 s');
  });
});

describe('what the assistant sees', () => {
  const scene: Scene = {
    board: 'esp32-devkitc-30',
    parts: [{ id: 'bme1', partId: 'bme280-gy', position: [0, 0, 0] }],
    wires: [],
    sketch: { name: 'weather.ino', text: '#include <Wire.h>\nvoid setup() {\n  Wire.begin(22, 21);\n}' },
  };
  const ctx: AiContext = { screen: 'newProject', answers: {}, log: [], scene, events: ['12:00:01 part added: bme1 (bme280-gy)', '12:00:05 code edited: weather.ino, 4 lines'] };

  it('gets the code with line numbers (not inside the scene JSON) and the recent app events', () => {
    const block = buildContextBlock(getBoard(scene.board), ctx);
    expect(block).toContain('Project code (weather.ino');
    expect(block).toContain('   3|   Wire.begin(22, 21);');
    expect(block).not.toContain('"sketch"');
    expect(block).toContain('part added: bme1');
  });

  it('cuts very long code', () => {
    const long = Array.from({ length: 600 }, (_, i) => `// line ${i + 1}`).join('\n');
    const out = numberedCode(long, 400);
    expect(out.split('\n')).toHaveLength(401);
    expect(out).toContain('200 more lines not shown');
  });
});

describe('Assistant.suggestCode and describeProject (free demo, fetch stubbed)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const fakeBox = (): SecretBox => ({
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  });
  const env = { BOARDPILOT_DEMO_AI_URL: 'https://relay.test/api/demo-ai' };
  const make = () => new Assistant({} as HardwareHub, new AiSettingsStore(join(mkdtempSync(join(tmpdir(), 'bp-act-')), 'settings.json'), fakeBox(), env), env);
  const answer = (obj: unknown) => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  };
  const ctx: AiContext = { screen: 'newProject', answers: {}, log: [], scene: { board: 'esp32-devkitc-30', parts: [], wires: [] } };

  it('returns a code suggestion placed inside the code, with only valid sources', async () => {
    answer({
      title: 'Read every 2 s',
      afterLine: 99,
      replace: false,
      text: '  float t = bme.readTemperature();\n',
      explanation: 'Reads the BME280.',
      sources: [{ kind: 'library', label: 'parts library · bme280-gy' }, { kind: 'measurement', label: 'made up' }],
    });
    const r = await make().suggestCode(ctx, { code: 'void setup() {\n}\nvoid loop() {\n}', cursorLine: 4, request: 'read the temperature every 2 s' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.afterLine).toBe(4);
    expect(r.value.text).toBe('  float t = bme.readTemperature();');
    expect(r.value.sources).toEqual([{ kind: 'library', label: 'parts library · bme280-gy' }]);
  });

  it('asks questions on the first turn only, then proposes parts from the library', async () => {
    const a = make();
    answer({ kind: 'questions', questions: [{ question: 'How is it powered?', options: ['USB', 'Battery'] }], name: '', summary: '', parts: [], code: '', notes: [], sources: [] });
    const q = await a.describeProject({ text: 'a plant waterer', boardId: 'esp32-devkitc-30', answers: [] });
    expect(q.ok && q.value.kind).toBe('questions');

    answer({
      kind: 'questions',
      questions: [{ question: 'Again?', options: [] }],
      name: 'Plant waterer',
      summary: 'Waters the plant.',
      parts: [
        { partId: 'soil-moisture-capacitive', why: 'measures the soil' },
        { partId: 'not-a-part', why: '' },
      ],
      code: 'void setup() {}\nvoid loop() {}',
      notes: ['The pump needs its own supply.'],
      sources: [],
    });
    const p = await a.describeProject({ text: 'a plant waterer', boardId: 'esp32-devkitc-30', answers: [{ question: 'How is it powered?', answer: 'USB' }] });
    expect(p.ok).toBe(true);
    if (!p.ok || p.value.kind !== 'proposal') throw new Error('expected a proposal');
    expect(p.value.parts.map((x) => x.partId)).toEqual(['soil-moisture-capacitive']);
    expect(p.value.notes).toEqual(['The pump needs its own supply.']);
  });
});

describe('free demo body limit', () => {
  it('shortens the code in the context instead of refusing a big question', async () => {
    const { DemoProvider, compactContext } = await import('../app/main/ai/providers/demo');
    const { DEMO_MAX_BODY_BYTES } = await import('@shared/ai');
    const { SYSTEM_PROMPT } = await import('../app/main/ai/prompt');
    const board = getBoard('nucleo-f401re');
    const scene: Scene = { board: board.id, parts: [], wires: [], sketch: { name: 'big.ino', text: Array.from({ length: 400 }, (_, i) => `  digitalWrite(${i % 20}, HIGH); // step ${i} of a long sketch`).join('\n') } };
    const block = buildContextBlock(board, { screen: 'newProject', answers: {}, log: [], scene, events: ['12:00 code edited'] });
    const p = new DemoProvider({ url: 'https://relay.test/', clientVersion: '0.7.0' });
    const req = { model: 'm', maxTokens: 1000, system: SYSTEM_PROMPT, tools: TOOLS, messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: block }, { type: 'text' as const, text: 'hi' }] }] };
    const fitted = p.fit(req);
    expect(JSON.stringify(fitted).length).toBeLessThan(JSON.stringify(req).length);
    const first = fitted.messages[0];
    const text = first.role === 'user' && first.content[0].type === 'text' ? first.content[0].text : '';
    expect(text).toContain('left out for the free demo');
    expect(text).not.toContain('Recent app events');
    expect(compactContext('a\n   1| x\nb')).toBe('a\n   1| x\nb');
    expect(DEMO_MAX_BODY_BYTES).toBe(48 * 1024);
  });
});
