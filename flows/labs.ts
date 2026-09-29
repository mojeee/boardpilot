// Hands-on labs for the lessons (issue #7). Each lab is a short flow: find the part in the project
// (or ask for the pin), install the diagnostic agent after a confirmation and backup, have the user
// do something physical, and check it with live measurements. A passed lab marks its lesson done.

import type { Evidence, FlowContext, FlowDef, ResultData, StepDef, StepOption } from '@shared/flow';
import type { PinDef, TargetRef } from '@shared/types';
import { boardPinFor, pinById, wireFor } from '@shared/board';
import { t } from '@shared/i18n';
import { ensureBoardStep, fmtErr, i2cTarget, i2cTargets, installAgentStep } from './common';

interface LabPin {
  pin: PinDef;
  gpio: number;
  partInst?: string;
  wire?: string;
}

const labPin = (ctx: FlowContext) => ctx.data.labPin as LabPin | undefined;

const targetsOf = (ctx: FlowContext): TargetRef[] => {
  const lp = labPin(ctx);
  if (!lp) return [];
  const out: TargetRef[] = [`pin:${lp.pin.id}`];
  if (lp.wire) out.push(`wire:${lp.wire}`);
  if (lp.partInst) out.push(`part:${lp.partInst}`);
  return out;
};

function result(ctx: FlowContext, r: Omit<ResultData, 'highlight' | 'nextSteps' | 'sources'> & { passed: boolean; nextSteps?: string[]; sources?: string[] }): ResultData {
  ctx.log(r.passed ? 'found' : 'warning', r.passed ? t('Lab passed: {title}', { title: t(r.title) }) : t('Lab not passed yet: {title}', { title: t(r.title) }), {
    target: targetsOf(ctx)[0],
    source: r.confidence === 'measured' ? 'measured: diagnostic agent' : r.confidence,
  });
  return { highlight: targetsOf(ctx), nextSteps: [], sources: [], ...r };
}

/** Find the pin from the project: a part of one of these kinds, wired to the board by this pin. */
function findPinStep(partIds: string[], partPin: string, what: string): StepDef {
  return {
    id: 'find',
    type: 'auto',
    title: 'Find it in your project',
    async run(ctx) {
      const scene = ctx.scene();
      for (const inst of scene.parts.filter((p) => partIds.includes(p.partId))) {
        const id = boardPinFor(scene, inst.id, partPin);
        const pin = id ? pinById(ctx.board, id) : undefined;
        if (pin && pin.gpio !== null) {
          ctx.data.labPin = { pin, gpio: pin.gpio, partInst: inst.id, wire: wireFor(scene, inst.id, partPin)?.id } satisfies LabPin;
          ctx.log('found', t('From your project: the {what} is on {pin}.', { what: t(what), pin: pin.label }), { target: `pin:${pin.id}`, source: 'project scene' });
          return { status: 'ok', summary: t('{what} on {pin}.', { what: t(what), pin: pin.label }) };
        }
      }
      return { status: 'ok', summary: t('Not in your project yet: the app asks for the pin.') };
    },
    highlight: targetsOf,
  };
}

/** Ask for the pin only when the project did not say (look before asking). */
function pickPinStep(what: string, candidates: (ctx: FlowContext) => string[]): StepDef {
  return {
    id: 'pick',
    type: 'question',
    title: 'Which pin?',
    body: (ctx) => t('Which pin is the {what} connected to? These are the usual ones on the {board}.', { what: t(what), board: ctx.board.name }),
    when: (ctx) => !labPin(ctx),
    options: (ctx): StepOption[] =>
      candidates(ctx)
        .map((id) => pinById(ctx.board, id))
        .filter((p): p is PinDef => !!p && p.gpio !== null)
        .slice(0, 8)
        .map((p) => ({ id: p.id, label: p.label, hint: p.gpio !== null ? `GPIO ${p.gpio}` : undefined })),
    async run(ctx, answer) {
      const pin = answer?.kind === 'option' ? pinById(ctx.board, answer.optionId) : undefined;
      if (!pin || pin.gpio === null) return { status: 'failed', summary: 'Pick a pin from the list.' };
      ctx.data.labPin = { pin, gpio: pin.gpio } satisfies LabPin;
      ctx.highlight([`pin:${pin.id}`]);
      return { status: 'ok', summary: t('You picked {pin}.', { pin: pin.label }) };
    },
  };
}

