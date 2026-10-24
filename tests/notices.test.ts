import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAi, useScene, type ChatItem } from '../app/renderer/state/store';
import { startEventFeed, stillFound, useOpenChecks } from '../app/renderer/state/events';
import type { Scene } from '@shared/types';

// An LED on D34: GPIO 34 is input-only, so the wiring check reports an error on that wire.
const inputOnly: Scene = {
  board: 'esp32-devkitc-30',
  parts: [{ id: 'led1', partId: 'led-resistor', position: [40, 0, 50] }],
  wires: [{ id: 'w1', from: { part: 'board', pin: 'D34' }, to: { part: 'led1', pin: 'A' }, color: '#5CCB8F' }],
};
const notices = () => useAi.getState().items.filter((i): i is Extract<ChatItem, { role: 'notice' }> => i.role === 'notice');

describe('the assistant speaks up only about what the checks still find', () => {
  afterEach(() => vi.useRealTimers());

  it('drops a waiting notice when the problem goes away before it is shown', () => {
    vi.useFakeTimers();
    startEventFeed();
    useScene.getState().setScene({ board: 'esp32-devkitc-30', parts: [], wires: [] });
    vi.advanceTimersByTime(5000);
    const before = notices().length;
    useScene.getState().setScene(inputOnly);
    expect(useOpenChecks.getState().wiring.size).toBeGreaterThan(0);
    // Another board, well within the notice delay: the ESP32 warning is not about this board.
    useScene.getState().setScene({ ...inputOnly, board: 'rpi-pico', wires: [] });
    vi.advanceTimersByTime(5000);
    expect(notices().slice(before).some((n) => n.text.includes('34'))).toBe(false);
  });

  it('marks a notice already shown once the problem is fixed', () => {
    vi.useFakeTimers();
    startEventFeed();
    useScene.getState().setScene({ board: 'esp32-devkitc-30', parts: [], wires: [] });
    vi.advanceTimersByTime(5000);
    const before = notices().length;
    // D35 here (the first test used D34): a notice is announced once per session.
    const d35: Scene = { ...inputOnly, wires: [{ ...inputOnly.wires[0], from: { part: 'board', pin: 'D35' } }] };
    useScene.getState().setScene(d35);
    vi.advanceTimersByTime(5000);
    const shown = notices().slice(before);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((n) => n.key && stillFound(n.key))).toBe(true);
    // Move the wire to an output-capable pin.
    useScene.getState().setScene({ ...inputOnly, wires: [{ ...inputOnly.wires[0], from: { part: 'board', pin: 'D25' } }] });
    const fixed = shown.filter((n) => n.text.includes('35'));
    expect(fixed.length).toBeGreaterThan(0);
    expect(fixed.every((n) => !stillFound(n.key))).toBe(true);
    // Notices without a check behind them (a measurement, a summary) never turn into "no longer found".
    expect(stillFound(undefined)).toBe(true);
    expect(stillFound('l:I2C read failed')).toBe(true);
  });
});
