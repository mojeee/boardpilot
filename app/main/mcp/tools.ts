// BoardPilot as an MCP server: the tools and resources any AI agent (Claude Code, Cursor, Claude
// Desktop…) can use. They call the same HardwareHub as the app and the in-app assistant, and every
// result carries its provenance ({ value, confidence, source, timestamp, boardId }): measured values
// come from the board, documented ones from board and part files or the rules. Nothing is estimated
// here. Write tools never write: they ask the user in the app, and headless they are refused.

import type { AgentReplyMap, LogEntry, PartDef, Result, Scene, WriteRequest } from '@shared/types';
import { BOARDS, PARTS, getBoard } from '@shared/board';
import { checkWiring } from '@shared/wiring';
import { checkCode } from '@shared/codeCheck';
import type { HardwareHub } from '../hardware/hub';
import { TOOLS } from '../ai/tools';
import type { JsonSchema } from '../ai/providers/types';

export interface McpDeps {
  hub: HardwareHub;
  /** The open project (the app autosaves it), or null. */
  scene(): Promise<Scene | null>;
  /** Recent session log entries. */
  recentLog(n: number): LogEntry[];
  /** The user's own parts, next to the built-in library. */
  userParts(): PartDef[];
  /** Ask the user in the app. Headless: always "refused". */
  requestWrite(req: WriteRequest, client: string): Promise<'approved' | 'refused'>;
  /** Name of the MCP client, for the log ("Claude Code"). */
  clientName(): string;
  headless: boolean;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface McpToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

const obj = (properties: Record<string, unknown>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
const spec = (name: string) => {
  const s = TOOLS.find((x) => x.name === name);
  if (!s) throw new Error(`missing tool ${name}`);
  return { name: s.name, description: s.description, inputSchema: s.parameters };
};

/** Tool list. Measurement and write tools reuse the in-app assistant's definitions. */
export const MCP_TOOLS: McpToolDef[] = [
  { name: 'list_ports', description: 'List USB serial ports and the boards detected on them (measured from the USB bus).', inputSchema: obj({}) },
  {
    name: 'identify_board',
    description: 'Identify the chip on a port (chip, flash size, MAC, USB bridge) with the board’s flashing tool. Read-only. Without a port, the first port found is used.',
    inputSchema: obj({ port: { type: 'string' } }),
  },
  {
    name: 'get_board',
    description: 'Board definition from the BoardPilot board files: every pin with GPIO number, functions and flags (flash, input_only, strapping, adc1/adc2…), default I2C/SPI pins, safe pins, toolchain and sources. Without boardId, the board of the open project.',
    inputSchema: obj({ boardId: { type: 'string' } }),
  },
  { name: 'list_boards', description: 'All supported boards (id, name, chip, logic voltage).', inputSchema: obj({}) },
  {
    name: 'get_part',
    description: 'Part definition from the open parts library (CC BY 4.0): pins and roles, supply voltage, I2C addresses, chip-ID register, known gotchas, sources.',
    inputSchema: obj({ partId: { type: 'string' } }, ['partId']),
  },
  { name: 'search_parts', description: 'Search the parts library by name, chip, keyword or I2C address (e.g. "bme280", "0x76", "oled").', inputSchema: obj({ query: { type: 'string' } }, ['query']) },
  { name: 'get_scene', description: 'The project open in BoardPilot: board, parts and wires (board pin → part pin), as the user drew it.', inputSchema: obj({}) },
  {
    name: 'check_wiring',
    description: 'Run the wiring rules on the open project (or on a scene you pass): voltage mismatch, flash/strapping/input-only pins, SDA/SCL crossed, shared pins, missing ground, I2C address conflicts. Checks the drawing, not the hardware.',
    inputSchema: obj({ scene: { type: 'object' } }),
  },
  {
    name: 'check_code',
    description: 'Compare an Arduino sketch with the open project’s wiring: Wire.begin pins vs the drawn I2C pins, outputs on input-only pins, analogRead on non-ADC or ADC2-with-Wi-Fi pins, the code driving an unwired pin, Serial.begin baud. Returns findings with line numbers.',
    inputSchema: obj({ code: { type: 'string' }, monitorBaud: { type: 'integer' } }, ['code']),
  },
  spec('read_pins'),
  spec('pullup_check'),
  { ...spec('i2c_scan'), description: `${spec('i2c_scan').description} Returns the addresses that answered and the decoded bus trace.` },
  spec('i2c_read'),
  spec('adc_read'),
  {
    name: 'read_serial',
    description: 'Listen to the output of the user’s own firmware for a few seconds (the app owns the port; this does not reset the board).',
    inputSchema: obj({ seconds: { type: 'integer', minimum: 1, maximum: 15 }, baud: { type: 'integer' } }),
  },
  { name: 'get_log', description: 'Recent BoardPilot session log: checks, findings and user actions, with their sources.', inputSchema: obj({ limit: { type: 'integer', minimum: 1, maximum: 200 } }) },
  {
    ...spec('request_flash'),
    description: 'Ask the user to install the diagnostic agent (needed for pin, I2C and ADC measurements). Shows the confirmation dialog in BoardPilot; the board’s flash is backed up first. Returns "approved" or "refused". Never writes without the user’s click.',
  },
  {
    ...spec('request_gpio_write'),
    description: 'Ask the user to drive an output pin HIGH or LOW. Shows the confirmation dialog in BoardPilot and returns "approved" or "refused". Never writes without the user’s click.',
  },
];

type Confidence = 'measured' | 'documented';

export async function callMcpTool(name: string, raw: unknown, deps: McpDeps): Promise<McpToolResult> {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const { hub } = deps;
  const client = deps.clientName();
  const boardId = hub.board.id;
  const wrap = (value: unknown, confidence: Confidence, source: string): McpToolResult => ({
    content: [{ type: 'text', text: JSON.stringify({ value, confidence, source, timestamp: new Date().toISOString(), boardId }, null, 1) }],
  });
  const fail = (error: { code: string; humanMessage: string; hint: string }): McpToolResult => ({ content: [{ type: 'text', text: JSON.stringify({ error }) }], isError: true });
  const fromResult = <T>(r: Result<T>, source: string, map: (v: T) => unknown = (v) => v) => (r.ok ? wrap(map(r.value), 'measured', source) : fail(r.error));
  const int = (v: unknown, n: string) => {
    if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`${n} must be an integer`);
    return v;
  };
  const str = (v: unknown, n: string) => {
    if (typeof v !== 'string' || !v) throw new Error(`${n} must be a string`);
    return v;
  };
  const allParts = (): Record<string, PartDef> => ({ ...PARTS, ...Object.fromEntries(deps.userParts().map((p) => [p.id, p])) });
  // Every call is visible in the app (rule 5), with the client as the source.
  const measured = ['read_pins', 'pullup_check', 'i2c_scan', 'i2c_read', 'adc_read', 'identify_board', 'list_ports', 'read_serial'].includes(name);
  hub.note(name.startsWith('request_') ? 'action' : measured ? 'check' : 'info', `MCP ${name} ${Object.keys(input).length ? JSON.stringify(input).slice(0, 120) : ''}`.trim(), `MCP: ${client}`);

  try {
    switch (name) {
      case 'list_ports':
        return fromResult(await hub.listPorts(), 'USB port list');
      case 'identify_board': {
        let port = typeof input.port === 'string' ? input.port : undefined;
        if (!port) {
          const ports = await hub.listPorts();
          if (!ports.ok) return fail(ports.error);
          port = ports.value[0]?.path;
        }
        if (!port) return fail({ code: 'no_board', humanMessage: 'No board found on USB.', hint: 'Plug the board in with a data cable, then call list_ports.' });
        return fromResult(await hub.identify(port), `${hub.board.toolchain.flasher} (read-only identify)`);
      }
      case 'list_boards':
        return wrap(
          Object.values(BOARDS).map((b) => ({ id: b.id, name: b.name, chip: b.chip, logicVolt: b.logicVolt })),
          'documented',
          'BoardPilot board files',
        );
      case 'get_board': {
        const id = typeof input.boardId === 'string' ? input.boardId : ((await deps.scene())?.board ?? boardId);
        const b = BOARDS[id];
        if (!b) return fail({ code: 'unknown_board', humanMessage: `No board "${id}".`, hint: 'Call list_boards for the ids.' });
        return wrap(b, 'documented', `board file ${b.id}: ${b.sources.map((s) => s.title).join('; ')}`);
      }
      case 'get_part': {
        const p = allParts()[str(input.partId, 'partId')];
        if (!p) return fail({ code: 'unknown_part', humanMessage: `No part "${String(input.partId)}".`, hint: 'Call search_parts.' });
        return wrap(p, 'documented', `parts library: ${p.sources.map((s) => `${s.title}${s.section ? `, ${s.section}` : ''}`).join('; ')}`);
      }
      case 'search_parts': {
        const q = str(input.query, 'query').toLowerCase();
        const hits = Object.values(allParts())
          .filter((p) => [p.id, p.name, ...(p.keywords ?? []), ...(p.addresses ?? [])].some((k) => k.toLowerCase().includes(q)))
          .slice(0, 25)
          .map((p) => ({ id: p.id, name: p.name, bus: p.bus, voltage: p.voltage, addresses: p.addresses }));
        return wrap(hits, 'documented', 'BoardPilot parts library');
      }
      case 'get_scene': {
        const s = await deps.scene();
        return s ? wrap(s, 'documented', 'the project drawn in BoardPilot (not measured)') : fail({ code: 'no_project', humanMessage: 'No project is open in BoardPilot.', hint: 'Open or draw a project in the app.' });
      }
      case 'check_wiring': {
        const s = (input.scene as Scene | undefined) ?? (await deps.scene());
        if (!s || !Array.isArray(s.parts) || !Array.isArray(s.wires)) return fail({ code: 'no_project', humanMessage: 'No project to check.', hint: 'Pass a scene or open a project in the app.' });
        return wrap(checkWiring(s, getBoard(s.board), allParts()), 'documented', `wiring rules and board file ${s.board} (a check of the drawing, not a measurement)`);
      }
      case 'check_code': {
        const s = await deps.scene();
        if (!s) return fail({ code: 'no_project', humanMessage: 'No project is open in BoardPilot.', hint: 'The code is compared with the project’s wiring.' });
        const findings = checkCode(str(input.code, 'code'), s, getBoard(s.board), allParts(), { monitorBaud: typeof input.monitorBaud === 'number' ? input.monitorBaud : undefined });
        return wrap(findings, 'documented', 'code vs wiring check (a check of the drawing against the code, not a measurement)');
      }
      case 'read_pins':
        return fromResult(await hub.agent({ cmd: 'pins' }), 'diagnostic agent: pins');
      case 'pullup_check':
        return fromResult(await hub.agent({ cmd: 'pullup_check', pins: (Array.isArray(input.pins) ? input.pins : []).map((p) => int(p, 'pin')) }), 'diagnostic agent: pullup_check');
      case 'i2c_scan':
        return fromResult(await hub.agent({ cmd: 'i2c_scan', sda: int(input.sda, 'sda'), scl: int(input.scl, 'scl'), hz: 100000 }), 'diagnostic agent: i2c_scan', (v: AgentReplyMap['i2c_scan']) => ({ found: v.found, trace: v.trace }));
      case 'i2c_read':
        return fromResult(
          await hub.agent({ cmd: 'i2c_read', sda: int(input.sda, 'sda'), scl: int(input.scl, 'scl'), addr: str(input.addr, 'addr'), reg: str(input.reg, 'reg'), len: int(input.len, 'len') }),
          'diagnostic agent: i2c_read',
          (v: AgentReplyMap['i2c_read']) => ({ data: v.data, trace: v.trace }),
        );
      case 'adc_read':
        return fromResult(await hub.agent({ cmd: 'adc', pin: int(input.pin, 'pin') }), 'diagnostic agent: ADC');
      case 'read_serial': {
        const secs = typeof input.seconds === 'number' ? Math.min(15, Math.max(1, input.seconds)) : 3;
        return fromResult(await hub.captureSerial(typeof input.baud === 'number' ? input.baud : 115200, secs * 1000), 'serial capture of the user’s firmware');
      }
      case 'get_log': {
        const n = typeof input.limit === 'number' ? input.limit : 50;
        return wrap(deps.recentLog(n).map((e) => ({ type: e.type, text: e.text, source: e.source, target: e.target })), 'documented', 'BoardPilot session log');
      }
      case 'request_flash':
      case 'request_gpio_write': {
        const req: WriteRequest =
          name === 'request_flash'
            ? { kind: 'flash_agent', reason: str(input.reason, 'reason') }
            : { kind: 'gpio_write', pin: int(input.pin, 'pin'), level: input.level === 1 ? 1 : 0, reason: str(input.reason, 'reason') };
        if (deps.headless) {
          hub.note('action', 'MCP write request refused: BoardPilot is running headless, so nobody can confirm it.', `MCP: ${client}`);
          return wrap({ status: 'refused', reason: 'headless: writes need the BoardPilot window open and a click from the user' }, 'documented', 'BoardPilot safety rules');
        }
        const status = await deps.requestWrite(req, client);
        return wrap({ status }, 'documented', status === 'approved' ? 'the user confirmed in BoardPilot' : 'the user did not confirm in BoardPilot; nothing was written');
      }
      default:
        return fail({ code: 'unknown_tool', humanMessage: `Unknown tool ${name}.`, hint: 'Call tools/list.' });
    }
  } catch (e) {
    return fail({ code: 'invalid_input', humanMessage: e instanceof Error ? e.message : String(e), hint: 'Check the arguments against the tool schema.' });
  }
}

/** Resources: board and part files, readable by URI. */
export function mcpResources(deps: McpDeps) {
  return [
    ...Object.values(BOARDS).map((b) => ({ uri: `boardpilot://boards/${b.id}`, name: b.name, mimeType: 'application/json' })),
    ...Object.values({ ...PARTS, ...Object.fromEntries(deps.userParts().map((p) => [p.id, p])) }).map((p) => ({ uri: `boardpilot://parts/${p.id}`, name: p.name, mimeType: 'application/json' })),
  ];
}

export function readMcpResource(uri: string, deps: McpDeps): string | null {
  const m = /^boardpilot:\/\/(boards|parts)\/(.+)$/.exec(uri);
  if (!m) return null;
  const all = m[1] === 'boards' ? BOARDS : { ...PARTS, ...Object.fromEntries(deps.userParts().map((p) => [p.id, p])) };
  const v = all[m[2]];
  return v ? JSON.stringify(v, null, 1) : null;
}