/** Boards without an agent: the lab cannot measure, and says so. */
function agentSteps(): StepDef[] {
  const install = installAgentStep();
  return [
    {
      id: 'agent-unavailable',
      type: 'auto',
      title: 'Check the diagnostic agent',
      when: (ctx) => !ctx.board.toolchain.agent,
      async run(ctx) {
        return {
          status: 'warning',
          summary: 'No diagnostic agent for this board yet, so the lab cannot measure.',
          result: result(ctx, {
            passed: false,
            title: 'This lab needs the diagnostic agent',
            cause: t('The {board} has no diagnostic agent yet, so the app cannot see its pins. Try the lab in the simulator, or on a board that has the agent.', { board: ctx.board.name }),
            confidence: 'documented',
            evidence: [{ text: t('No agent build for the {board}.', { board: ctx.board.name }), source: `library: ${ctx.board.id}`, confidence: 'documented' }],
          }),
        };
      },
    },
    { ...install, fallbacks: [{ id: 'retry', label: 'Show the confirmation again', kind: 'retry' }] },
  ];
}

const levels = async (ctx: FlowContext, gpio: number, n: number, gapMs: number): Promise<(0 | 1)[] | string> => {
  const out: (0 | 1)[] = [];
  for (let i = 0; i < n; i++) {
    const r = await ctx.hw.agent({ cmd: 'gpio_read', pin: gpio });
    if (!r.ok) return fmtErr(r.error);
    out.push(r.value.level);
    if (i < n - 1) await ctx.sleep(gapMs);
  }
  return out;
};

/* ------------------------------------------------------------------ Blink */

export const labBlink: FlowDef = {
  id: 'lab-blink',
  title: 'Lab: blink an LED',
  description: 'The agent switches the LED pin on and off; the app reads the pin back and you say what the LED did.',
  steps: [
    ensureBoardStep(),
    findPinStep(['led-resistor'], 'A', 'LED'),
    pickPinStep('LED', (ctx) => ctx.board.rules.safeIo),
    ...agentSteps(),
    {
      id: 'allow',
      type: 'confirm',
      title: 'Allow the blink',
      body: (ctx) => t('The agent will switch {pin} on and off 3 times (6 writes), then leave it off.', { pin: labPin(ctx)?.pin.label ?? '' }),
      confirm: { write: 'gpio_write', uses: 6, details: ['Only if nothing else drives this pin.', 'The agent refuses input-only and flash pins.'] },
      highlight: targetsOf,
      async run(ctx, answer) {
        if (answer?.kind !== 'confirm' || !answer.confirmed || !answer.token) return { status: 'failed', summary: 'You cancelled. Nothing was written.' };
        ctx.data.token = answer.token;
        return { status: 'ok', summary: 'Allowed.' };
      },
      fallbacks: [{ id: 'retry', label: 'Show the confirmation again', kind: 'retry' }],
    },
    {
      id: 'blink',
      type: 'auto',
      title: 'Blink and read the pin back',
      highlight: targetsOf,
      async run(ctx) {
        const lp = labPin(ctx)!;
        const token = ctx.data.token as string;
        const seen: (0 | 1)[] = [];
        for (let i = 0; i < 6; i++) {
          const level = (i % 2 === 0 ? 1 : 0) as 0 | 1;
          const w = await ctx.hw.agentWrite({ cmd: 'gpio_write', pin: lp.gpio, level }, token);
          if (!w.ok) {
            ctx.data.blinkError = fmtErr(w.error);
            return {
              status: 'warning',
              summary: fmtErr(w.error),
              result: result(ctx, {
                passed: false,
                title: 'The pin cannot drive the LED',
                cause: t('The agent refused to drive {pin}: {error} Move the LED to one of these pins: {pins}.', {
                  pin: lp.pin.label,
                  error: fmtErr(w.error),
                  pins: ctx.board.rules.safeIo.slice(0, 4).map((id) => pinById(ctx.board, id)?.label ?? id).join(', '),
                }),
                confidence: 'measured',
                evidence: [{ text: fmtErr(w.error), source: 'measured: agent gpio_write', target: `pin:${lp.pin.id}`, confidence: 'measured' }],
              }),
            };
          }
          const r = await ctx.hw.agent({ cmd: 'gpio_read', pin: lp.gpio });
          if (r.ok) seen.push(r.value.level);
          await ctx.sleep(400);
        }
        ctx.data.seen = seen;
        const ok = seen.length === 6 && seen.every((v, i) => v === (i % 2 === 0 ? 1 : 0));
        ctx.log(ok ? 'check' : 'warning', t('{pin} read back: {levels}.', { pin: lp.pin.label, levels: seen.join(' ') }), { target: `pin:${lp.pin.id}`, source: 'measured: agent gpio_read' });
        return ok ? { status: 'ok', summary: t('{pin} followed every write.', { pin: lp.pin.label }) } : { status: 'warning', summary: t('{pin} did not follow every write.', { pin: lp.pin.label }) };
      },
    },
    {
      id: 'see',
      type: 'question',
      title: 'Did the LED blink?',
      body: 'The pin switched 3 times. What did the LED do?',
      options: [
        { id: 'yes', label: 'It blinked 3 times' },
        { id: 'no', label: 'It stayed off' },
        { id: 'on', label: 'It stayed on' },
      ],
      highlight: targetsOf,
    },
    {
      id: 'result',
      type: 'result',
      title: 'Result',
      async run(ctx) {
        const lp = labPin(ctx)!;
        const seen = (ctx.data.seen as (0 | 1)[] | undefined) ?? [];
        const followed = seen.length === 6 && seen.every((v, i) => v === (i % 2 === 0 ? 1 : 0));
        const ans = ctx.answers.see;
        const saw = ans?.kind === 'option' ? ans.optionId : 'no';
        const ev: Evidence[] = [
          { text: t('{pin} read back {levels} after writing 1 0 1 0 1 0.', { pin: lp.pin.label, levels: seen.join(' ') }), source: 'measured: agent gpio_write + gpio_read', target: `pin:${lp.pin.id}`, confidence: 'measured' },
          { text: t('You saw: {answer}', { answer: t(ans?.kind === 'option' ? ans.label : '') }), source: 'your answer', confidence: 'suggestion' },
        ];
        if (followed && saw === 'yes')
          return {
            status: 'ok',
            summary: 'Lab passed.',
            result: result(ctx, { passed: true, title: 'Your LED blinks', cause: t('{pin} switched as told, and you saw the LED follow it. digitalWrite() in your own code does exactly this.', { pin: lp.pin.label }), confidence: 'measured', evidence: ev }),
          };
        const cause = !followed
          ? t('{pin} did not read back what was written, so something else pulls it: another part or a short. Check what else is connected to {pin}.', { pin: lp.pin.label })
          : saw === 'on'
            ? t('The pin switched, but the LED stayed on: it is probably wired to 3.3 V instead of to {pin}, or {pin} is not the pin it is on.', { pin: lp.pin.label })
            : t('The pin switched, but the LED stayed dark. Most often the LED is the wrong way round (the long leg goes to the pin side), the resistor is missing a contact, or the short leg is not on GND.');
        return {
          status: 'warning',
          summary: 'Not passed yet.',
          result: result(ctx, { passed: false, title: 'The LED did not blink', cause, confidence: followed ? 'suggestion' : 'measured', evidence: ev, nextSteps: ['Fix it and run the lab again.'] }),
        };
      },
    },
  ],
};

