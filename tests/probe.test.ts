import { describe, expect, it } from 'vitest';
import { parseProbeLine, printableRatio } from '@shared/probe';

describe('BoardPilotProbe lines', () => {
  it('parses values with pin hints', () => {
    expect(parseProbeLine('@bp {"t":10,"v":{"temperature":22.4,"pot":1840},"pins":{"pot":34}}')).toEqual({
      t: 10,
      values: { temperature: 22.4, pot: 1840 },
      pins: { pot: 34 },
    });
  });
  it('parses memory lines', () => {
    expect(parseProbeLine('@bp {"t":5,"mem":{"heapFree":201344,"heapMin":190000}}')?.mem?.heapFree).toBe(201344);
  });
  it('ignores normal prints and broken JSON', () => {
    expect(parseProbeLine('T=22.4 C')).toBeNull();
    expect(parseProbeLine('@bp {"t":')).toBeNull();
  });
  it('measures how readable serial text is', () => {
    expect(printableRatio(['Hello world'])).toBe(1);
    expect(printableRatio(['⸮⸮ÿx'])).toBeLessThan(0.5);
  });
});
