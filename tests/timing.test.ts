import { describe, expect, it } from 'vitest';
import { SampleRing, findEdges, formatHz, formatMs, i2cBoxes, isGap, measureDigital, niceStep, sampleStats } from '@shared/timing';

/** Samples every `dt` ms of a square wave with the given period and high time (starts high at t=0). */
function square(n: number, dt: number, periodMs: number, highMs: number, t0 = 0) {
  const times: number[] = [];
  const levels: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    times.push(t);
    levels.push(t % periodMs < highMs ? 1 : 0);
  }
  return { times, levels };
}

describe('sample rate', () => {
  it('uses the median spacing of the frame timestamps', () => {
    const s = sampleStats([0, 50, 100, 150, 260, 310]);
    expect(s?.spacingMs).toBe(50);
    expect(s?.hz).toBe(20);
    expect(s?.maxGapMs).toBe(110);
    expect(s?.n).toBe(6);
  });
  it('needs two samples', () => {
    expect(sampleStats([])).toBeNull();
    expect(sampleStats([100])).toBeNull();
    expect(sampleStats([100, 100])).toBeNull();
  });
  it('calls a long silence a gap', () => {
    expect(isGap(160, 50)).toBe(true);
    expect(isGap(120, 50)).toBe(false);
  });
});

describe('sampled edges', () => {
  it('places each edge between the two samples around it', () => {
    const e = findEdges([0, 50, 100, 150], [0, 0, 1, 1]);
    expect(e).toEqual([{ rising: true, before: 50, after: 100 }]);
  });
  it('skips missing samples, widening the window', () => {
    const e = findEdges([0, 50, 100, 150], [1, NaN, NaN, 0]);
    expect(e).toEqual([{ rising: false, before: 0, after: 150 }]);
  });
  it('only looks inside the range', () => {
    const { times, levels } = square(40, 50, 500, 250);
    expect(findEdges(times, levels, 0, 499).length).toBe(1);
  });
});

describe('period, frequency and duty cycle', () => {
  it('measures a 2 Hz, 25% square wave sampled at 20 Hz', () => {
    const { times, levels } = square(100, 50, 500, 125);
    const m = measureDigital(times, levels);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.periodMs).toBeCloseTo(500, 5);
    expect(m.hz).toBeCloseTo(2, 5);
    // Samples at 0, 50, 100 are high (3 of 10): the edge windows allow 25% ± a few percent.
    expect(Math.abs(m.duty - 0.25)).toBeLessThanOrEqual(m.dutyErr + 1e-9);
    expect(m.periodErrMs).toBeGreaterThan(0);
    expect(m.periodErrMs).toBeLessThanOrEqual(50);
  });

  it('says "not enough edges" instead of guessing', () => {
    expect(measureDigital([0, 50, 100, 150], [0, 0, 0, 0])).toEqual({ ok: false, reason: 'not_enough_edges', edges: 0 });
    expect(measureDigital([0, 50, 100, 150], [0, 1, 1, 1])).toEqual({ ok: false, reason: 'not_enough_edges', edges: 1 });
    expect(measureDigital([0, 50, 100, 150, 200], [0, 1, 1, 0, 0])).toEqual({ ok: false, reason: 'not_enough_edges', edges: 2 });
  });

  it('says there are no samples when the range is empty', () => {
    expect(measureDigital([0, 50], [0, 1], 500, 600)).toEqual({ ok: false, reason: 'no_samples', edges: 0 });
  });

  it('refuses when a level lasted one sample (the signal may be faster than the sampling)', () => {
    const m = measureDigital([0, 50, 100, 150, 200, 250, 300], [0, 1, 0, 1, 0, 1, 0]);
    expect(m).toEqual({ ok: false, reason: 'too_fast', edges: 6 });
  });

  it('uses whole cycles only', () => {
    // rise, fall, rise, fall: one full cycle between the first and third edge
    const m = measureDigital([0, 50, 100, 150, 200, 250, 300, 350, 400], [0, 0, 1, 1, 0, 0, 1, 1, 0]);
    expect(m.ok && m.cycles).toBe(1);
    expect(m.ok && m.periodMs).toBe(200);
    expect(m.ok && m.duty).toBeCloseTo(0.5, 5);
  });
});