/* ------------------------------------------------------------------ Button */

export const labButton: FlowDef = {
  id: 'lab-button',
  title: 'Lab: read a button',
  description: 'The app checks the pull-up, then watches the pin go from 1 to 0 while you press.',
  steps: [
    ensureBoardStep(),
    findPinStep(['push-button'], '1', 'button'),
    pickPinStep('button', (ctx) => [...(ctx.board.rules.inputPins ?? []), ...ctx.board.rules.safeIo]),
    ...agentSteps(),
    {
      id: 'released',
      type: 'auto',
      title: 'Read the pin while released',
      highlight: targetsOf,
      async run(ctx) {
        const lp = labPin(ctx)!;
        const pu = await ctx.hw.agent({ cmd: 'pullup_check', pins: [lp.gpio] });
        if (!pu.ok) return { status: 'failed', summary: fmtErr(pu.error) };
        const external = pu.value.external[String(lp.gpio)] === true;
        const lv = await levels(ctx, lp.gpio, 12, 60);
        if (typeof lv === 'string') return { status: 'failed', summary: lv };
        const stableHigh = lv.every((v) => v === 1);
        ctx.data.released = lv;
        ctx.log(stableHigh ? 'check' : 'warning', t('{pin} released: {levels}.', { pin: lp.pin.label, levels: lv.join('') }), { target: `pin:${lp.pin.id}`, source: 'measured: agent gpio_read' });
        if (stableHigh) return { status: 'ok', summary: external ? t('Released it reads 1, held by a pull-up resistor.') : t('Released it reads 1.') };
        const flips = lv.some((v, i) => i > 0 && v !== lv[i - 1]);
        return {
          status: 'warning',
          summary: 'The released pin is not a steady 1.',
          result: result(ctx, {
            passed: false,
            title: flips ? 'The pin floats' : 'The pin reads 0 while released',
            cause: flips
              ? t('Released, {pin} changes by itself ({levels}): nothing holds it at a level. In your sketch INPUT_PULLUP turns on the chip’s own pull-up and fixes it. The agent reads pins without that pull-up, so for this lab put a 10 kΩ resistor from {pin} to 3.3 V, then run the lab again.', { pin: lp.pin.label, levels: lv.join('') })
              : t('Released, {pin} reads 0 all the time. Either the button is wired to 3.3 V instead of GND, it is stuck, or a pull-down holds the pin low. Wire the button between {pin} and GND with a 10 kΩ pull-up to 3.3 V.', { pin: lp.pin.label }),
            confidence: 'measured',
            evidence: [
              { text: t('{pin} released read {levels}.', { pin: lp.pin.label, levels: lv.join('') }), source: 'measured: agent gpio_read', target: `pin:${lp.pin.id}`, confidence: 'measured' },
              { text: external ? t('An external pull-up is present.') : t('No external pull-up found.'), source: 'measured: agent pullup_check', target: `pin:${lp.pin.id}`, confidence: 'measured' },
            ],
            nextSteps: ['Add the pull-up and run the lab again.'],
          }),
        };
      },
    },
    {
      id: 'press',
      type: 'action',
      title: 'Press and hold the button',
      body: 'Press the button and keep it down, then click “Done, check it”. The app watches the pin for 3 seconds.',
      simControl: 'pressButton',
      highlight: targetsOf,
      async run(ctx) {
        const lp = labPin(ctx)!;
        const lv = await levels(ctx, lp.gpio, 15, 200);
        if (typeof lv === 'string') return { status: 'failed', summary: lv };
        ctx.data.pressed = lv;
        const low = lv.filter((v) => v === 0).length;
        ctx.log(low ? 'check' : 'warning', t('{pin} while pressed: {levels}.', { pin: lp.pin.label, levels: lv.join('') }), { target: `pin:${lp.pin.id}`, source: 'measured: agent gpio_read' });
        if (low >= 2) return { status: 'ok', summary: t('{pin} went to 0 while pressed.', { pin: lp.pin.label }) };
        return { status: 'failed', summary: t('{pin} stayed at 1: the press did not reach the pin.', { pin: lp.pin.label }) };
      },
      aiHelp: (ctx) => t('In a button lab, the pin {pin} stays HIGH even while the user presses the button. Explain the likely wiring mistakes for a beginner (button legs on the same side of the breadboard gap, wrong row, not wired to GND).', { pin: labPin(ctx)?.pin.label ?? '' }),
      fallbacks: [{ id: 'retry', label: 'Try again', kind: 'retry' }],
    },
    {
      id: 'result',
      type: 'result',
      title: 'Result',
      async run(ctx) {
        const lp = labPin(ctx)!;
        const rel = (ctx.data.released as (0 | 1)[]).join('');
        const pr = (ctx.data.pressed as (0 | 1)[]).join('');
        return {
          status: 'ok',
          summary: 'Lab passed.',
          result: result(ctx, {
            passed: true,
            title: 'Your button works',
            cause: t('{pin} reads 1 when released and 0 when pressed. That is “active low”: in code, if (digitalRead(pin) == LOW) means pressed.', { pin: lp.pin.label }),
            confidence: 'measured',
            evidence: [
              { text: t('Released: {levels}', { levels: rel }), source: 'measured: agent gpio_read', target: `pin:${lp.pin.id}`, confidence: 'measured' },
              { text: t('Pressed: {levels}', { levels: pr }), source: 'measured: agent gpio_read', target: `pin:${lp.pin.id}`, confidence: 'measured' },
            ],
          }),
        };
      },
    },
  ],
};

