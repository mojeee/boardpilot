// Tools the assistant may call. Read-only tools run through the HardwareHub; write tools only
// ask the UI to show a confirmation dialog. The model never gets a confirmation token.
// Tool definitions are provider-neutral (ToolSpec); providers/*.ts convert them for Claude, GPT and Gemini.

import type { LogEntry, Scene, TargetRef, WriteRequest } from '@shared/types';
import { ACTION_IDS, APP_ACTIONS, type AppActionId } from '@shared/actions';
import { PARTS } from '@shared/board';
import { SCENE_EDIT_DESCRIPTION, SCENE_EDIT_SCHEMA, applySceneOps, describeChange, parseSceneOps, type SceneOp } from '@shared/sceneEdit';
import type { HardwareHub } from '../hardware/hub';
import type { JsonSchema, ToolSpec } from './providers/types';

// Written as strict JSON Schema; providers/schema.ts adapts it (Gemini subset, OpenAI strict check).
const obj = (properties: Record<string, unknown>, required: string[]): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const gpio = { type: 'integer', description: 'GPIO number of a board pin as listed in the context (the "gpio" field), e.g. 21 for D21 on an ESP32' };

export const TOOLS: ToolSpec[] = [
  {
    name: 'read_pins',
    description: 'Read the current mode and digital level of every exposed GPIO through the diagnostic agent. Voltage (mv) is present only for pins the ADC measured.',
    parameters: obj({}, []),
  },
  {
    name: 'pullup_check',
    description: 'Check whether pins have an external pull-up: internal pulls are disabled and the level read. HIGH with nothing driving it means an external pull-up.',
    parameters: obj({ pins: { type: 'array', items: gpio } }, ['pins']),
  },
  {
    name: 'i2c_scan',
    description: 'Scan the I2C bus with the given SDA/SCL GPIOs. To test for crossed wires, scan once as wired and once with sda and scl exchanged.',
    parameters: obj({ sda: gpio, scl: gpio }, ['sda', 'scl']),
  },
  {
    name: 'i2c_read',
    description: 'Read registers from an I2C device, e.g. the ID register 0xD0 of a BME280 (expects 0x60; 0x58 means BMP280).',
    parameters: obj(
      {
        sda: gpio,
        scl: gpio,
        addr: { type: 'string', description: 'hex address like "0x76"' },
        reg: { type: 'string', description: 'hex register like "0xD0"' },
        len: { type: 'integer', minimum: 1, maximum: 32 },
      },
      ['sda', 'scl', 'addr', 'reg', 'len'],
    ),
  },
  {
    name: 'adc_read',
    description: 'Measure the voltage on an ADC-capable pin (ADC1: GPIO 32-39; ADC2 pins fail while Wi-Fi is on).',
    parameters: obj({ pin: gpio }, ['pin']),
  },
  {
    name: 'get_log',
    description: 'Get the most recent session log entries (checks, findings, user actions).',
    parameters: obj({ limit: { type: 'integer', minimum: 1, maximum: 200 } }, []),
  },
  {
    name: 'highlight',
    description: 'Focus the 3D board view on pins, wires or parts. Targets look like "pin:D21", "wire:w1", "part:bme1".',
    parameters: obj({ targets: { type: 'array', items: { type: 'string' } } }, ['targets']),
  },
  {
    name: 'ask_user',
    description: 'Ask the user a question with a few short answer options (shown as buttons). End your turn after calling this.',
    parameters: obj({ question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, ['question', 'options']),
  },
  {
    name: 'app_action',
    description:
      'Run one of the app\'s own actions for the user, the same as clicking it, when they ask you to do something or cannot find it. The app shows each step and a "Show me where it is" link. ' +
      'Actions that write to the board only open the usual confirmation dialog. Actions: ' +
      APP_ACTIONS.map((a) => `${a.id} (${a.hint}${a.arg ? ` Arg: ${a.arg}.` : ''})`).join('; '),
    parameters: obj(
      {
        action: { type: 'string', enum: ACTION_IDS },
        arg: { type: 'string', description: 'the action\'s argument, or "" when it takes none' },
      },
      ['action', 'arg'],
    ),
  },
  {
    name: 'propose_parts',
    description:
      'Propose parts to add to the project (ids from the parts library, e.g. "bme280-gy", "ssd1306-i2c"). The user sees them with an "Add to the project" button; the app then wires them with its safe-pin rules. Nothing changes until they click.',
    parameters: obj(
      {
        partIds: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string', description: 'one sentence: why these parts' },
      },
      ['partIds', 'reason'],
    ),
  },
  {
    name: 'edit_project',
    description: `${SCENE_EDIT_DESCRIPTION} Use it when the user asks to add, remove, rename or rewire something in the drawing; use the part and wire ids from the context.`,
    parameters: SCENE_EDIT_SCHEMA,
  },
  {
    name: 'write_code',
    description:
      'Put a code suggestion in the Code panel for what the user asked (e.g. "read the temperature every 2 s"). The app writes it with the drawing and the current code, checks it against the wiring, and the user accepts it with Tab or dismisses it.',
    parameters: obj({ request: { type: 'string', description: 'what the code should do, in the user\'s words' } }, ['request']),
  },
  {
    name: 'request_flash',
    description: 'Ask the user to confirm installing the diagnostic agent (after a flash backup). Only opens a confirmation dialog; nothing is written unless the user confirms.',
    parameters: obj({ reason: { type: 'string' } }, ['reason']),
  },
  {
    name: 'request_gpio_write',
    description: 'Ask the user to confirm driving an output pin HIGH or LOW. Only opens a confirmation dialog.',
    parameters: obj({ pin: gpio, level: { type: 'integer', enum: [0, 1] }, reason: { type: 'string' } }, ['pin', 'level', 'reason']),
  },
];

export const MEASUREMENT_TOOLS = new Set(['read_pins', 'pullup_check', 'i2c_scan', 'i2c_read', 'adc_read']);

export interface ToolTurnState {
  highlight: TargetRef[];
  ask?: { question: string; options: string[] };
  pendingWrite?: WriteRequest;
  /** app actions to run after the reply, in order */
  actions?: { action: AppActionId; arg: string }[];
  /** parts proposed for the user to add */
  proposal?: { partIds: string[]; reason: string };
  /** a code suggestion to write in the Code panel */
  codeRequest?: string;
  /** changes to the drawing, shown with an Apply button */
  sceneEdit?: { ops: SceneOp[]; reason: string };
  calls: { name: string; input: unknown; ok: boolean }[];
}

const num = (v: unknown, name: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`${name} must be an integer`);
  return v;
};
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string') throw new Error(`${name} must be a string`);
  return v;
};

