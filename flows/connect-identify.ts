import type { FlowDef } from '@shared/flow';
import type { PortInfo } from '@shared/types';
import { t } from '@shared/i18n';
import { checkChipBoard, checkPortBoard, fmtErr, pickPort, adoptDetectedBoard } from './common';

const NO_PORT_BODY = [
  'The Mac does not see a board on USB yet. Try these one at a time, then press Done:',
  '1. Use a different USB cable. Many cables only charge and carry no data.',
  '2. Plug straight into the Mac, not through a hub.',
  '3. Look at the small chip next to the USB port. “CP2102” may need the Silicon Labs CP210x driver; “CH340” needs the WCH CH34x driver. After installing, allow it in System Settings → Privacy & Security.',
  '4. Check that a light on the board turns on.',
].join('\n');

export const connectIdentify: FlowDef = {
  id: 'connect-identify',
  title: 'Connect and identify a board',
  description: 'Find the board on USB and read its chip, flash size and ID.',
  steps: [
    {
      id: 'find-port',
      type: 'auto',
      title: 'Look for boards on USB',
      async run(ctx) {
        const r = await ctx.hw.listPorts();
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        ctx.data.ports = r.value;
        for (const p of r.value) {
          const msg = p.bridge !== 'unknown' ? t('Port {port} (USB chip: {chip})', { port: p.path, chip: p.bridge }) : t('Port {port}', { port: p.path });
          ctx.log(p.likelyBoard ? 'found' : 'info', msg, { source: 'measured: USB port list' });
        }
        if (!r.value.length) return { status: 'warning', summary: 'No board found on USB.', goto: 'no-port' };
        const auto = pickPort(r.value, ctx.board.id);
        if (auto) {
          ctx.data.port = auto.path;
          checkPortBoard(ctx, auto);
          const summary =
            auto.bridge !== 'unknown'
              ? t('Found {port} with a {chip} USB chip.', { port: auto.path, chip: auto.bridge })
              : t('Found {port}.', { port: auto.path });
          return { status: 'ok', summary, goto: 'identify' };
        }
        return { status: 'ok', summary: t('{n} ports found. Pick yours.', { n: r.value.length }), goto: 'pick-port' };
      },
      fallbacks: [{ id: 'retry', label: 'Search again', kind: 'retry' }],
    },
    {
      id: 'no-port',
      type: 'action',
      title: 'Help the Mac see the board',
      body: NO_PORT_BODY,
      when: () => false,
      async run(ctx) {
        const r = await ctx.hw.listPorts();
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        ctx.data.ports = r.value;
        const p = pickPort(r.value, ctx.board.id);
        if (!p) {
          return r.value.length
            ? { status: 'ok', summary: 'A port appeared.', goto: 'pick-port' }
            : { status: 'failed', summary: 'Still no board. Try the next item on the list, or ask the assistant.' };
        }
        ctx.data.port = p.path;
        ctx.log('found', t('Board appeared on {port}.', { port: p.path }), { source: 'measured: USB port list' });
        return { status: 'ok', summary: t('Found {port}.', { port: p.path }), goto: 'identify' };
      },
      aiHelp: (ctx) => `The computer shows no serial port for my ${ctx.board.name}. What should I check, in order?`,
      fallbacks: [
        { id: 'retry', label: 'I tried something else, check again', kind: 'retry' },
        { id: 'port', label: 'Pick a port by hand', kind: 'input', input: 'port' },
      ],
    },
    {
      id: 'pick-port',
      type: 'question',
      title: 'Which port is your board?',
      body: 'Several serial ports are present. Ports with a known USB chip are listed first.',
      when: () => false,
      options: (ctx) =>
        ((ctx.data.ports as PortInfo[] | undefined) ?? []).map((p) => ({
          id: p.path,
          label: p.path,
          hint: p.bridge !== 'unknown' ? t('USB chip: {chip}', { chip: p.bridge }) : p.manufacturer,
        })),
      async run(ctx, answer) {
        if (answer?.kind === 'option') ctx.data.port = answer.optionId;
        if (answer?.kind === 'input') ctx.data.port = answer.value;
        return { status: 'ok', summary: t('Using {port}.', { port: String(ctx.data.port) }), goto: 'identify' };
      },
    },
    {
      id: 'identify',
      type: 'auto',
      title: 'Read the chip',
      body: 'The app asks the chip for its type, flash size and ID. This only reads.',
      async run(ctx) {
        const port = ctx.data.port as string | undefined;
        if (!port) return { status: 'failed', summary: 'No port selected.' };
        const r = await ctx.hw.identify(port);
        if (!r.ok) {
          ctx.data.identifyError = r.error.code;
          return { status: 'failed', summary: fmtErr(r.error) };
        }
        const c = r.value;
        ctx.data.chip = c;
        const src = `measured: ${c.toolVersion ?? 'chip tool'}`;
        ctx.log('found', c.revision ? t('Chip {chip} (revision {rev})', { chip: c.chip, rev: c.revision }) : t('Chip {chip}', { chip: c.chip }), { source: src });
        ctx.log('found', t('Flash {flash}, ID {mac}, USB chip {chip}', { flash: c.flashSize, mac: c.mac, chip: c.bridge }), { source: src });
        if (!(await adoptDetectedBoard(ctx, c.chip))) checkChipBoard(ctx, c.chip);
        return { status: 'ok', summary: t('{chip}, {flash} flash.', { chip: c.chip, flash: c.flashSize }), goto: 'result' };
      },
      aiHelp: (ctx) => `Identifying my ${ctx.board.name} failed with error code ${String(ctx.data.identifyError)}. What does it mean and what should I do?`,
      fallbacks: [
        { id: 'retry', label: 'Try again', kind: 'retry' },
        { id: 'boot', label: 'Use the BOOT button trick', kind: 'goto', goto: 'boot-button' },
        { id: 'port', label: 'Pick another port', kind: 'goto', goto: 'pick-port' },
      ],
    },
    {
      id: 'boot-button',
      type: 'action',
      title: 'Put the board in download mode',
      body: (ctx) => ctx.board.toolchain.uploadNote ?? 'Hold the BOOT button. While holding it, press and release EN. Then release BOOT and press Done.',
      when: () => false,
      highlight: () => ['part:board'],
      async run(ctx) {
        const port = ctx.data.port as string;
        const r = await ctx.hw.identify(port);
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        ctx.data.chip = r.value;
        ctx.log('found', t('Chip {chip}, flash {flash}, ID {mac}', { chip: r.value.chip, flash: r.value.flashSize, mac: r.value.mac }), {
          source: `measured: ${r.value.toolVersion ?? 'chip tool'}`,
        });
        if (!(await adoptDetectedBoard(ctx, r.value.chip))) checkChipBoard(ctx, r.value.chip);
        return { status: 'ok', summary: t('{chip}, {flash} flash.', { chip: r.value.chip, flash: r.value.flashSize }), goto: 'result' };
      },
      fallbacks: [{ id: 'retry', label: 'Try again', kind: 'retry' }],
    },
    {
      id: 'result',
      type: 'result',
      title: 'Your board',
      async run(ctx) {
        const c = ctx.hw.state().chip;
        if (!c) return { status: 'failed', summary: 'No board identified.' };
        const esp = ctx.board.toolchain.flasher === 'esptool';
        const src = `measured: ${c.toolVersion ?? ctx.board.toolchain.flasher}`;
        return {
          status: 'ok',
          summary: 'Identified',
          result: {
            title: t('{chip} is connected', { chip: c.chip }),
            cause: t('Your board answers on {port}. Nothing was written to it.', { port: c.port }),
            confidence: 'measured',
            evidence: [
              {
                text: c.revision ? t('Chip: {chip}, revision {rev}', { chip: c.chip, rev: c.revision }) : t('Chip: {chip}', { chip: c.chip }),
                source: src,
                confidence: 'measured',
              },
              {
                text: t('Flash size: {flash}', { flash: c.flashSize }),
                source: esp ? src : `library: ${ctx.board.id}`,
                confidence: esp ? 'measured' : 'documented',
              },
              { text: esp ? t('MAC address: {mac}', { mac: c.mac }) : t('Board ID: {id}', { id: c.mac }), source: src, confidence: 'measured' },
              { text: t('USB chip: {chip}', { chip: c.bridge }), source: 'measured: USB vendor id', confidence: 'measured' },
              ...(c.features.length
                ? [
                    {
                      text: t('Features: {list}', { list: c.features.join(', ') }),
                      source: esp ? src : `library: ${ctx.board.id}`,
                      confidence: esp ? ('measured' as const) : ('documented' as const),
                    },
                  ]
                : []),
            ],
            sources: [c.toolVersion ?? ctx.board.toolchain.flasher, `library: ${ctx.board.id}`],
            nextSteps: ['Test hardware to check your wiring', 'Monitor to see what your program prints', 'Debug a problem if something does not work'],
            highlight: [],
          },
        };
      },
    },
  ],
};