/* ------------------------------------------------------------------ ADC */

export const labAdc: FlowDef = {
  id: 'lab-adc',
  title: 'Lab: read a potentiometer',
  description: 'Turn the knob end to end while the app reads the ADC; it checks that the reading covers most of the range.',
  steps: [
    ensureBoardStep(),
    findPinStep(['potentiometer'], 'OUT', 'knob'),
    pickPinStep('knob', (ctx) => ctx.board.rules.adcPins),
    ...agentSteps(),
    {
      id: 'turn',
      type: 'action',
      title: 'Turn the knob end to end',
      body: 'Click “Done, check it”, then turn the knob slowly from one end to the other and back. The app reads it for 6 seconds.',
      simControl: 'turnKnob',
      highlight: targetsOf,
      async run(ctx) {
        const lp = labPin(ctx)!;
        const mv: number[] = [];
        for (let i = 0; i < 30; i++) {
          const r = await ctx.hw.agent({ cmd: 'adc', pin: lp.gpio });
          if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
          mv.push(r.value.mv);
          await ctx.sleep(200);
        }
        const min = Math.min(...mv);
        const max = Math.max(...mv);
        const full = ctx.board.rules.adcMaxMv;
        ctx.data.adc = { min, max, full };
        ctx.log('check', t('{pin}: lowest {min} mV, highest {max} mV (full scale {full} mV).', { pin: lp.pin.label, min, max, full }), { target: `pin:${lp.pin.id}`, source: 'measured: agent adc' });
        return { status: 'ok', summary: t('From {min} to {max} mV.', { min, max }) };
      },
      fallbacks: [{ id: 'retry', label: 'Try again', kind: 'retry' }],
    },
    {
      id: 'result',
      type: 'result',
      title: 'Result',
      async run(ctx) {
        const lp = labPin(ctx)!;
        const { min, max, full } = ctx.data.adc as { min: number; max: number; full: number };
        const cover = (max - min) / full;
        const ev: Evidence[] = [
          { text: t('Lowest {min} mV, highest {max} mV: {pct}% of the {full} mV range.', { min, max, pct: Math.round(cover * 100), full }), source: 'measured: agent adc', target: `pin:${lp.pin.id}`, confidence: 'measured' },
        ];
        if (cover >= 0.7)
          return {
            status: 'ok',
            summary: 'Lab passed.',
            result: result(ctx, { passed: true, title: 'Your knob reads the full range', cause: t('The reading went from {min} to {max} mV. analogRead() gives you the same, as a number.', { min, max }), confidence: 'measured', evidence: ev }),
          };
        const stuck = max - min < full * 0.05;
        return {
          status: 'warning',
          summary: 'Not passed yet.',
          result: result(ctx, {
            passed: false,
            title: stuck ? 'The reading did not change' : 'The reading covered only part of the range',
            cause: stuck
              ? t('The value stayed near {min} mV. The middle leg (wiper) may not be on {pin}, or an outer leg is not on 3.3 V or GND. Did you turn it while the app was reading?', { min, pin: lp.pin.label })
              : t('The value moved but only across {pct}% of the range. Turn it fully both ways, and check that the outer legs go to 3.3 V and GND (not 5 V or VIN).', { pct: Math.round(cover * 100) }),
            confidence: 'suggestion',
            evidence: ev,
            nextSteps: ['Fix it and run the lab again.'],
          }),
        };
      },
    },
  ],
};