export async function runTool(
  name: string,
  rawInput: unknown,
  hub: HardwareHub,
  log: LogEntry[],
  turn: ToolTurnState,
  scene?: Scene,
): Promise<{ content: string; isError: boolean }> {
  const input = (typeof rawInput === 'object' && rawInput !== null ? rawInput : {}) as Record<string, unknown>;
  const done = (value: unknown) => ({ content: JSON.stringify(value), isError: false });
  try {
    switch (name) {
      case 'read_pins': {
        const r = await hub.agent({ cmd: 'pins' });
        return r.ok ? done(r.value) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'pullup_check': {
        const pins = Array.isArray(input.pins) ? input.pins.map((p) => num(p, 'pin')) : [];
        const r = await hub.agent({ cmd: 'pullup_check', pins });
        return r.ok ? done(r.value) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'i2c_scan': {
        const r = await hub.agent({ cmd: 'i2c_scan', sda: num(input.sda, 'sda'), scl: num(input.scl, 'scl'), hz: 100000 });
        return r.ok ? done({ found: r.value.found }) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'i2c_read': {
        const r = await hub.agent({
          cmd: 'i2c_read',
          sda: num(input.sda, 'sda'),
          scl: num(input.scl, 'scl'),
          addr: str(input.addr, 'addr'),
          reg: str(input.reg, 'reg'),
          len: num(input.len, 'len'),
        });
        return r.ok ? done({ data: r.value.data }) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'adc_read': {
        const r = await hub.agent({ cmd: 'adc', pin: num(input.pin, 'pin') });
        return r.ok ? done(r.value) : { content: JSON.stringify(r.error), isError: true };
      }
      case 'get_log': {
        const limit = typeof input.limit === 'number' ? input.limit : 50;
        return done(log.slice(-limit).map((e) => ({ type: e.type, text: e.text, source: e.source, target: e.target })));
      }
      case 'highlight': {
        const targets = (Array.isArray(input.targets) ? input.targets : []).filter(
          (t): t is TargetRef => typeof t === 'string' && /^(pin|wire|part):.+/.test(t),
        );
        turn.highlight.push(...targets);
        return done({ highlighted: targets });
      }
      case 'ask_user': {
        turn.ask = {
          question: str(input.question, 'question'),
          options: (Array.isArray(input.options) ? input.options : []).filter((o): o is string => typeof o === 'string').slice(0, 5),
        };
        return done({ shown: true, note: 'The question is shown to the user. Finish your reply now; their answer arrives as the next message.' });
      }
      case 'app_action': {
        const action = str(input.action, 'action');
        if (!(ACTION_IDS as string[]).includes(action)) throw new Error(`unknown action ${action}`);
        const arg = typeof input.arg === 'string' ? input.arg : '';
        (turn.actions ??= []).push({ action: action as AppActionId, arg });
        if (turn.actions.length > 4) throw new Error('at most 4 actions per answer');
        const def = APP_ACTIONS.find((a) => a.id === action);
        return done({
          queued: true,
          note: def?.writes
            ? 'The app opens its confirmation dialog for this; nothing is written unless the user confirms. Tell the user what will happen.'
            : 'The app runs this right after your reply and shows each step to the user.',
        });
      }
      case 'propose_parts': {
        const ids = (Array.isArray(input.partIds) ? input.partIds : []).filter((x): x is string => typeof x === 'string');
        const known = ids.filter((id) => PARTS[id]);
        const unknown = ids.filter((id) => !PARTS[id]);
        if (!known.length) return { content: `None of these ids is in the parts library: ${unknown.join(', ')}. Use exact ids.`, isError: true };
        turn.proposal = { partIds: known.slice(0, 8), reason: str(input.reason, 'reason') };
        return done({ shown: true, unknownIds: unknown, note: 'The user sees the parts with an "Add to the project" button. Nothing changes until they click.' });
      }
      case 'edit_project': {
        if (!scene) return { content: 'No project is open.', isError: true };
        const ops = parseSceneOps(input.changes);
        const r = applySceneOps(scene, ops, PARTS);
        if (!r.ok) return { content: `${r.error.humanMessage} ${r.error.hint}`, isError: true };
        turn.sceneEdit = { ops, reason: str(input.reason, 'reason') };
        return done({
          shown: true,
          changes: r.value.changes.map((c) => describeChange(c)),
          newWiringFindings: r.value.newFindings.map((f) => ({ severity: f.severity, message: f.message, targets: f.targets })),
          note: 'The user sees these changes with an Apply button. Nothing changes until they click; mention any new wiring finding.',
        });
      }
      case 'write_code': {
        turn.codeRequest = str(input.request, 'request');
        return done({ queued: true, note: 'A code suggestion will appear in the Code panel for the user to accept or dismiss.' });
      }
      case 'request_flash': {
        turn.pendingWrite = { kind: 'flash_agent', reason: str(input.reason, 'reason') };
        return done({ dialogShown: true, note: 'A confirmation dialog is shown. Nothing has been written. Tell the user what will happen if they confirm.' });
      }
      case 'request_gpio_write': {
        const level = num(input.level, 'level');
        turn.pendingWrite = { kind: 'gpio_write', pin: num(input.pin, 'pin'), level: level === 1 ? 1 : 0, reason: str(input.reason, 'reason') };
        return done({ dialogShown: true, note: 'A confirmation dialog is shown. Nothing has been written yet.' });
      }
      default:
        return { content: `Unknown tool ${name}`, isError: true };
    }
  } catch (e) {
    return { content: `Invalid input: ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
}
