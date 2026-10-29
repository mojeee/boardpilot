import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_PROTO, AGENT_VER, LineSplitter, encodeRequest, parseAgentLine, parseSpiTrace } from '@shared/protocol';
import type { AgentReplyMap } from '@shared/types';
import { normalizeReply } from '../app/main/hardware/agentClient';
import { SimWorld } from '../app/main/sim/simWorld';

// Lines recorded from the agent protocol in CLAUDE.md.
describe('agent protocol parser', () => {
  it('parses hello replies', () => {
    const p = parseAgentLine('{"id":1,"ok":true,"agent":"bp-agent","ver":"0.1","chip":"ESP32-D0WD-V3","heapFree":201344}\r');
    expect(p.kind).toBe('reply');
    if (p.kind === 'reply') {
      expect(p.id).toBe(1);
      expect(p.body.chip).toBe('ESP32-D0WD-V3');
    }
  });

  it('parses stream frames and keeps only measured voltages', () => {
    const p = parseAgentLine('{"stream":true,"t":12345,"pins":{"21":{"mode":"in","level":1},"34":{"mode":"adc","mv":1840},"x":{"mode":"in"}}}');
    expect(p.kind).toBe('stream');
    if (p.kind === 'stream') {
      expect(p.frame.t).toBe(12345);
      expect(p.frame.pins['21']).toEqual({ mode: 'in', level: 1 });
      expect(p.frame.pins['34'].mv).toBe(1840);
      expect(p.frame.pins['21'].mv).toBeUndefined();
      expect(Object.keys(p.frame.pins)).toEqual(['21', '34']);
    }
  });

  it('parses errors with codes', () => {
    const p = parseAgentLine('{"id":8,"ok":false,"error":"input_only","msg":"GPIO 34 is input only"}');
    expect(p).toMatchObject({ kind: 'error', id: 8, code: 'input_only' });
  });

  it('parses boot events', () => {
    const p = parseAgentLine('{"event":"boot","agent":"bp-agent","ver":"0.1","strapping":{"0":1,"12":1}}');
    expect(p).toMatchObject({ kind: 'event', event: 'boot' });
  });

  it('treats ROM boot text and garbage as text, never throws', () => {
    expect(parseAgentLine('rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)').kind).toBe('text');
    expect(parseAgentLine('{"id":1,"ok":tr').kind).toBe('text');
    expect(parseAgentLine('⸮⸮ÿ').kind).toBe('text');
  });

  it('encodes requests as one JSON line with the id first', () => {
    expect(encodeRequest(4, { cmd: 'i2c_scan', sda: 21, scl: 22, hz: 100000 })).toBe('{"id":4,"cmd":"i2c_scan","sda":21,"scl":22,"hz":100000}\n');
  });

  it('splits a byte stream into lines across chunks', () => {
    const s = new LineSplitter();
    expect(s.push('{"id":1,"ok"')).toEqual([]);
    expect(s.push(':true}\n{"stream":true')).toEqual(['{"id":1,"ok":true}']);
    expect(s.push(',"t":1,"pins":{}}\n')).toEqual(['{"stream":true,"t":1,"pins":{}}']);
  });
});

