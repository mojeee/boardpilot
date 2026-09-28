import type { FlowDef } from '@shared/flow';
import { ensureBoardStep, fmtErr } from './common';

export const flashFirmware: FlowDef = {
  id: 'flash-firmware',
  title: 'Flash firmware',
  description: 'Write a .bin file to the board, after a backup, and check that it starts.',
  steps: [
    ensureBoardStep(),
    {
      id: 'file',
      type: 'input',
      title: 'Choose the firmware file',
      body: 'Pick the .bin file your build produced (Arduino: Sketch → Export Compiled Binary). A single app image is written at 0x10000; a “merged” image at 0x0.',
      inputs: ['firmware'],
      async run(ctx, answer) {
        if (answer?.kind !== 'input' || !answer.value) return { status: 'failed', summary: 'No file chosen.' };
        ctx.data.file = answer.value;
        return { status: 'ok', summary: answer.value.split('/').pop() ?? answer.value };
      },
      fallbacks: [{ id: 'retry', label: 'Choose again', kind: 'retry' }],
    },
    {
      id: 'confirm',
      type: 'confirm',
      title: 'Write to the board?',
      body: (ctx) => `This writes ${String(ctx.data.file ?? 'the file').split('/').pop()} to your board.`,
      confirm: {
        write: 'flash_user',
        details: [
          'If this board has no backup yet, the app first saves a full copy of its flash on this Mac.',
          'Then the new firmware is written. The board restarts afterwards.',
          '“Restore my firmware” can put the old program back.',
        ],
      },
      async run(ctx, answer) {
        if (answer?.kind !== 'confirm' || !answer.confirmed || !answer.token) return { status: 'failed', summary: 'Cancelled. Nothing was written.' };
        const r = await ctx.hw.flashUser(answer.token, String(ctx.data.file));
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        ctx.log('found', `Wrote ${Math.round(r.value.bytes / 1024)} KB.`, { source: 'measured: esptool write-flash' });
        return { status: 'ok', summary: `Written (${Math.round(r.value.bytes / 1024)} KB).` };
      },
      fallbacks: [{ id: 'retry', label: 'Show the confirmation again', kind: 'retry' }],
    },
    {
      id: 'verify',
      type: 'auto',
      title: 'Check that it starts',
      body: 'The app listens for 4 seconds to see whether the new program prints anything.',
      async run(ctx) {
        const r = await ctx.hw.captureSerial(115200, 4000);
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        ctx.data.lines = r.value;
        const crash = r.value.find((l) => /Guru Meditation|Brownout|invalid header|flash read err/i.test(l));
        if (crash) return { status: 'warning', summary: `The board printed: “${crash.trim().slice(0, 80)}”` };
        return r.value.length
          ? { status: 'ok', summary: `It runs and prints (${r.value.length} lines).` }
          : { status: 'warning', summary: 'It printed nothing at 115200. That is fine if your program does not use Serial.' };
      },
    },
    {
      id: 'result',
      type: 'result',
      title: 'Result',
      async run(ctx) {
        const lines = (ctx.data.lines as string[] | undefined) ?? [];
        return {
          status: 'ok',
          summary: 'Done',
          result: {
            title: 'Firmware written',
            cause: `The file was written${lines.length ? ' and the board prints output' : ''}.`,
            confidence: 'measured',
            evidence: [
              { text: `File: ${String(ctx.data.file)}`, source: 'user', confidence: 'measured' },
              ...lines.slice(0, 3).map((l) => ({ text: `Board printed: ${l.slice(0, 100)}`, source: 'measured: serial capture', confidence: 'measured' as const })),
            ],
            sources: ['esptool write-flash'],
            nextSteps: ['Open Monitor to watch it run.'],
            highlight: [],
          },
        };
      },
    },
  ],
};
