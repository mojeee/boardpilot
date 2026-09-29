import { describe, expect, it } from 'vitest';
import { makeHub } from './helpers';

describe('simulator: flashing the sample firmware', () => {
  it('passes the pre-flight check, labelled simulated (there is no file on disk)', async () => {
    const { hub, ready } = makeHub('healthy');
    await ready;
    const r = await hub.preflight('/simulated/weather-station.ino.bin');
    expect(r.ok && r.value.ok).toBe(true);
    if (r.ok) expect(r.value.items[0].text).toMatch(/simulated/);
  });

  it('still reads a real path in the simulator (and says when it is missing)', async () => {
    const { hub, ready } = makeHub('healthy');
    await ready;
    const r = await hub.preflight('/no/such/file.bin');
    expect(r.ok).toBe(false);
  });
});
