// Tools the assistant may call. Read-only tools run through the HardwareHub; write tools only
// ask the UI to show a confirmation dialog. The model never gets a confirmation token.
// Tool definitions are provider-neutral (ToolSpec); providers/*.ts convert them for Claude, GPT and Gemini.

import type { LogEntry, TargetRef, WriteRequest } from '@shared/types';
import type { HardwareHub } from '../hardware/hub';
import type { JsonSchema, ToolSpec } from './providers/types';

// Written as strict JSON Schema; providers/schema.ts adapts it (Gemini subset, OpenAI strict check).
const obj = (properties: Record<string, unknown>, required: string[]): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const gpio = { type: 'integer', description: 'ESP32 GPIO number, e.g. 21 for D21' };

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
