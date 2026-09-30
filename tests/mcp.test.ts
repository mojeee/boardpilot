import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { LogEntry, Scene, WriteRequest } from '@shared/types';
import type { McpSceneEditAnswer } from '@shared/api';
import type { SceneOp } from '@shared/sceneEdit';
import { SCENARIOS } from '../app/main/sim/simWorld';
import { grant } from '../app/main/session/safety';
import { createMcpServer, McpHttpServer } from '../app/main/mcp/server';
import type { McpDeps } from '../app/main/mcp/tools';
import { makeHub } from './helpers';

async function setup(opts: { answer?: 'approved' | 'refused'; headless?: boolean; editAnswer?: (ops: SceneOp[]) => McpSceneEditAnswer } = {}) {
  const { hub, ready } = makeHub('weather-station-swapped');
  await ready;
  const log: { type: string; text: string; source?: string }[] = [];
  hub.on('log', (e: Omit<LogEntry, 'id' | 't'>) => log.push(e));
  const writes: WriteRequest[] = [];
  const edits: SceneOp[][] = [];
  const actions: string[] = [];
  const deps: Omit<McpDeps, 'clientName'> = {
    hub,
    scene: async () => SCENARIOS.find((s) => s.id === 'weather-station-swapped')!.scene,
    recentLog: () => [],
    userParts: () => [],
    headless: !!opts.headless,
    // Stands in for the user clicking in the app: "approved" installs the agent with a real token.
    requestWrite: async (req) => {
      writes.push(req);
      if (opts.answer !== 'approved') return 'refused';
      if (req.kind === 'flash_agent') await hub.installAgent(grant('flash_agent'));
      return 'approved';
    },
    // Stands in for the Apply card in the assistant panel.
    requestSceneEdit: async (ops) => {
      edits.push(ops);
      return opts.editAnswer ? opts.editAnswer(ops) : { status: 'refused', error: 'the user clicked Not now' };
    },
    runAppAction: async (action) => {
      actions.push(action);
      return { status: 'done', steps: [`ran ${action}`] };
    },
  };
  const server = createMcpServer(deps, 'test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'Test agent', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { text: string }[])[0].text;
    return { isError: !!r.isError, body: JSON.parse(text) };
  };
  return { hub, client, call, log, writes, edits, actions };
}

