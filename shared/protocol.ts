// Diagnostic agent protocol: newline-delimited JSON over serial.
// Pure functions only, so the parser can be tested with recorded lines.

import type { AgentPinState, AgentRequest, I2cTraceStep, StreamFrame } from './types';
import { t } from './i18n';

export type ParsedLine =
  | { kind: 'reply'; id: number; ok: true; body: Record<string, unknown> }
  | { kind: 'error'; id: number | null; code: string; message: string; body: Record<string, unknown> }
  | { kind: 'stream'; frame: StreamFrame }
  | { kind: 'event'; event: string; body: Record<string, unknown> }
  /** Anything that is not JSON: ROM boot messages, the user's own prints, line noise. */
  | { kind: 'text'; text: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function encodeRequest(id: number, req: AgentRequest): string {
  return JSON.stringify({ id, ...req }) + '\n';
}

export function parsePinStates(raw: unknown): Record<string, AgentPinState> {
  const out: Record<string, AgentPinState> = {};
  if (!isObj(raw)) return out;
  for (const [gpio, v] of Object.entries(raw)) {
    if (!/^\d+$/.test(gpio) || !isObj(v)) continue;
    const s: AgentPinState = { mode: typeof v.mode === 'string' ? v.mode : 'in' };
    if (v.level === 0 || v.level === 1) s.level = v.level;
    if (typeof v.mv === 'number' && Number.isFinite(v.mv)) s.mv = v.mv;
    if (typeof v.duty === 'number') s.duty = v.duty;
    if (typeof v.hz === 'number') s.hz = v.hz;
    out[gpio] = s;
  }
  return out;
}

export function parseTrace(raw: unknown): I2cTraceStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: I2cTraceStep[] = [];
  for (const s of raw) {
    if (!isObj(s) || typeof s.t !== 'string') continue;
    if (!['start', 'restart', 'addr', 'data', 'stop'].includes(s.t)) continue;
    const step: I2cTraceStep = { t: s.t as I2cTraceStep['t'] };
    if (typeof s.v === 'string') step.v = s.v;
    if (s.rw === 'r' || s.rw === 'w') step.rw = s.rw;
    if (s.dir === 'r' || s.dir === 'w') step.dir = s.dir;
    if (typeof s.ack === 'boolean') step.ack = s.ack;
    steps.push(step);
  }
  return steps;
}

/** Parse one line from the agent. Never throws. */
export function parseAgentLine(line: string): ParsedLine {
  const text = line.replace(/\r$/, '');
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return { kind: 'text', text };
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return { kind: 'text', text };
  }
  if (!isObj(obj)) return { kind: 'text', text };

  if (obj.stream === true) {
    const t = typeof obj.t === 'number' ? obj.t : 0;
    return { kind: 'stream', frame: { t, pins: parsePinStates(obj.pins) } };
  }
  if (typeof obj.event === 'string') {
    return { kind: 'event', event: obj.event, body: obj };
  }
  const id = typeof obj.id === 'number' ? obj.id : null;
  if (obj.ok === true && id !== null) {
    return { kind: 'reply', id, ok: true, body: obj };
  }
  if (obj.ok === false) {
    return {
      kind: 'error',
      id,
      code: typeof obj.error === 'string' ? obj.error : 'agent_error',
      message: typeof obj.msg === 'string' ? obj.msg : t('The agent reported an error.'),
      body: obj,
    };
  }
  return { kind: 'text', text };
}

/** Splits a serial byte stream into lines, keeping the unfinished tail. */
export class LineSplitter {
  private buf = '';
  constructor(private readonly maxLine = 4096) {}

  push(chunk: string): string[] {
    this.buf += chunk;
    const lines = this.buf.split('\n');
    this.buf = lines.pop() ?? '';
    if (this.buf.length > this.maxLine) this.buf = this.buf.slice(-this.maxLine);
    return lines;
  }
}

/** Human-readable explanation for agent error codes. */
export function agentErrorText(code: string): { humanMessage: string; hint: string } {
  switch (code) {
    case 'flash_pin':
      return {
        humanMessage: t('GPIO 6 to 11 are wired to the board’s internal flash memory.'),
        hint: t('Pick another pin. Using these crashes the board.'),
      };
    case 'input_only':
      return {
        humanMessage: t('GPIO 34 to 39 can only read signals. They cannot drive an output.'),
        hint: t('Move this wire to an output-capable pin such as D25, D26 or D27.'),
      };
    case 'uart_pin':
      return {
        humanMessage: t('GPIO 1 and 3 carry the USB serial link the app uses to talk to the board.'),
        hint: t('Leave TX0 and RX0 free while the app is connected.'),
      };
    case 'not_adc':
      return {
        humanMessage: t('This pin cannot measure voltage.'),
        hint: t('Use an ADC pin. GPIO 32 to 39 work even with Wi-Fi on.'),
      };
    case 'nack':
      return {
        humanMessage: t('No device answered at that address.'),
        hint: t('Check power, ground and that SDA and SCL are not swapped.'),
      };
    case 'bad_pin':
      return { humanMessage: t('That pin number does not exist on the ESP32.'), hint: t('Pick a pin from the board view.') };
    default:
      return { humanMessage: t('The board agent reported “{code}”.', { code }), hint: t('Try again. If it repeats, reconnect the board.') };
  }
}
