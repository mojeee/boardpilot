import type { FlowDef } from '@shared/flow';
import { t } from '@shared/i18n';
import { ensureBoardStep, fmtErr } from './common';

export const flashFirmware: FlowDef = {
  id: 'flash-firmware',
  title: 'Flash firmware',
  description: 'Write a firmware file to the board, after a backup, and check that it starts.',
  steps: [
    ensureBoardStep(),
    {
      id: 'file',
      type: 'input',
      title: 'Choose the firmware file',
      body: (ctx) =>
        ctx.board.toolchain.flasher === 'esptool'
          ? 'Pick the .bin file your build produced (Arduino: Sketch → Export Compiled Binary). A single app image is written at 0x10000; a “merged” image at 0x0.'
          : t('Pick the .{ext} file your build produced (Arduino: Sketch → Export Compiled Binary).', { ext: ctx.board.toolchain.imageFormat }),
      inputs: ['firmware'],
      async run(ctx, answer) {
        if (answer?.kind !== 'input' || !answer.value) return { status: 'failed', summary: 'No file chosen.' };
        ctx.data.file = answer.value;
        return { status: 'ok', summary: answer.value.split('/').pop() ?? answer.value };
      },
      fallbacks: [{ id: 'retry', label: 'Choose again', kind: 'retry' }],
    },
    {
      id: 'preflight',
      type: 'auto',
      title: 'Check the file before writing',
      body: 'The app reads the file and checks that it is made for this board: format, chip and size. Nothing is written yet.',
      async run(ctx) {
        const r = await ctx.hw.preflight(String(ctx.data.file));
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const src = 'pre-flight: the file’s own header';
        for (const it of r.value.items)
          ctx.log(it.severity === 'blocker' ? 'failed' : it.severity === 'warning' ? 'warning' : 'check', it.text, { source: src });
        const blockers = r.value.items.filter((i) => i.severity === 'blocker');
        const warnings = r.value.items.filter((i) => i.severity === 'warning');
        if (blockers.length) return { status: 'failed', summary: t('Not written: {why}', { why: blockers[0].text }) };
        if (warnings.length) return { status: 'warning', summary: warnings[0].text };
        return { status: 'ok', summary: t('The file matches this board.') };
      },
      aiHelp: (ctx) =>
        t('The pre-flight check reads the firmware file’s header. If it says the file is for another chip, pick the right board in your build tool (Arduino: Tools → Board: {board}) and export again.', {
          board: ctx.board.name,
        }),
      fallbacks: [
        { id: 'other-file', label: 'Choose another file', kind: 'goto', goto: 'file' },
        { id: 'retry', label: 'Check again', kind: 'retry' },
      ],
    },
    {
      id: 'confirm',
      type: 'confirm',
      title: 'Write to the board?',
      body: (ctx) =>
        ctx.data.file
          ? t('This writes {file} to your board.', { file: String(ctx.data.file).split('/').pop() ?? '' })
          : t('This writes the file to your board.'),
      confirm: {
        write: 'flash_user',
        details: [
          'If this board has no backup yet, the app first saves a full copy of its flash on this computer. Boards that cannot be read back (Teensy) are not backed up.',
          'Then the new firmware is written. The board restarts afterwards.',
          '“Restore my firmware” can put the old program back.',
        ],
      },
      async run(ctx, answer) {
        if (answer?.kind !== 'confirm' || !answer.confirmed || !answer.token) return { status: 'failed', summary: 'Cancelled. Nothing was written.' };
        const r = await ctx.hw.flashUser(answer.token, String(ctx.data.file));
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        const kb = Math.round(r.value.bytes / 1024);
        ctx.log('found', t('Wrote {kb} KB.', { kb }), { source: `measured: ${ctx.board.toolchain.flasher} write` });
        return { status: 'ok', summary: t('Written ({kb} KB).', { kb }) };
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
        if (crash) return { status: 'warning', summary: t('The board printed: “{text}”', { text: crash.trim().slice(0, 80) }) };
        return r.value.length
          ? { status: 'ok', summary: t('It runs and prints ({n} lines).', { n: r.value.length }) }
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
            cause: lines.length ? t('The file was written and the board prints output.') : 'The file was written.',
            confidence: 'measured',
            evidence: [
              { text: t('File: {file}', { file: String(ctx.data.file) }), source: 'user', confidence: 'measured' },
              ...lines
                .slice(0, 3)
                .map((l) => ({ text: t('Board printed: {text}', { text: l.slice(0, 100) }), source: 'measured: serial capture', confidence: 'measured' as const })),
            ],
            sources: [`${ctx.board.toolchain.flasher} write`],
            nextSteps: ['Open Monitor to watch it run.'],
            highlight: [],
          },
        };
      },
    },
  ],
};