/* ------------------------------------------------------------------ I2C */

export const labI2c: FlowDef = {
  id: 'lab-i2c',
  title: 'Lab: talk to an I2C sensor',
  description: 'Scan the I2C bus, read the sensor’s chip-ID register, and see what each byte means.',
  steps: [
    ensureBoardStep(),
    {
      id: 'find',
      type: 'auto',
      title: 'Find the sensor in your project',
      async run(ctx) {
        const tg = i2cTarget(ctx);
        if (!tg) {
          const sda = pinById(ctx.board, ctx.board.rules.i2c.sda);
          const scl = pinById(ctx.board, ctx.board.rules.i2c.scl);
          ctx.data.bus = { sda: sda?.gpio ?? 0, scl: scl?.gpio ?? 0, sdaPin: sda?.id ?? '', sclPin: scl?.id ?? '' };
          return { status: 'ok', summary: t('No I2C part in your project: using the board’s default bus, SDA {sda} and SCL {scl}.', { sda: sda?.label ?? '?', scl: scl?.label ?? '?' }) };
        }
        ctx.data.bus = { sda: tg.sda, scl: tg.scl, sdaPin: tg.sdaPin, sclPin: tg.sclPin, part: tg.def.id, inst: tg.inst.id };
        return { status: 'ok', summary: t('{part}, SDA {sda}, SCL {scl}.', { part: tg.def.name, sda: tg.sdaPin, scl: tg.sclPin }) };
      },
      highlight: (ctx) => i2cTargets(ctx),
    },
    ...agentSteps(),
    {
      id: 'scan',
      type: 'auto',
      title: 'Scan the bus',
      highlight: (ctx) => i2cTargets(ctx),
      async run(ctx) {
        const b = ctx.data.bus as { sda: number; scl: number };
        const r = await ctx.hw.agent({ cmd: 'i2c_scan', sda: b.sda, scl: b.scl });
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        ctx.data.found = r.value.found;
        if (r.value.found.length) {
          ctx.log('found', t('Devices answering: {list}.', { list: r.value.found.join(', ') }), { source: 'measured: i2c_scan' });
          return { status: 'ok', summary: t('Found {list}.', { list: r.value.found.join(', ') }) };
        }
        const sw = await ctx.hw.agent({ cmd: 'i2c_scan', sda: b.scl, scl: b.sda });
        ctx.data.swapped = sw.ok ? sw.value.found : [];
        return { status: 'warning', summary: 'Nothing answered as wired.' };
      },
    },
    {
      id: 'read',
      type: 'result',
      title: 'Result',
      async run(ctx) {
        const b = ctx.data.bus as { sda: number; scl: number; sdaPin: string; sclPin: string; part?: string };
        const found = (ctx.data.found as string[]) ?? [];
        const swapped = (ctx.data.swapped as string[] | undefined) ?? [];
        if (!found.length) {
          const crossed = swapped.length > 0;
          return {
            status: 'warning',
            summary: 'Not passed yet.',
            result: result(ctx, {
              passed: false,
              title: crossed ? 'SDA and SCL are crossed' : 'Nothing answers on the bus',
              cause: crossed
                ? t('Nothing answered as wired, but {list} answered with SDA and SCL exchanged. Swap the two wires (or the pins in your code) and run the lab again.', { list: swapped.join(', ') })
                : t('No device answered. Check power (VIN to 3.3 V, GND to GND), that SDA goes to {sda} and SCL to {scl}, and that the board has pull-ups.', { sda: b.sdaPin, scl: b.sclPin }),
              confidence: 'measured',
              evidence: [
                { text: t('Scan as wired: nothing.'), source: 'measured: i2c_scan', target: `pin:${b.sdaPin}`, confidence: 'measured' },
                { text: crossed ? t('Scan with SDA and SCL exchanged: {list}.', { list: swapped.join(', ') }) : t('Scan with SDA and SCL exchanged: nothing.'), source: 'measured: i2c_scan (swapped)', confidence: 'measured' },
              ],
              nextSteps: ['Fix it and run the lab again.'],
            }),
          };
        }
        const def = b.part ? ctx.parts[b.part] : Object.values(ctx.parts).find((p) => p.bus === 'i2c' && p.idCheck && p.addresses?.some((a) => found.includes(a.toLowerCase()) || found.includes(a)));
        const addr = found[0];
        const ev: Evidence[] = [{ text: t('Devices answering: {list}.', { list: found.join(', ') }), source: 'measured: i2c_scan', target: `pin:${b.sdaPin}`, confidence: 'measured' }];
        let cause = t('A device answered at {addr}. The scan sends each address and listens for an ACK: only a real chip pulls SDA low to answer.', { addr });
        if (def?.idCheck) {
          const r = await ctx.hw.agent({ cmd: 'i2c_read', sda: b.sda, scl: b.scl, addr, reg: def.idCheck.register, len: 1 });
          if (r.ok) {
            const v = r.value.data[0];
            ev.push({ text: t('Register {reg} at {addr} reads {value}.', { reg: def.idCheck.register, addr, value: v }), source: 'measured: i2c_read', confidence: 'measured' });
            const expect = def.idCheck.expect.toLowerCase();
            cause +=
              ' ' +
              (v?.toLowerCase() === expect
                ? t('Its chip-ID register {reg} reads {value}, which the datasheet gives for the {part}.', { reg: def.idCheck.register, value: v, part: def.name })
                : def.idCheck.otherValues?.[v]
                  ? t(def.idCheck.otherValues[v])
                  : t('Its chip-ID register {reg} reads {value}; the {part} should read {expect}.', { reg: def.idCheck.register, value: v, part: def.name, expect: def.idCheck.expect }));
          }
        }
        return {
          status: 'ok',
          summary: 'Lab passed.',
          result: result(ctx, { passed: true, title: 'Your sensor answers on I2C', cause, confidence: 'measured', evidence: ev, sources: def?.sources.map((s) => `${s.title}${s.section ? `, ${s.section}` : ''}`) ?? [] }),
        };
      },
    },
  ],
};

export const LABS = [labBlink, labButton, labAdc, labI2c];
