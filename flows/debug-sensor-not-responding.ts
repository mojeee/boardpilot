import type { Evidence, FlowDef, FlowContext, ResultData } from '@shared/flow';
import type { TargetRef } from '@shared/types';
import { PARTS, wireFor } from '@shared/board';
import { checkWiring } from '@shared/wiring';
import { ensureBoardStep, fmtErr, i2cTarget, i2cTargets, installAgentStep } from './common';

interface Facts {
  pullups?: { sda: boolean; scl: boolean };
  scanWired?: string[];
  scanSwapped?: string[];
  crossed?: boolean;
  addr?: string;
  idValue?: string;
  workSda?: number;
  workScl?: number;
}

const facts = (ctx: FlowContext): Facts => {
  if (!ctx.data.facts) ctx.data.facts = {};
  return ctx.data.facts as Facts;
};


export const debugSensorNotResponding: FlowDef = {
  id: 'debug-sensor-not-responding',
  title: 'Debug: sensor not responding',
  description: 'Checks power, pull-ups, the I2C bus, crossed wires and the chip ID, step by step.',
  steps: [
    ensureBoardStep(),
    {
      id: 'symptom',
      type: 'question',
      title: 'What do you see?',
      body: 'Pick the closest one, or describe it in your own words.',
      allowFreeText: true,
      options: [
        { id: 'zeros', label: 'It reads zeros or nothing' },
        { id: 'not-found', label: 'My code says the sensor is not found' },
        { id: 'wrong', label: 'Values look wrong' },
        { id: 'stopped', label: 'It worked before, now it stopped' },
      ],
    },
    {
      id: 'sensor',
      type: 'auto',
      title: 'Which sensor?',
      async run(ctx) {
        const t = i2cTarget(ctx);
        if (!t) return { status: 'warning', summary: 'No I2C sensor in your project yet. Tell the app which one.' };
        ctx.data.partInstance = t.inst.id;
        ctx.log('found', `From your project: ${t.def.name} with SDA on ${t.sdaPin} and SCL on ${t.sclPin}.`, {
          target: `part:${t.inst.id}`,
          source: 'project scene',
        });
        return { status: 'ok', summary: `${t.def.name}, SDA ${t.sdaPin}, SCL ${t.sclPin}.` };
      },
      highlight: (ctx) => i2cTargets(ctx),
    },
    {
      id: 'sensor-input',
      type: 'input',
      title: 'Tell the app which sensor',
      body: 'Type the model printed on the board, pick it from the list, take a photo, or upload its datasheet.',
      inputs: ['library', 'model', 'photo', 'datasheet'],
      when: (ctx) => !ctx.data.partInstance,
      async run(ctx, answer) {
        if (answer?.kind !== 'input') return { status: 'failed', summary: 'No sensor chosen.' };
        const partId =
          answer.partId ??
          Object.values(PARTS).find((p) => p.keywords.some((k) => answer.value.toLowerCase().includes(k)))?.id;
        if (!partId || PARTS[partId]?.bus !== 'i2c') {
          return { status: 'failed', summary: `“${answer.value}” is not an I2C sensor in the parts library yet. Pick one from the list, or ask the assistant.` };
        }
        const id = `${partId.split('-')[0]}1`;
        ctx.updateScene((s) => ({
          ...s,
          parts: [...s.parts.filter((p) => p.id !== id), { id, partId, position: [12, 0, 44], label: PARTS[partId].name, confirmed: true }],
          wires: [
            ...s.wires.filter((w) => w.to.part !== id),
            { id: `${id}-sda`, from: { part: 'board', pin: 'D21' }, to: { part: id, pin: 'SDA' }, color: '#3FB6E8' },
            { id: `${id}-scl`, from: { part: 'board', pin: 'D22' }, to: { part: id, pin: 'SCL' }, color: '#9ADCF7' },
          ],
        }));
        ctx.data.partInstance = id;
        ctx.log('info', `Assuming the default pins: SDA on D21, SCL on D22. Change the wires in the 3D view if yours differ.`, {
          source: 'suggestion (default Arduino pins)',
        });
        return { status: 'ok', summary: `${PARTS[partId].name}, on the default pins D21 and D22.` };
      },
      fallbacks: [{ id: 'retry', label: 'Try again', kind: 'retry' }],
    },
    installAgentStep(),
    {
      id: 'pullups',
      type: 'auto',
      title: 'Check power and pull-ups',
      body: 'I2C lines need pull-up resistors. Most breakouts have them, powered by the sensor’s VIN. No pull-up usually means no power.',
      highlight: (ctx) => i2cTargets(ctx),
      async run(ctx) {
        const t = i2cTarget(ctx);
        if (!t) return { status: 'failed', summary: 'No sensor selected.' };
        const r = await ctx.hw.agent({ cmd: 'pullup_check', pins: [t.sda, t.scl] });
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const sda = !!r.value.external[String(t.sda)];
        const scl = !!r.value.external[String(t.scl)];
        facts(ctx).pullups = { sda, scl };
        ctx.log(sda ? 'check' : 'warning', `${t.sdaPin}: ${sda ? 'pulled up (HIGH with nothing driving it)' : 'no pull-up (LOW)'}`, {
          target: `pin:${t.sdaPin}`,
          source: 'measured: pullup_check',
        });
        ctx.log(scl ? 'check' : 'warning', `${t.sclPin}: ${scl ? 'pulled up (HIGH with nothing driving it)' : 'no pull-up (LOW)'}`, {
          target: `pin:${t.sclPin}`,
          source: 'measured: pullup_check',
        });
        if (sda && scl) return { status: 'ok', summary: 'Both lines are pulled up, so the sensor very likely has power.' };
        if (!sda && !scl)
          return { status: 'warning', summary: 'Neither line is pulled up. The sensor may have no power or no ground, or the wires are loose.' };
        return { status: 'warning', summary: `Only ${sda ? t.sdaPin : t.sclPin} is pulled up. One of the two wires may be loose.` };
      },
      aiHelp: () => 'The pull-up check on my I2C lines did not pass. What does that mean for a GY-BME280 breakout?',
      fallbacks: [{ id: 'retry', label: 'Check again', kind: 'retry' }, { id: 'skip', label: 'Skip this check', kind: 'skip' }],
    },
    {
      id: 'scan',
      type: 'auto',
      title: 'Scan the I2C bus as wired',
      highlight: (ctx) => i2cTargets(ctx),
      async run(ctx) {
        const t = i2cTarget(ctx);
        if (!t) return { status: 'failed', summary: 'No sensor selected.' };
        const r = await ctx.hw.agent({ cmd: 'i2c_scan', sda: t.sda, scl: t.scl, hz: 100000 });
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const f = facts(ctx);
        f.scanWired = r.value.found;
        const expected = t.def.addresses ?? [];
        const hit = r.value.found.find((a) => expected.some((e) => e.toLowerCase() === a.toLowerCase()));
        ctx.log(r.value.found.length ? 'found' : 'warning', r.value.found.length ? `Devices answering: ${r.value.found.join(', ')}` : `No device answered with SDA = ${t.sdaPin}, SCL = ${t.sclPin}.`, {
          target: `part:${t.inst.id}`,
          source: 'measured: i2c_scan',
        });
        if (hit) {
          f.addr = hit;
          f.workSda = t.sda;
          f.workScl = t.scl;
          return { status: 'ok', summary: `${t.def.name} answers at ${hit}.` };
        }
        if (r.value.found.length) return { status: 'warning', summary: `Something answers at ${r.value.found.join(', ')}, but not at the ${t.def.name} addresses ${expected.join(' / ')}.` };
        return { status: 'warning', summary: 'Nothing answered. Next: try with SDA and SCL exchanged.' };
      },
      fallbacks: [{ id: 'retry', label: 'Scan again', kind: 'retry' }],
    },
    {
      id: 'swap',
      type: 'auto',
      title: 'Swap test: SDA and SCL exchanged',
      body: 'The ESP32 can move I2C to any pins in software, so the app scans again with the two lines exchanged. If the sensor answers only now, the wires are crossed.',
      when: (ctx) => !facts(ctx).addr,
      highlight: (ctx) => i2cTargets(ctx),
      async run(ctx) {
        const t = i2cTarget(ctx);
        if (!t) return { status: 'failed', summary: 'No sensor selected.' };
        const r = await ctx.hw.agent({ cmd: 'i2c_scan', sda: t.scl, scl: t.sda, hz: 100000 });
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const f = facts(ctx);
        f.scanSwapped = r.value.found;
        const expected = t.def.addresses ?? [];
        const hit = r.value.found.find((a) => expected.some((e) => e.toLowerCase() === a.toLowerCase()));
        if (hit) {
          f.crossed = true;
          f.addr = hit;
          f.workSda = t.scl;
          f.workScl = t.sda;
          const scene = ctx.scene();
          const sdaW = wireFor(scene, t.inst.id, 'SDA');
          ctx.log('found', `${t.def.name} answers at ${hit} only with SDA and SCL exchanged: the wires are crossed.`, {
            target: sdaW ? `wire:${sdaW.id}` : `pin:${t.sdaPin}`,
            source: 'measured: i2c_scan (swapped)',
          });
          return { status: 'warning', summary: `Found at ${hit} with the lines exchanged. SDA and SCL are crossed.` };
        }
        ctx.log('warning', 'No answer with the lines exchanged either.', { source: 'measured: i2c_scan (swapped)' });
        return { status: 'warning', summary: 'No answer either way.' };
      },
    },
    {
      id: 'id',
      type: 'auto',
      title: 'Read the chip ID',
      body: 'Every Bosch sensor has an ID register. It tells the BME280 (0x60) from the look-alike BMP280 (0x58).',
      when: (ctx) => !!facts(ctx).addr && !!i2cTarget(ctx)?.def.idCheck,
      async run(ctx) {
        const t = i2cTarget(ctx);
        const f = facts(ctx);
        const check = t?.def.idCheck;
        if (!t || !check || !f.addr || f.workSda === undefined || f.workScl === undefined) return { status: 'skipped', summary: 'Nothing to read.' };
        const r = await ctx.hw.agent({ cmd: 'i2c_read', sda: f.workSda, scl: f.workScl, addr: f.addr, reg: check.register, len: 1 });
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const v = (r.value.data[0] ?? '').toLowerCase();
        f.idValue = v;
        const src = `measured: i2c_read ${check.register}`;
        if (v === check.expect.toLowerCase()) {
          ctx.log('found', `ID register ${check.register} = ${v}: this is a genuine ${t.def.name.replace(/ breakout$/, '')}.`, { target: `part:${t.inst.id}`, source: src });
          return { status: 'ok', summary: `ID ${v}, as expected.` };
        }
        const known = Object.entries(check.otherValues ?? {}).find(([k]) => k.toLowerCase() === v);
        ctx.log('warning', `ID register ${check.register} = ${v}, expected ${check.expect}.${known ? ' ' + known[1] : ''}`, { target: `part:${t.inst.id}`, source: src });
        return { status: 'warning', summary: known ? known[1] : `Unexpected ID ${v}.` };
      },
      fallbacks: [{ id: 'retry', label: 'Read again', kind: 'retry' }, { id: 'skip', label: 'Skip', kind: 'skip' }],
    },
    {
      id: 'result',
      type: 'result',
      title: 'What we found',
      async run(ctx) {
        return { status: 'ok', summary: 'Done', result: buildResult(ctx) };
      },
    },
    {
      id: 'static-result',
      type: 'result',
      title: 'Wiring drawing check',
      when: () => false,
      async run(ctx) {
        const findings = checkWiring(ctx.scene(), ctx.board, ctx.parts);
        return {
          status: 'ok',
          summary: 'Done',
          result: {
            title: findings.length ? `${findings.length} problem${findings.length > 1 ? 's' : ''} in your wiring drawing` : 'Your wiring drawing looks fine',
            cause: findings.length
              ? 'These come from the rules for your board and parts, not from measurements. The real wires may differ from the drawing.'
              : 'No rule found a problem in the drawing. To check the real wires, the app needs the diagnostic agent.',
            confidence: 'documented',
            evidence: findings.map((f) => ({ text: `${f.message} ${f.hint}`, source: f.source ?? 'wiring rules', target: f.targets[0], confidence: 'documented' as const })),
            sources: ['ESP32 Series Datasheet', 'Parts library'],
            nextSteps: ['Install the agent to measure the real wires'],
            highlight: findings.flatMap((f) => f.targets),
          },
        };
      },
    },
  ],
};

