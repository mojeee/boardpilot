import { describe, expect, it } from 'vitest';
import { LineSplitter, encodeRequest, parseAgentLine } from '@shared/protocol';

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
