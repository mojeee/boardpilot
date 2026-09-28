import type { FlowDef } from '@shared/flow';
import { fmtErr, pickPort } from './common';

export const debugBoardNotDetected: FlowDef = {
  id: 'debug-board-not-detected',
  title: 'Debug: board not detected',
  description: 'Finds out why the Mac does not see the board, one likely cause at a time.',
  steps: [
    {
      id: 'find-port',
      type: 'auto',
      title: 'Look for boards on USB',
      async run(ctx) {
        const r = await ctx.hw.listPorts();
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const p = pickPort(r.value);
        ctx.data.ports = r.value;
        if (p) {
          ctx.data.port = p.path;
          ctx.log('found', `A board is visible on ${p.path} (USB chip ${p.bridge}).`, { source: 'measured: USB port list' });
          return { status: 'ok', summary: `The Mac sees a board on ${p.path}.`, goto: 'identify' };
        }
        ctx.log('warning', 'No USB serial port that looks like an ESP32.', { source: 'measured: USB port list' });
        return { status: 'warning', summary: 'No board on USB.' };
      },
    },
    {
      id: 'light',
      type: 'question',
      title: 'Is a light on the board on?',
      body: 'Most ESP32 boards have a small red power LED next to the USB port.',
      options: [
        { id: 'yes', label: 'Yes, a light is on' },
        { id: 'no', label: 'No light at all' },
        { id: 'unsure', label: 'I can’t tell' },
      ],
    },
    {
      id: 'cable',
      type: 'action',
      title: 'Try another cable',
      body: (ctx) =>
        ctx.answers.light?.kind === 'option' && ctx.answers.light.optionId === 'no'
          ? 'No light means no power reaches the board. Try another USB cable and another USB port on the Mac, then press Done.'
          : 'The board has power but no data connection. The most common reason is a charge-only cable. Try a cable you know works for data (for example one that syncs a phone), then press Done.',
      async run(ctx) {
        const r = await ctx.hw.listPorts();
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const p = pickPort(r.value);
        if (p) {
          ctx.data.port = p.path;
          ctx.data.fixedBy = 'cable';
          ctx.log('found', `The board appeared on ${p.path} after changing the cable.`, { source: 'measured: USB port list' });
          return { status: 'ok', summary: 'The board appeared.', goto: 'identify' };
        }
        return { status: 'warning', summary: 'Still nothing.' };
      },
    },
    {
      id: 'driver',
      type: 'action',
      title: 'Install the USB driver',
      body:
        'Look at the small chip next to the USB port.\n• “CP2102” or “CP2104”: install the Silicon Labs CP210x VCP driver (silabs.com).\n• “CH340” or “CH9102”: install the WCH CH34x driver (wch-ic.com).\nAfter installing, open System Settings → Privacy & Security and allow the driver. Replug the board and press Done.',
      async run(ctx) {
        const r = await ctx.hw.listPorts();
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const p = pickPort(r.value);
        if (p) {
          ctx.data.port = p.path;
          ctx.data.fixedBy = 'driver';
          return { status: 'ok', summary: 'The board appeared.', goto: 'identify' };
        }
        return { status: 'failed', summary: 'Still no board. Ask the assistant, or try the board on another computer to see if the board itself is faulty.' };
      },
      aiHelp: () => 'My ESP32 still does not show up on macOS after trying another cable and installing the driver. What else can cause this?',
      fallbacks: [{ id: 'retry', label: 'Check again', kind: 'retry' }],
    },
    {
      id: 'identify',
      type: 'auto',
      title: 'Talk to the chip',
      when: (ctx) => !!ctx.data.port,
      async run(ctx) {
        const r = await ctx.hw.identify(ctx.data.port as string);
        if (!r.ok) {
          ctx.data.identifyError = r.error;
          return { status: 'failed', summary: fmtErr(r.error) };
        }
        ctx.log('found', `Chip ${r.value.chip}, flash ${r.value.flashSize}, MAC ${r.value.mac}.`, { source: 'measured: esptool' });
        return { status: 'ok', summary: `${r.value.chip} answers.` };
      },
      aiHelp: (ctx) => `The port is visible but identifying the ESP32 failed: ${JSON.stringify(ctx.data.identifyError)}. What should I do?`,
      fallbacks: [{ id: 'retry', label: 'Try again', kind: 'retry' }],
    },
    {
      id: 'result',
      type: 'result',
      title: 'Result',
      async run(ctx) {
        const chip = ctx.hw.state().chip;
        const fixedBy = ctx.data.fixedBy as string | undefined;
        return {
          status: 'ok',
          summary: 'Done',
          result: chip
            ? {
                title: 'Your board is detected',
                cause:
                  fixedBy === 'cable'
                    ? 'The board appeared after changing the cable, so the old cable most likely carries power only.'
                    : fixedBy === 'driver'
                      ? 'The board appeared after installing the driver.'
                      : 'The Mac sees the board and the chip answers.',
                confidence: 'measured',
                evidence: [{ text: `${chip.chip} on ${chip.port}, MAC ${chip.mac}`, source: 'measured: esptool', confidence: 'measured' }],
                sources: ['esptool flash-id', 'USB port list'],
                nextSteps: fixedBy === 'cable' ? ['Label or throw away the charge-only cable.'] : ['Continue with the task you wanted to do.'],
                highlight: [],
              }
            : {
                title: 'The board is still not detected',
                cause: 'Neither the cable nor the driver helped. The board, the USB socket or the Mac’s port may be faulty. This is a suggestion.',
                confidence: 'suggestion',
                evidence: [{ text: 'No USB serial port appeared during this session', source: 'measured: USB port list', confidence: 'measured' }],
                sources: [],
                nextSteps: ['Try the board on another computer.', 'Try another board with the same cable.'],
                highlight: [],
              },
        };
      },
    },
  ],
};
