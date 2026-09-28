// Talks to the diagnostic agent firmware over a serial port: newline-delimited JSON, ids echoed.

import { SerialPort } from 'serialport';
import type { AgentReplyMap, AgentRequest, StreamFrame } from '@shared/types';
import { LineSplitter, agentErrorText, encodeRequest, parseAgentLine } from '@shared/protocol';
import type { AgentClient, SerialStream } from './driver';
import { DriverError } from './errors';
import { t } from '@shared/i18n';

export const AGENT_BAUD = 115200;

export function openPort(path: string, baudRate: number): Promise<SerialPort> {
  return new Promise((resolve, reject) => {
    const sp = new SerialPort({ path, baudRate, autoOpen: false });
    sp.open((err) => {
      if (!err) return resolve(sp);
      const msg = err.message;
      if (/busy|lock/i.test(msg)) {
        reject(new DriverError('port_busy', t('Another program is using this port.'), t('Close any other serial monitor and try again.')));
      } else if (/No such file|not found|cannot open/i.test(msg)) {
        reject(new DriverError('port_gone', t('The port is not there any more.'), t('Check the USB cable, then search for boards again.')));
      } else {
        reject(new DriverError('port_open_failed', t('The port could not be opened: {msg}', { msg }), t('Unplug the board, plug it back in and try again.')));
      }
    });
  });
}

interface Pending {
  resolve: (body: Record<string, unknown>) => void;
  reject: (e: DriverError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SerialAgentClient implements AgentClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private splitter = new LineSplitter();
  private streamCbs = new Set<(f: StreamFrame) => void>();
  private eventCbs = new Set<(e: string, b: Record<string, unknown>) => void>();
  private textCbs = new Set<(l: string) => void>();

  constructor(private readonly port: SerialPort) {
    port.on('data', (b: Buffer) => {
      for (const line of this.splitter.push(b.toString('utf8'))) this.handleLine(line);
    });
    port.on('close', () => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new DriverError('port_closed', t('The connection to the board was lost.'), t('Check the USB cable and reconnect.')));
      }
      this.pending.clear();
    });
  }

  private handleLine(line: string) {
    const parsed = parseAgentLine(line);
    switch (parsed.kind) {
      case 'reply': {
        const p = this.pending.get(parsed.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(parsed.id);
          p.resolve(parsed.body);
        }
        break;
      }
      case 'error': {
        const p = parsed.id !== null ? this.pending.get(parsed.id) : undefined;
        if (p && parsed.id !== null) {
          clearTimeout(p.timer);
          this.pending.delete(parsed.id);
          const text = agentErrorText(parsed.code);
          p.reject(new DriverError(`agent_${parsed.code}`, text.humanMessage, text.hint));
        }
        break;
      }
      case 'stream':
        for (const cb of this.streamCbs) cb(parsed.frame);
        break;
      case 'event':
        for (const cb of this.eventCbs) cb(parsed.event, parsed.body);
        break;
      case 'text':
        if (parsed.text.trim()) for (const cb of this.textCbs) cb(parsed.text);
        break;
    }
  }

  request<K extends AgentRequest['cmd']>(req: Extract<AgentRequest, { cmd: K }>, timeoutMs = 3000): Promise<AgentReplyMap[K]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new DriverError('agent_timeout', t('The board agent did not answer.'), t('Press EN on the board to restart it, then try again.')));
      }, timeoutMs);
      this.pending.set(id, { resolve: (b) => resolve(b as unknown as AgentReplyMap[K]), reject, timer });
      this.port.write(encodeRequest(id, req as AgentRequest));
    });
  }

  onStream(cb: (f: StreamFrame) => void) {
    this.streamCbs.add(cb);
    return () => this.streamCbs.delete(cb);
  }
  onEvent(cb: (e: string, b: Record<string, unknown>) => void) {
    this.eventCbs.add(cb);
    return () => this.eventCbs.delete(cb);
  }
  onText(cb: (l: string) => void) {
    this.textCbs.add(cb);
    return () => this.textCbs.delete(cb);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.port.isOpen) return resolve();
      this.port.close(() => resolve());
    });
  }
}

export class SerialLineStream implements SerialStream {
  private splitter = new LineSplitter();
  private cbs = new Set<(l: string) => void>();

  constructor(private readonly port: SerialPort) {
    port.on('data', (b: Buffer) => {
      // latin1 keeps wrong-baud garbage visible instead of dropping invalid UTF-8
      for (const l of this.splitter.push(b.toString('latin1'))) for (const cb of this.cbs) cb(l.replace(/\r$/, ''));
    });
  }
  onLine(cb: (l: string) => void) {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }
  write(data: string): Promise<void> {
    return new Promise((resolve, reject) => this.port.write(data, (e) => (e ? reject(e) : resolve())));
  }
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.port.isOpen) return resolve();
      this.port.close(() => resolve());
    });
  }
}
