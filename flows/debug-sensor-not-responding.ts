import type { Evidence, FlowDef, FlowContext, ResultData } from '@shared/flow';
import type { TargetRef } from '@shared/types';
import { PARTS, pinById, wireFor } from '@shared/board';
import { checkWiring } from '@shared/wiring';
import { t } from '@shared/i18n';
import { ensureBoardStep, fmtErr, i2cTarget, i2cTargets, installAgentSteps } from './common';

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
        const tg = i2cTarget(ctx);
        if (!tg) return { status: 'warning', summary: 'No I2C sensor in your project yet. Tell the app which one.' };
        ctx.data.partInstance = tg.inst.id;
        ctx.log('found', t('From your project: {part} with SDA on {sda} and SCL on {scl}.', { part: tg.def.name, sda: tg.sdaPin, scl: tg.sclPin }), {
          target: `part:${tg.inst.id}`,
          source: 'project scene',
        });
        return { status: 'ok', summary: t('{part}, SDA {sda}, SCL {scl}.', { part: tg.def.name, sda: tg.sdaPin, scl: tg.sclPin }) };
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
          return {
            status: 'failed',
            summary: t('“{name}” is not an I2C sensor in the parts library yet. Pick one from the list, or ask the assistant.', { name: answer.value }),
          };
        }
        const id = `${partId.split('-')[0]}1`;
        const { sda, scl } = ctx.board.rules.i2c;
        const sdaLabel = pinById(ctx.board, sda)?.label ?? sda;
        const sclLabel = pinById(ctx.board, scl)?.label ?? scl;
        ctx.updateScene((s) => ({
          ...s,
          parts: [...s.parts.filter((p) => p.id !== id), { id, partId, position: [12, 0, ctx.board.pcbMm.width / 2 + 30], label: PARTS[partId].name, confirmed: true }],
          wires: [
            ...s.wires.filter((w) => w.to.part !== id),
            { id: `${id}-sda`, from: { part: 'board', pin: sda }, to: { part: id, pin: 'SDA' }, color: '#3FB6E8' },
            { id: `${id}-scl`, from: { part: 'board', pin: scl }, to: { part: id, pin: 'SCL' }, color: '#9ADCF7' },
          ],
        }));
        ctx.data.partInstance = id;
        ctx.log('info', t('Assuming the default pins: SDA on {sda}, SCL on {scl}. Change the wires in the 3D view if yours differ.', { sda: sdaLabel, scl: sclLabel }), {
          source: 'suggestion (default Arduino pins)',
        });
        return { status: 'ok', summary: t('{part}, on the default pins {sda} and {scl}.', { part: PARTS[partId].name, sda: sdaLabel, scl: sclLabel }) };
      },
      fallbacks: [{ id: 'retry', label: 'Try again', kind: 'retry' }],
    },
    ...installAgentSteps(),
    {
      id: 'pullups',
      type: 'auto',
      title: 'Check power and pull-ups',
      body: 'I2C lines need pull-up resistors. Most breakouts have them, powered by the sensor’s VIN. No pull-up usually means no power.',
      highlight: (ctx) => i2cTargets(ctx),
      async run(ctx) {
        const tg = i2cTarget(ctx);
        if (!tg) return { status: 'failed', summary: 'No sensor selected.' };
        const r = await ctx.hw.agent({ cmd: 'pullup_check', pins: [tg.sda, tg.scl] });
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const sda = !!r.value.external[String(tg.sda)];
        const scl = !!r.value.external[String(tg.scl)];
        facts(ctx).pullups = { sda, scl };
        const pullText = (pin: string, up: boolean) =>
          up ? t('{pin}: pulled up (HIGH with nothing driving it)', { pin }) : t('{pin}: no pull-up (LOW)', { pin });
        ctx.log(sda ? 'check' : 'warning', pullText(tg.sdaPin, sda), {
          target: `pin:${tg.sdaPin}`,
          source: 'measured: pullup_check',
        });
        ctx.log(scl ? 'check' : 'warning', pullText(tg.sclPin, scl), {
          target: `pin:${tg.sclPin}`,
          source: 'measured: pullup_check',
        });
        if (sda && scl) return { status: 'ok', summary: 'Both lines are pulled up, so the sensor very likely has power.' };
        if (!sda && !scl)
          return { status: 'warning', summary: 'Neither line is pulled up. The sensor may have no power or no ground, or the wires are loose.' };
        return { status: 'warning', summary: t('Only {pin} is pulled up. One of the two wires may be loose.', { pin: sda ? tg.sdaPin : tg.sclPin }) };
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
        const tg = i2cTarget(ctx);
        if (!tg) return { status: 'failed', summary: 'No sensor selected.' };
        const r = await ctx.hw.agent({ cmd: 'i2c_scan', sda: tg.sda, scl: tg.scl, hz: 100000 });
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const f = facts(ctx);
        f.scanWired = r.value.found;
        const expected = tg.def.addresses ?? [];
        const hit = r.value.found.find((a) => expected.some((e) => e.toLowerCase() === a.toLowerCase()));
        const scanMsg = r.value.found.length
          ? t('Devices answering: {list}', { list: r.value.found.join(', ') })
          : t('No device answered with SDA = {sda}, SCL = {scl}.', { sda: tg.sdaPin, scl: tg.sclPin });
        ctx.log(r.value.found.length ? 'found' : 'warning', scanMsg, {
          target: `part:${tg.inst.id}`,
          source: 'measured: i2c_scan',
        });
        if (hit) {
          f.addr = hit;
          f.workSda = tg.sda;
          f.workScl = tg.scl;
          return { status: 'ok', summary: t('{part} answers at {addr}.', { part: tg.def.name, addr: hit }) };
        }
        if (r.value.found.length) {
          return {
            status: 'warning',
            summary: t('Something answers at {found}, but not at the {part} addresses {expected}.', {
              found: r.value.found.join(', '),
              part: tg.def.name,
              expected: expected.join(' / '),
            }),
          };
        }
        return { status: 'warning', summary: 'Nothing answered. Next: try with SDA and SCL exchanged.' };
      },
      fallbacks: [{ id: 'retry', label: 'Scan again', kind: 'retry' }],
    },
    {
      id: 'swap',
      type: 'auto',
      title: 'Swap test: SDA and SCL exchanged',
      body: 'The diagnostic agent can run I2C on any two pins, so the app scans again with the two lines exchanged. If the sensor answers only now, the wires are crossed.',
      when: (ctx) => !facts(ctx).addr,
      highlight: (ctx) => i2cTargets(ctx),
      async run(ctx) {
        const tg = i2cTarget(ctx);
        if (!tg) return { status: 'failed', summary: 'No sensor selected.' };
        const r = await ctx.hw.agent({ cmd: 'i2c_scan', sda: tg.scl, scl: tg.sda, hz: 100000 });
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const f = facts(ctx);
        f.scanSwapped = r.value.found;
        const expected = tg.def.addresses ?? [];
        const hit = r.value.found.find((a) => expected.some((e) => e.toLowerCase() === a.toLowerCase()));
        if (hit) {
          f.crossed = true;
          f.addr = hit;
          f.workSda = tg.scl;
          f.workScl = tg.sda;
          const scene = ctx.scene();
          const sdaW = wireFor(scene, tg.inst.id, 'SDA');
          ctx.log('found', t('{part} answers at {addr} only with SDA and SCL exchanged: the wires are crossed.', { part: tg.def.name, addr: hit }), {
            target: sdaW ? `wire:${sdaW.id}` : `pin:${tg.sdaPin}`,
            source: 'measured: i2c_scan (swapped)',
          });
          return { status: 'warning', summary: t('Found at {addr} with the lines exchanged. SDA and SCL are crossed.', { addr: hit }) };
        }
        ctx.log('warning', t('No answer with the lines exchanged either.'), { source: 'measured: i2c_scan (swapped)' });
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
        const tg = i2cTarget(ctx);
        const f = facts(ctx);
        const check = tg?.def.idCheck;
        if (!tg || !check || !f.addr || f.workSda === undefined || f.workScl === undefined) return { status: 'skipped', summary: 'Nothing to read.' };
        const r = await ctx.hw.agent({ cmd: 'i2c_read', sda: f.workSda, scl: f.workScl, addr: f.addr, reg: check.register, len: 1 });
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const v = (r.value.data[0] ?? '').toLowerCase();
        f.idValue = v;
        const src = `measured: i2c_read ${check.register}`;
        if (v === check.expect.toLowerCase()) {
          ctx.log('found', t('ID register {reg} = {value}: this is a genuine {part}.', { reg: check.register, value: v, part: tg.def.name.replace(/ breakout$/, '') }), {
            target: `part:${tg.inst.id}`,
            source: src,
          });
          return { status: 'ok', summary: t('ID {value}, as expected.', { value: v }) };
        }
        const known = Object.entries(check.otherValues ?? {}).find(([k]) => k.toLowerCase() === v);
        const idMsg = t('ID register {reg} = {value}, expected {expect}.', { reg: check.register, value: v, expect: check.expect });
        ctx.log('warning', known ? `${idMsg} ${known[1]}` : idMsg, { target: `part:${tg.inst.id}`, source: src });
        return { status: 'warning', summary: known ? known[1] : t('Unexpected ID {value}.', { value: v }) };
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
            title:
              findings.length === 1
                ? t('1 problem in your wiring drawing')
                : findings.length
                  ? t('{n} problems in your wiring drawing', { n: findings.length })
                  : 'Your wiring drawing looks fine',
            cause: findings.length
              ? 'These come from the rules for your board and parts, not from measurements. The real wires may differ from the drawing.'
              : 'No rule found a problem in the drawing. To check the real wires, the app needs the diagnostic agent.',
            confidence: 'documented',
            evidence: findings.map((f) => ({ text: `${f.message} ${f.hint}`, source: f.source ?? 'wiring rules', target: f.targets[0], confidence: 'documented' as const })),
            sources: [ctx.board.rules.datasheet, t('Parts library')],
            nextSteps: ['Install the agent to measure the real wires'],
            highlight: findings.flatMap((f) => f.targets),
          },
        };
      },
    },
  ],
};

