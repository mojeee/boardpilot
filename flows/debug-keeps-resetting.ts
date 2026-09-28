import type { Evidence, FlowDef } from '@shared/flow';
import { t } from '@shared/i18n';
import { ensureBoardStep, fmtErr } from './common';

/** Reset reasons printed by the ESP32 ROM (ESP-IDF docs, "Reset reasons"). Functions, so the text follows the UI language. */
const RESET_REASONS: Record<string, () => string> = {
  POWERON_RESET: () => t('normal power-on'),
  SW_CPU_RESET: () => t('the program restarted the chip (software reset, often after a crash)'),
  TG0WDT_SYS_RESET: () => t('a watchdog timer reset the chip: some code blocked for too long'),
  TG1WDT_SYS_RESET: () => t('a watchdog timer reset the chip: some code blocked for too long'),
  RTCWDT_RTC_RESET: () => t('the RTC watchdog reset the chip'),
  DEEPSLEEP_RESET: () => t('waking from deep sleep (normal if you use deep sleep)'),
  RTCWDT_BROWN_OUT_RESET: () => t('the supply voltage dropped too low (brownout)'),
};

export const debugKeepsResetting: FlowDef = {
  id: 'debug-keeps-resetting',
  title: 'Debug: board keeps resetting',
  description: 'Listens to what the board prints while it restarts and reads the reset reason.',
  steps: [
    ensureBoardStep(),
    {
      id: 'firmware',
      type: 'auto',
      title: 'Check your program is on the board',
      async run(ctx) {
        if (ctx.hw.state().agent) {
          return { status: 'failed', summary: 'The diagnostic agent is on the board right now, not your program. Restore your firmware first (top bar → Restore), then run this again.' };
        }
        return { status: 'ok', summary: 'Your own program is running.' };
      },
      fallbacks: [{ id: 'retry', label: 'I restored it, check again', kind: 'retry' }],
    },
    {
      id: 'listen',
      type: 'auto',
      title: 'Listen to the serial output (6 s)',
      body: 'This only reads. The app opens the serial port at 115200 baud, the speed the ESP32 uses for its boot messages.',
      async run(ctx) {
        const r = await ctx.hw.captureSerial(115200, 6000);
        if (!r.ok) return { status: 'failed', summary: fmtErr(r.error) };
        ctx.data.lines = r.value;
        const resets = r.value.filter((l) => /rst:0x/.test(l));
        const seen =
          resets.length === 1
            ? t('{lines} lines, 1 restart seen.', { lines: r.value.length })
            : t('{lines} lines, {n} restarts seen.', { lines: r.value.length, n: resets.length });
        ctx.log(resets.length ? 'warning' : 'check', seen, { source: 'measured: serial capture' });
        return {
          status: resets.length ? 'warning' : 'ok',
          summary: resets.length ? t('The board restarted {n} time(s) in 6 s.', { n: resets.length }) : 'No restart seen in 6 s.',
        };
      },
      fallbacks: [{ id: 'retry', label: 'Listen again', kind: 'retry' }],
    },
    {
      id: 'result',
      type: 'result',
      title: 'Result',
      async run(ctx) {
        const lines = (ctx.data.lines as string[] | undefined) ?? [];
        const ev: Evidence[] = [];
        const reasons = new Map<string, number>();
        for (const l of lines) {
          const m = /rst:0x[0-9a-f]+ \(([A-Z0-9_]+)\)/i.exec(l);
          if (m) reasons.set(m[1], (reasons.get(m[1]) ?? 0) + 1);
        }
        for (const [k, n] of reasons) {
          const why = RESET_REASONS[k]?.() ?? t('see ESP-IDF reset reasons');
          ev.push({ text: t('rst: {reason} × {n}: {why}', { reason: k, n, why }), source: 'measured: serial capture', confidence: 'measured' });
        }
        const brownout = lines.some((l) => /Brownout detector was triggered/i.test(l));
        const panic = lines.find((l) => /Guru Meditation|panic|abort\(\)|LoadProhibited|StoreProhibited/i.test(l));
        const wdt = lines.some((l) => /Task watchdog|task_wdt|Interrupt wdt/i.test(l));
        if (brownout) ev.push({ text: t('“Brownout detector was triggered” was printed'), source: 'measured: serial capture', confidence: 'measured' });
        if (panic) ev.push({ text: t('Crash message: {msg}', { msg: panic.trim().slice(0, 120) }), source: 'measured: serial capture', confidence: 'measured' });

        if (brownout) {
          return {
            status: 'ok',
            summary: 'Done',
            result: {
              title: 'The power supply dips too low',
              cause:
                'The chip reported a brownout: the 3.3 V supply dropped below the safe level, usually when Wi-Fi starts and the current jumps. The chip then restarts to protect itself.',
              confidence: 'measured',
              evidence: ev,
              sources: ['ESP-IDF Programming Guide, Brownout detector', 'ESP32 Series Datasheet, Power supply'],
              nextSteps: [
                'Use a shorter, thicker USB cable, or a powered USB hub.',
                'Remove parts powered from the board’s 3V3 pin to see if it stops.',
                'Add a 470 µF capacitor between 3V3 and GND near the board.',
              ],
              highlight: ['pin:3V3', 'pin:GND1'],
            },
          };
        }
        if (panic || wdt) {
          return {
            status: 'ok',
            summary: 'Done',
            result: {
              title: wdt ? 'A watchdog restarts the board' : 'Your program crashes',
              cause: wdt
                ? 'Some code runs too long without giving time back to the system, so a watchdog restarts the chip.'
                : 'The program hits an error (for example a null pointer) and the chip restarts.',
              confidence: 'measured',
              evidence: ev,
              sources: ['ESP-IDF Programming Guide, Fatal errors', 'ESP-IDF Programming Guide, Watchdogs'],
              nextSteps: wdt
                ? ['Add delay(1) or yield() inside long loops.', 'Avoid waiting forever for a sensor inside loop().']
                : ['Open Monitor to see the full crash message.', 'Look for pointers used before they are set.'],
              highlight: [],
            },
          };
        }
        return {
          status: 'ok',
          summary: 'Done',
          result: {
            title: reasons.size ? 'The board restarts' : 'No restart seen',
            cause: reasons.size
              ? 'The board restarted, but without a brownout or crash message. The reset reasons are listed below.'
              : 'In 6 seconds the board did not restart. If it resets only sometimes, run this again when it happens.',
            confidence: reasons.size ? 'measured' : 'suggestion',
            evidence: ev,
            sources: ['ESP-IDF Programming Guide, Reset reasons'],
            nextSteps: ['Watch the output in Monitor while it happens.'],
            highlight: [],
          },
        };
      },
    },
  ],
};