describe('ring buffer', () => {
  it('keeps the newest samples and one column per pin', () => {
    const r = new SampleRing(4);
    for (let i = 0; i < 6; i++) r.push(i * 50, { '21': { mode: 'in', level: (i % 2) as 0 | 1 }, '34': { mode: 'adc', mv: 100 * i } });
    expect(r.length).toBe(4);
    expect(r.timeAt(0)).toBe(100);
    expect(r.timeAt(3)).toBe(250);
    expect(r.valueAt(21, 3)).toBe(1);
    expect(r.valueAt(34, 0)).toBe(200);
    expect(r.meta.get(34)?.analog).toBe(true);
    expect(r.pins()).toEqual([21, 34]);
    expect(r.indexAtOrBefore(160)).toBe(1);
    expect(r.indexAtOrBefore(50)).toBe(-1);
  });

  it('marks a pin missing from a frame as empty, and starts over when the clock goes back', () => {
    const r = new SampleRing(10);
    r.push(0, { '21': { mode: 'in', level: 1 } });
    r.push(50, { '22': { mode: 'in', level: 0 } });
    expect(Number.isNaN(r.valueAt(21, 1))).toBe(true);
    expect(Number.isNaN(r.valueAt(22, 0))).toBe(true);
    expect(r.push(10, { '21': { mode: 'in', level: 0 } })).toBe('reset');
    expect(r.length).toBe(1);
    expect(r.pins()).toEqual([21]);
  });

  it('exports CSV with time and one column per pin', () => {
    const r = new SampleRing(10);
    r.push(1000, { '21': { mode: 'in', level: 1 }, '34': { mode: 'adc', mv: 1840 } });
    r.push(1050, { '21': { mode: 'in', level: 0 } });
    const csv = r.toCsv((g, m) => `GPIO ${g} ${m?.analog ? 'mV' : 'level'}`);
    expect(csv.split('\n')).toEqual(['time_s,GPIO 21 level,GPIO 34 mV', '1.000,1,1840', '1.050,0,']);
  });
});

describe('decoded I2C lane', () => {
  it('turns the agent trace into boxes', () => {
    const boxes = i2cBoxes([
      { t: 'start' },
      { t: 'addr', v: '0x76', rw: 'w', ack: true },
      { t: 'data', v: '0xD0', ack: true },
      { t: 'restart' },
      { t: 'addr', v: '0x76', rw: 'r', ack: true },
      { t: 'data', v: '0x60', ack: false },
      { t: 'stop' },
    ]);
    expect(boxes.map((b) => b.text)).toEqual(['S', '0x76 W ACK', '0xD0 ACK', 'Sr', '0x76 R ACK', '0x60 NACK', 'P']);
    expect(boxes[5].ack).toBe(false);
    // NACK on the last byte read is how a read ends; a NACK on the address is a real problem.
    expect(boxes[5].expectedNack).toBe(true);
    expect(i2cBoxes([{ t: 'start' }, { t: 'addr', v: '0x77', rw: 'w', ack: false }, { t: 'stop' }])[1]).toEqual({ kind: 'addr', text: '0x77 W NACK', ack: false });
    expect(i2cBoxes([{ t: 'start' }, { t: 'addr', v: '0x76', rw: 'w', ack: true }, { t: 'data', v: '0xD0', ack: false }])[2].expectedNack).toBeUndefined();
  });
});

describe('formatting', () => {
  it('formats times and frequencies', () => {
    expect(formatMs(1250)).toBe('1.25 s');
    expect(formatMs(125)).toBe('125 ms');
    expect(formatMs(12.5)).toBe('12.5 ms');
    expect(formatMs(0.5)).toBe('500 µs');
    expect(formatHz(2)).toBe('2 Hz');
    expect(formatHz(19.87)).toBe('19.9 Hz');
    expect(formatHz(1500)).toBe('1.5 kHz');
  });
  it('picks 1-2-5 axis steps', () => {
    expect(niceStep(130)).toBe(200);
    expect(niceStep(400)).toBe(500);
    expect(niceStep(900)).toBe(1000);
    expect(niceStep(1)).toBe(1);
  });
});
