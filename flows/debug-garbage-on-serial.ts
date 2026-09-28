import type { Evidence, FlowDef } from '@shared/flow';
import { printableRatio } from '@shared/probe';
import { t } from '@shared/i18n';
import { ensureBoardStep, fmtErr } from './common';

const BAUDS = [115200, 9600, 57600, 74880, 230400, 38400, 19200];

export const debugGarbageOnSerial: FlowDef = {
  id: 'debug-garbage-on-serial',
  title: 'Debug: garbage on serial',
  description: 'Tries the common serial speeds and finds the one your program uses.',
  steps: [
    ensureBoardStep(),
    {
      id: 'firmware',
      type: 'auto',
      title: 'Check your program is on the board',
      async run(ctx) {
        if (ctx.hw.state().agent) return { status: 'failed', summary: 'The diagnostic agent is on the board, not your program. Restore your firmware first.' };
        return { status: 'ok', summary: 'Your own program is running.' };
      },
      fallbacks: [{ id: 'retry', label: 'Check again', kind: 'retry' }],
    },
    {
      id: 'try-bauds',
      type: 'auto',
      title: 'Try the common speeds',
      body: 'Garbage characters usually mean the program and the monitor use different speeds (baud rates). The app listens at each common speed for 2 seconds.',
      async run(ctx) {
        const results: { baud: number; ratio: number; lines: number; sample: string }[] = [];
        for (const baud of BAUDS) {
          const r = await ctx.hw.captureSerial(baud, 2000);
          if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
          const ratio = printableRatio(r.value);
          results.push({ baud, ratio, lines: r.value.length, sample: r.value.find((l) => l.trim())?.slice(0, 60) ?? '' });
          ctx.log('check', t('{baud} baud: {lines} lines, {pct}% readable.', { baud, lines: r.value.length, pct: Math.round(ratio * 100) }), {
            source: 'measured: serial capture',
          });
          if (ratio > 0.97 && r.value.length > 0) break;
        }
        ctx.data.bauds = results;
        const best = [...results].filter((x) => x.lines > 0).sort((a, b) => b.ratio - a.ratio)[0];
        if (!best) return { status: 'warning', summary: 'The board printed nothing at any speed.' };
        ctx.data.best = best;
        return {
          status: best.ratio > 0.9 ? 'ok' : 'warning',
          summary: t('Clearest at {baud} baud ({pct}% readable).', { baud: best.baud, pct: Math.round(best.ratio * 100) }),
        };
      },
      fallbacks: [{ id: 'retry', label: 'Try again', kind: 'retry' }],
    },
    {
      id: 'result',
      type: 'result',
      title: 'Result',
      async run(ctx) {
        const results = (ctx.data.bauds as { baud: number; ratio: number; lines: number; sample: string }[] | undefined) ?? [];
        const best = ctx.data.best as { baud: number; ratio: number; sample: string } | undefined;
        const ev: Evidence[] = results.map((r) => ({
          text:
            r.sample && r.ratio > 0.9
              ? t('{baud} baud: {lines} lines, {pct}% readable (“{sample}”)', { baud: r.baud, lines: r.lines, pct: Math.round(r.ratio * 100), sample: r.sample })
              : t('{baud} baud: {lines} lines, {pct}% readable', { baud: r.baud, lines: r.lines, pct: Math.round(r.ratio * 100) }),
          source: 'measured: serial capture',
          confidence: 'measured',
        }));
        if (!best) {
          return {
            status: 'ok',
            summary: 'Done',
            result: {
              title: 'The board prints nothing',
              cause: 'At every common speed the board stayed silent. Your program may not call Serial.begin(), or it prints on other pins.',
              confidence: 'measured',
              evidence: ev,
              sources: [],
              nextSteps: ['Add Serial.begin(115200) in setup() and a Serial.println() in loop().'],
              highlight: ['pin:TX0'],
            },
          };
        }
        const ok115 = best.baud === 115200;
        return {
          status: 'ok',
          summary: 'Done',
          result: {
            title: ok115 ? 'Serial output is clean at 115200' : t('Your program talks at {baud} baud', { baud: best.baud }),
            cause: ok115
              ? 'At 115200 baud the output is readable. If your terminal shows garbage, set it to 115200.'
              : t('The output is readable at {baud} baud but garbage at 115200. The monitor and your program must use the same speed.', { baud: best.baud }),
            confidence: 'measured',
            evidence: ev,
            sources: [t('Serial capture at several speeds (this session)')],
            nextSteps: ok115
              ? ['Set your serial monitor to 115200 baud.']
              : [
                  t(
                    'Either set the monitor to {baud}, or change Serial.begin({baud}) to Serial.begin(115200) in your code (recommended: the ESP32 boot messages also use 115200).',
                    { baud: best.baud },
                  ),
                ],
            highlight: ['pin:TX0'],
          },
        };
      },
    },
  ],
};
