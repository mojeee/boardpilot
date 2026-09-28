import type { FlowDef } from '@shared/flow';
import type { PortInfo } from '@shared/types';
import { fmtErr, pickPort } from './common';

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
  description: 'Find the board on USB and read its chip, flash size and MAC address.',
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
          ctx.log(p.likelyEsp32 ? 'found' : 'info', `Port ${p.path}${p.bridge !== 'unknown' ? ` (USB chip: ${p.bridge})` : ''}`, {
            source: 'measured: USB port list',
          });
        }
        if (!r.value.length) return { status: 'warning', summary: 'No board found on USB.', goto: 'no-port' };
        const auto = pickPort(r.value);
        if (auto) {
          ctx.data.port = auto.path;
          return { status: 'ok', summary: `Found ${auto.path}${auto.bridge !== 'unknown' ? ` with a ${auto.bridge} USB chip` : ''}.`, goto: 'identify' };
        }
        return { status: 'ok', summary: `${r.value.length} ports found. Pick yours.`, goto: 'pick-port' };
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
        const p = pickPort(r.value);
        if (!p) {
          return r.value.length
            ? { status: 'ok', summary: 'A port appeared.', goto: 'pick-port' }
            : { status: 'failed', summary: 'Still no board. Try the next item on the list, or ask the assistant.' };
        }
        ctx.data.port = p.path;
        ctx.log('found', `Board appeared on ${p.path}.`, { source: 'measured: USB port list' });
        return { status: 'ok', summary: `Found ${p.path}.`, goto: 'identify' };
      },
      aiHelp: () => 'The Mac shows no serial port for my ESP32 board. What should I check, in order?',
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
          hint: p.bridge !== 'unknown' ? `USB chip: ${p.bridge}` : p.manufacturer,
        })),
      async run(ctx, answer) {
        if (answer?.kind === 'option') ctx.data.port = answer.optionId;
        if (answer?.kind === 'input') ctx.data.port = answer.value;
        return { status: 'ok', summary: `Using ${String(ctx.data.port)}.`, goto: 'identify' };
      },
    },
    {
      id: 'identify',
      type: 'auto',
      title: 'Read the chip',
      body: 'The app asks the chip for its type, flash size and MAC address. This only reads.',
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
        ctx.log('found', `Chip ${c.chip}${c.revision ? ` (revision ${c.revision})` : ''}`, { source: 'measured: esptool' });
        ctx.log('found', `Flash ${c.flashSize}, MAC ${c.mac}, USB chip ${c.bridge}`, { source: 'measured: esptool' });
        return { status: 'ok', summary: `${c.chip}, ${c.flashSize} flash.`, goto: 'result' };
      },
      aiHelp: (ctx) => `Identifying my ESP32 failed with error code ${String(ctx.data.identifyError)}. What does it mean and what should I do?`,
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
      body: 'Hold the BOOT button. While holding it, press and release EN. Then release BOOT and press Done.',
      when: () => false,
      highlight: () => ['part:board'],
      async run(ctx) {
        const port = ctx.data.port as string;
        const r = await ctx.hw.identify(port);
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        ctx.data.chip = r.value;
        ctx.log('found', `Chip ${r.value.chip}, flash ${r.value.flashSize}, MAC ${r.value.mac}`, { source: 'measured: esptool' });
        return { status: 'ok', summary: `${r.value.chip}, ${r.value.flashSize} flash.`, goto: 'result' };
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
        return {
          status: 'ok',
          summary: 'Identified',
          result: {
            title: `${c.chip} is connected`,
            cause: `Your board answers on ${c.port}. Nothing was written to it.`,
            confidence: 'measured',
            evidence: [
              { text: `Chip: ${c.chip}${c.revision ? `, revision ${c.revision}` : ''}`, source: 'measured: esptool', confidence: 'measured' },
              { text: `Flash size: ${c.flashSize}`, source: 'measured: esptool', confidence: 'measured' },
              { text: `MAC address: ${c.mac}`, source: 'measured: esptool', confidence: 'measured' },
              { text: `USB chip: ${c.bridge}`, source: 'measured: USB vendor id', confidence: 'measured' },
              ...(c.features.length ? [{ text: `Features: ${c.features.join(', ')}`, source: 'measured: esptool', confidence: 'measured' as const }] : []),
            ],
            sources: ['esptool flash-id'],
            nextSteps: ['Test hardware to check your wiring', 'Monitor to see what your program prints', 'Debug a problem if something does not work'],
            highlight: [],
          },
        };
      },
    },
  ],
};
