import { describe, expect, it } from 'vitest';
import { BOARDS, getBoard, isAdcPin } from '@shared/board';
import { planPins, planToMarkdown } from '@shared/planner';

const REQ = { i2c: 1, spi: 1, uart: 1, pwm: 2, adc: 2, out: 2, in: 2 };

describe('pin planner', () => {
  it.each(Object.values(BOARDS).map((b) => [b.id]))('plans a mixed project on %s without conflicts', (id) => {
    const board = getBoard(id);
    const plan = planPins(board, REQ);
    const ids = plan.pins.map((p) => p.pin.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of plan.pins) {
      expect(p.pin.flags, `${id} ${p.need}`).not.toContain('flash');
      expect(p.why.length).toBeGreaterThan(10);
      if (/^(OUT|PWM|SPI CS)/.test(p.need)) expect(p.pin.flags, `${id} ${p.need}`).not.toContain('input_only');
      if (p.need.startsWith('ADC')) expect(isAdcPin(p.pin), `${id} ${p.need}`).toBe(true);
    }
    expect(plan.pins.find((p) => p.need === 'I2C SDA')?.pin.id).toBe(board.rules.i2c.sda);
    expect(plan.defines.split('\n')).toHaveLength(plan.pins.length);
    expect(planToMarkdown(board, plan)).toContain('#define I2C_SDA');
  });

  it('keeps ESP32 analog inputs on ADC1 when Wi-Fi is on', () => {
    const plan = planPins(getBoard('esp32-devkitc-30'), { ...REQ, adc: 4, wifi: true });
    for (const p of plan.pins.filter((x) => x.need.startsWith('ADC'))) expect(p.pin.flags).toContain('adc1');
  });

  it('uses a second hardware UART on ESP32 and explains the Uno has none free', () => {
    const esp = planPins(getBoard('esp32-devkitc-30'), { ...REQ, uart: 1 });
    expect(esp.pins.find((p) => p.need === 'UART 1 TX')?.pin.flags).not.toContain('uart0');
    expect(esp.problems.some((x) => /software serial/i.test(x))).toBe(false);
    const uno = planPins(getBoard('arduino-uno-r3'), { ...REQ, uart: 1 });
    expect(uno.problems.some((x) => /software serial/i.test(x))).toBe(true);
  });

  it('uses PWM pins on the Uno, and leaves wired pins alone', () => {
    const uno = getBoard('arduino-uno-r3');
    const plan = planPins(uno, { i2c: 0, spi: 0, uart: 0, pwm: 3, adc: 0, out: 0, in: 0 });
    for (const p of plan.pins) expect(p.pin.functions.some((f) => /PWM/.test(f))).toBe(true);
    const taken = plan.pins[0].pin.id;
    const again = planPins(uno, { i2c: 0, spi: 0, uart: 0, pwm: 3, adc: 0, out: 0, in: 0 }, {
      board: uno.id,
      parts: [],
      wires: [{ id: 'w', from: { part: 'board', pin: taken }, to: { part: 'x', pin: 'A' }, color: '#fff' }],
    });
    expect(again.pins.some((p) => p.pin.id === taken)).toBe(false);
  });

  it('says so when a board runs out of analog pins', () => {
    const plan = planPins(getBoard('esp32-c3-devkitm-1'), { i2c: 0, spi: 0, uart: 0, pwm: 0, adc: 20, out: 0, in: 0 });
    expect(plan.problems.some((x) => /analog/.test(x))).toBe(true);
  });
});