describe('BoardPilot MCP server', () => {
  it('lists its tools with schemas', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of ['list_ports', 'identify_board', 'get_board', 'get_part', 'search_parts', 'get_scene', 'check_wiring', 'check_code', 'read_pins', 'i2c_scan', 'i2c_read', 'adc_read', 'read_serial', 'get_log', 'request_flash', 'request_gpio_write'])
      expect(names).toContain(n);
    expect(tools.every((t) => t.inputSchema.type === 'object')).toBe(true);
  });

  it('lets an agent find crossed SDA/SCL using only MCP tools', async () => {
    const { call, log } = await setup({ answer: 'approved' });
    const ports = await call('list_ports');
    expect(ports.body.confidence).toBe('measured');
    // The test hub is the simulator: every result says so, so an agent never takes it for hardware.
    expect(ports.body.simulated).toBe(true);
    const id = await call('identify_board');
    expect(id.body.value.chip).toMatch(/ESP32/);
    // No agent yet: the measurement says so, and the agent asks the user.
    expect((await call('i2c_scan', { sda: 21, scl: 22 })).isError).toBe(true);
    expect((await call('request_flash', { reason: 'to scan the I2C bus' })).body.value.status).toBe('approved');
    const scene = await call('get_scene');
    const sda = scene.body.value.wires.find((w: { to: { pin: string } }) => w.to.pin === 'SDA');
    expect(sda.from.pin).toBe('D21');
    const asWired = await call('i2c_scan', { sda: 21, scl: 22 });
    expect(asWired.body).toMatchObject({ confidence: 'measured', value: { found: [] } });
    const swapped = await call('i2c_scan', { sda: 22, scl: 21 });
    expect(swapped.body.value.found).toContain('0x76');
    const id2 = await call('i2c_read', { sda: 22, scl: 21, addr: '0x76', reg: '0xD0', len: 1 });
    expect(id2.body.value.data).toEqual(['0x60']);
    // Every call is in the session log, with the client as the source.
    expect(log.filter((e) => e.source === 'MCP: Test agent').length).toBeGreaterThanOrEqual(8);
  }, 30000);

  it('never writes when the user refuses', async () => {
    const { hub, call, writes } = await setup({ answer: 'refused' });
    await call('identify_board');
    expect((await call('request_flash', { reason: 'please' })).body.value.status).toBe('refused');
    expect((await call('request_gpio_write', { pin: 25, level: 1, reason: 'please' })).body.value.status).toBe('refused');
    expect(writes).toHaveLength(2);
    expect(hub.state.backups).toHaveLength(0);
    expect(hub.state.agent).toBeFalsy();
    expect((await call('read_pins')).isError).toBe(true);
  }, 30000);

  it('refuses every write when headless, without asking anyone', async () => {
    const { call, writes } = await setup({ answer: 'approved', headless: true });
    expect((await call('request_flash', { reason: 'x' })).body.value.status).toBe('refused');
    expect(writes).toHaveLength(0);
  });

  it('answers documented lookups with their sources', async () => {
    const { call } = await setup();
    const board = await call('get_board', { boardId: 'rpi-pico' });
    expect(board.body).toMatchObject({ confidence: 'documented', value: { id: 'rpi-pico' } });
    expect((await call('search_parts', { query: '0x76' })).body.value.some((p: { id: string }) => p.id === 'bme280-gy')).toBe(true);
    const wiring = await call('check_wiring');
    expect(wiring.body.source).toMatch(/not a measurement/);
    const code = await call('check_code', { code: 'void setup(){ Wire.begin(22, 21); }' });
    expect(code.body.value.some((f: { rule: string }) => f.rule === 'code_i2c_pins')).toBe(true);
    expect((await call('get_part', { partId: 'nope' })).body.error.code).toBe('unknown_part');
  });

  it('changes the project only after the user applies it', async () => {
    const { call, edits } = await setup({ editAnswer: () => ({ status: 'approved' }) });
    const r = await call('edit_project', {
      reason: 'a second LED',
      changes: [
        { op: 'add_part', partId: 'led-resistor', id: 'led2' },
        { op: 'add_wire', from: { part: 'board', pin: 'D26' }, to: { part: 'led2', pin: 'A' } },
      ],
    });
    expect(edits).toHaveLength(1);
    expect(r.body.value.status).toBe('approved');
    const scene = r.body.value.scene as Scene;
    expect(scene.parts.some((p) => p.id === 'led2')).toBe(true);
    expect(scene.wires.some((w) => w.from.pin === 'D26' && w.to.part === 'led2')).toBe(true);
    expect(r.body.value.changes).toContain('Wire D26 to LED A.');
  });

  it('refuses wrong pins before asking, and reports "Not now"', async () => {
    const { call, edits } = await setup();
    const bad = await call('edit_project', { reason: 'x', changes: [{ op: 'add_wire', from: { part: 'board', pin: 'D99' }, to: { part: 'bme1', pin: 'SDA' } }] });
    expect(bad.isError).toBe(true);
    expect(bad.body.error.humanMessage).toMatch(/no pin "D99"/);
    expect(edits).toHaveLength(0);
    const no = await call('edit_project', { reason: 'x', changes: [{ op: 'rename_part', id: 'bme1', label: 'Weather' }] });
    expect(no.body.value.status).toBe('refused');
  });

  it('refuses project changes and app actions headless', async () => {
    const { call, edits, actions } = await setup({ headless: true });
    expect((await call('edit_project', { reason: 'x', changes: [{ op: 'assign_pins' }] })).body.value.status).toBe('refused');
    expect((await call('run_app_action', { action: 'connect_board', reason: 'x' })).body.value.status).toBe('refused');
    expect(edits).toHaveLength(0);
    expect(actions).toHaveLength(0);
  });

  it('runs app actions in the window and returns their steps', async () => {
    const { call, actions } = await setup();
    const r = await call('run_app_action', { action: 'connect_board', arg: '', reason: 'find the board' });
    expect(actions).toEqual(['connect_board']);
    expect(r.body.value).toMatchObject({ status: 'done', steps: ['ran connect_board'] });
    expect((await call('run_app_action', { action: 'format_disk', reason: 'x' })).isError).toBe(true);
  });

  it('serves HTTP on localhost with a token, and refuses without it', async () => {
    const { hub } = makeHub('healthy');
    const dir = mkdtempSync(join(tmpdir(), 'bp-mcp-'));
    const http = new McpHttpServer({ hub, scene: async () => null, recentLog: () => [], userParts: () => [], headless: false, requestWrite: async () => 'refused', requestSceneEdit: async () => ({ status: 'refused' }), runAppAction: async () => ({ status: 'refused', steps: [] }) }, dir, 'test');
    const info = await http.start();
    try {
      expect(info.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      const bad = await fetch(info.url, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
      expect(bad.status).toBe(401);
      const client = new Client({ name: 'http test', version: '1' });
      await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.token}` } } }));
      expect((await client.listTools()).tools.length).toBeGreaterThan(10);
      await client.close();
    } finally {
      await http.stop();
    }
  }, 30000);
});