describe('agent protocol 2: SPI commands and version', () => {
  it('encodes spi_xfer and tft_id requests', () => {
    expect(encodeRequest(5, { cmd: 'spi_xfer', sck: 18, miso: 19, mosi: 23, cs: 5, hz: 1000000, mode: 0, out: '9F 00 00' })).toBe(
      '{"id":5,"cmd":"spi_xfer","sck":18,"miso":19,"mosi":23,"cs":5,"hz":1000000,"mode":0,"out":"9F 00 00"}\n',
    );
    expect(encodeRequest(6, { cmd: 'tft_id', sck: 18, miso: 19, mosi: 23, cs: 5, dc: 2 })).toContain('"cmd":"tft_id"');
  });

  it('parses an spi_xfer reply and drops malformed bytes and steps', () => {
    const p = parseAgentLine('{"id":5,"ok":true,"in":["0x00","0xEF","zz"],"trace":[{"t":"cs","level":0},{"t":"byte","out":"0x9F","in":"0x00"},{"t":"bogus"},{"t":"cs","level":1}]}');
    expect(p.kind).toBe('reply');
    if (p.kind !== 'reply') return;
    const r = normalizeReply('spi_xfer', p.body) as unknown as AgentReplyMap['spi_xfer'];
    expect(r.in).toEqual(['0x00', '0xEF']);
    expect(r.trace).toEqual([{ t: 'cs', level: 0 }, { t: 'byte', out: '0x9F', in: '0x00' }, { t: 'cs', level: 1 }]);
  });

  it('parses a tft_id reply', () => {
    const p = parseAgentLine('{"id":6,"ok":true,"rddid":["0x00","0x85","0x85","0x52"],"rdid4":["0x00","0x00","0x93","0x41"],"trace":[]}');
    if (p.kind !== 'reply') throw new Error('not a reply');
    const r = normalizeReply('tft_id', p.body) as unknown as AgentReplyMap['tft_id'];
    expect(r.rddid).toHaveLength(4);
    expect(r.rdid4[3]).toBe('0x41');
  });

  it('hello carries the shared version and proto, same as the firmware constant', () => {
    expect(parseSpiTrace('x')).toEqual([]);
    const cfg = readFileSync(join(__dirname, '..', 'firmware', 'agent', 'bp_config.h'), 'utf8');
    expect(/#define AGENT_VER "([^"]+)"/.exec(cfg)?.[1]).toBe(AGENT_VER);
    expect(Number(/#define AGENT_PROTO (\d+)/.exec(cfg)?.[1])).toBe(AGENT_PROTO);
  });

  it('the simulator answers hello with the shared constants and runs SPI commands', () => {
    const w = new SimWorld('healthy');
    w.agentBoot();
    expect(w.handle({ cmd: 'hello' })).toMatchObject({ ver: AGENT_VER, proto: AGENT_PROTO });
    w.addSpiDevice({ sck: 18, miso: 19, mosi: 23, cs: 5, dc: 2, powered: true, reply: ['0x00', '0xEF', '0x40', '0x16'], rddid: ['0x00', '0x85', '0x85', '0x52'], rdid4: ['0x00', '0x00', '0x93', '0x41'] });
    const x = w.handle({ cmd: 'spi_xfer', sck: 18, miso: 19, mosi: 23, cs: 5, out: '9F 00 00 00' });
    expect(x.in).toEqual(['0x00', '0xEF', '0x40', '0x16']);
    expect(x.trace[0]).toEqual({ t: 'cs', level: 0 });
    expect(x.trace[1]).toEqual({ t: 'byte', out: '0x9F', in: '0x00' });
    expect(x.trace.at(-1)).toEqual({ t: 'cs', level: 1 });
    const id = w.handle({ cmd: 'tft_id', sck: 18, miso: 19, mosi: 23, cs: 5, dc: 2 });
    expect(id.rddid[1]).toBe('0x85');
    expect(id.rdid4.slice(2)).toEqual(['0x93', '0x41']);
    // wrong wiring: nothing answers, bytes stay 0x00
    expect(w.handle({ cmd: 'tft_id', sck: 18, miso: 19, mosi: 23, cs: 4, dc: 2 }).rddid).toEqual(['0x00', '0x00', '0x00', '0x00']);
  });

  it('SPI commands refuse flash pins and outputs on input-only pins like the other commands', () => {
    const w = new SimWorld('healthy');
    w.agentBoot();
    expect(() => w.handle({ cmd: 'spi_xfer', sck: 6, mosi: 23, out: '00' })).toThrow();
    expect(() => w.handle({ cmd: 'spi_xfer', sck: 18, mosi: 34, out: '00' })).toThrow();
    expect(() => w.handle({ cmd: 'tft_id', sck: 18, miso: 19, mosi: 23, cs: 35, dc: 2 })).toThrow();
    // input-only is fine for MISO
    expect(() => w.handle({ cmd: 'spi_xfer', sck: 18, miso: 34, out: '00' })).not.toThrow();
    expect(() => w.handle({ cmd: 'spi_xfer', sck: 18, mosi: 23, out: '0G' })).toThrow();
  });
});