function buildResult(ctx: FlowContext): ResultData {
  const tg = i2cTarget(ctx);
  const f = facts(ctx);
  const name = tg?.def.name ?? t('The sensor');
  const scene = ctx.scene();
  const sdaW = tg ? wireFor(scene, tg.inst.id, 'SDA') : undefined;
  const sclW = tg ? wireFor(scene, tg.inst.id, 'SCL') : undefined;
  const busTargets: TargetRef[] = [
    ...(sdaW ? [`wire:${sdaW.id}` as TargetRef] : []),
    ...(sclW ? [`wire:${sclW.id}` as TargetRef] : []),
    ...(tg ? [`pin:${tg.sdaPin}` as TargetRef, `pin:${tg.sclPin}` as TargetRef] : []),
  ];
  const ev: Evidence[] = [];
  if (f.pullups && tg) {
    ev.push({
      text: t('Pull-ups: {sda} {sdaOk}, {scl} {sclOk}', {
        sda: tg.sdaPin,
        sdaOk: f.pullups.sda ? t('yes') : t('no'),
        scl: tg.sclPin,
        sclOk: f.pullups.scl ? t('yes') : t('no'),
      }),
      source: 'measured: pullup_check',
      confidence: 'measured',
      target: `pin:${tg.sdaPin}`,
    });
  }
  if (f.scanWired && tg) {
    ev.push({
      text: t('Scan with SDA = {sda}, SCL = {scl}: {found}', {
        sda: tg.sdaPin,
        scl: tg.sclPin,
        found: f.scanWired.length ? f.scanWired.join(', ') : t('no answer'),
      }),
      source: 'measured: i2c_scan',
      confidence: 'measured',
    });
  }
  if (f.scanSwapped && tg) {
    ev.push({
      text: t('Scan with SDA = {sda}, SCL = {scl} (exchanged): {found}', {
        sda: tg.sclPin,
        scl: tg.sdaPin,
        found: f.scanSwapped.length ? f.scanSwapped.join(', ') : t('no answer'),
      }),
      source: 'measured: i2c_scan',
      confidence: 'measured',
    });
  }
  if (f.idValue && tg?.def.idCheck) {
    ev.push({
      text: t('ID register {reg} = {value} (expected {expect})', { reg: tg.def.idCheck.register, value: f.idValue, expect: tg.def.idCheck.expect }),
      source: 'measured: i2c_read',
      confidence: 'measured',
    });
  }
  const libSources = tg ? tg.def.sources.map((s) => `${s.title}, ${s.section ?? ''}`.trim()) : [];

  if (f.crossed && tg) {
    return {
      title: 'SDA and SCL are crossed',
      cause: t(
        '{part} answers only when SDA and SCL are exchanged. The wire from {sda} goes to the sensor’s SCL pin and the wire from {scl} goes to its SDA pin.',
        { part: name, sda: tg.sdaPin, scl: tg.sclPin },
      ),
      confidence: 'measured',
      evidence: ev,
      sources: [t('Swap test (this session)'), ...libSources],
      nextSteps: [
        t('Swap the two wires at the sensor: {sda} → SDA, {scl} → SCL.', { sda: tg.sdaPin, scl: tg.sclPin }),
        t('Or keep the wires and change your code to Wire.begin({a}, {b}).', { a: String(f.workSda), b: String(f.workScl) }),
        'Then run the checks again to confirm.',
      ],
      highlight: busTargets,
    };
  }
  if (f.idValue && tg?.def.idCheck && f.idValue !== tg.def.idCheck.expect.toLowerCase()) {
    const known = Object.entries(tg.def.idCheck.otherValues ?? {}).find(([k]) => k.toLowerCase() === f.idValue);
    return {
      title: known ? 'This is a different chip' : 'Unexpected chip ID',
      cause: known ? known[1] : t('The sensor answers, but its ID {value} is not the expected {expect}.', { value: f.idValue, expect: tg.def.idCheck.expect }),
      confidence: 'measured',
      evidence: ev,
      sources: libSources,
      nextSteps: known
        ? ['Use a BMP280 library (for example Adafruit BMP280), which reads temperature and pressure.', 'For humidity, buy a genuine BME280 (ID 0x60).']
        : ['Check the model printed on the chip and pick the matching part.'],
      highlight: tg ? [`part:${tg.inst.id}`] : [],
    };
  }
  if (f.addr && tg) {
    return {
      title: 'The sensor answers correctly',
      cause: f.idValue
        ? t('{part} answers at {addr} on {sda}/{scl} and its ID is correct. The wiring works, so the problem is most likely in the code.', {
            part: name,
            addr: f.addr,
            sda: tg.sdaPin,
            scl: tg.sclPin,
          })
        : t('{part} answers at {addr} on {sda}/{scl}. The wiring works, so the problem is most likely in the code.', {
            part: name,
            addr: f.addr,
            sda: tg.sdaPin,
            scl: tg.sclPin,
          }),
      confidence: 'measured',
      evidence: ev,
      sources: libSources,
      nextSteps: [
        t('Make sure the code uses address {addr} (many libraries default to 0x77).', { addr: f.addr }),
        t('Make sure the code calls Wire.begin({a}, {b}) or uses the defaults.', { a: String(f.workSda), b: String(f.workScl) }),
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
    highlight: tg ? [`part:${tg.inst.id}`, ...busTargets] : busTargets,
  };
}