function buildResult(ctx: FlowContext): ResultData {
  const t = i2cTarget(ctx);
  const f = facts(ctx);
  const name = t?.def.name ?? 'The sensor';
  const scene = ctx.scene();
  const sdaW = t ? wireFor(scene, t.inst.id, 'SDA') : undefined;
  const sclW = t ? wireFor(scene, t.inst.id, 'SCL') : undefined;
  const busTargets: TargetRef[] = [
    ...(sdaW ? [`wire:${sdaW.id}` as TargetRef] : []),
    ...(sclW ? [`wire:${sclW.id}` as TargetRef] : []),
    ...(t ? [`pin:${t.sdaPin}` as TargetRef, `pin:${t.sclPin}` as TargetRef] : []),
  ];
  const ev: Evidence[] = [];
  if (f.pullups && t) {
    ev.push({
      text: `Pull-ups: ${t.sdaPin} ${f.pullups.sda ? 'yes' : 'no'}, ${t.sclPin} ${f.pullups.scl ? 'yes' : 'no'}`,
      source: 'measured: pullup_check',
      confidence: 'measured',
      target: `pin:${t.sdaPin}`,
    });
  }
  if (f.scanWired && t) {
    ev.push({
      text: `Scan with SDA = ${t.sdaPin}, SCL = ${t.sclPin}: ${f.scanWired.length ? f.scanWired.join(', ') : 'no answer'}`,
      source: 'measured: i2c_scan',
      confidence: 'measured',
    });
  }
  if (f.scanSwapped && t) {
    ev.push({
      text: `Scan with SDA = ${t.sclPin}, SCL = ${t.sdaPin} (exchanged): ${f.scanSwapped.length ? f.scanSwapped.join(', ') : 'no answer'}`,
      source: 'measured: i2c_scan',
      confidence: 'measured',
    });
  }
  if (f.idValue && t?.def.idCheck) {
    ev.push({ text: `ID register ${t.def.idCheck.register} = ${f.idValue} (expected ${t.def.idCheck.expect})`, source: 'measured: i2c_read', confidence: 'measured' });
  }
  const libSources = t ? t.def.sources.map((s) => `${s.title}, ${s.section ?? ''}`.trim()) : [];

  if (f.crossed && t) {
    return {
      title: 'SDA and SCL are crossed',
      cause: `${name} answers only when SDA and SCL are exchanged. The wire from ${t.sdaPin} goes to the sensor’s SCL pin and the wire from ${t.sclPin} goes to its SDA pin.`,
      confidence: 'measured',
      evidence: ev,
      sources: ['Swap test (this session)', ...libSources],
      nextSteps: [
        `Swap the two wires at the sensor: ${t.sdaPin} → SDA, ${t.sclPin} → SCL.`,
        `Or keep the wires and change your code to Wire.begin(${f.workSda}, ${f.workScl}).`,
        'Then run the checks again to confirm.',
      ],
      highlight: busTargets,
    };
  }
  if (f.idValue && t?.def.idCheck && f.idValue !== t.def.idCheck.expect.toLowerCase()) {
    const known = Object.entries(t.def.idCheck.otherValues ?? {}).find(([k]) => k.toLowerCase() === f.idValue);
    return {
      title: known ? 'This is a different chip' : 'Unexpected chip ID',
      cause: known ? known[1] : `The sensor answers, but its ID ${f.idValue} is not the expected ${t.def.idCheck.expect}.`,
      confidence: 'measured',
      evidence: ev,
      sources: libSources,
      nextSteps: known
        ? ['Use a BMP280 library (for example Adafruit BMP280), which reads temperature and pressure.', 'For humidity, buy a genuine BME280 (ID 0x60).']
        : ['Check the model printed on the chip and pick the matching part.'],
      highlight: t ? [`part:${t.inst.id}`] : [],
    };
  }
  if (f.addr && t) {
    return {
      title: 'The sensor answers correctly',
      cause: `${name} answers at ${f.addr} on ${t.sdaPin}/${t.sclPin}${f.idValue ? ` and its ID is correct` : ''}. The wiring works, so the problem is most likely in the code.`,
      confidence: 'measured',
      evidence: ev,
      sources: libSources,
      nextSteps: [
        `Make sure the code uses address ${f.addr} (many libraries default to 0x77).`,
        `Make sure the code calls Wire.begin(${f.workSda}, ${f.workScl}) or uses the defaults.`,
        'Open Monitor to see what your program prints.',
      ],
      highlight: busTargets,
    };
  }
  const noPull = f.pullups && !f.pullups.sda && !f.pullups.scl;
  return {
    title: noPull ? 'The sensor seems to have no power' : 'The sensor does not answer',
    cause: noPull
      ? 'Neither I2C line is pulled up and nothing answers, even with the lines exchanged. That usually means the sensor has no power or no ground. This is a suggestion: check the VIN and GND wires first.'
      : 'Nothing answers on the bus, even with the lines exchanged. Check the wires one by one. This is a suggestion based on the measurements above.',
    confidence: 'suggestion',
    evidence: ev,
    sources: libSources,
    nextSteps: ['Check that VIN goes to 3V3 and GND goes to GND.', 'Press each wire firmly into the breadboard.', 'Run the checks again.'],
    highlight: t ? [`part:${t.inst.id}`, ...busTargets] : busTargets,
  };
}
