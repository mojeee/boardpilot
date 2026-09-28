// Sends a question to the assistant with the context CLAUDE.md asks for.

import type { AiContext, AiReply } from '@shared/types';
import { useAi, useApp, useLive, useLog, useScene, log } from '../state/store';
import { useWizard } from '../wizard/session';
import { confirmGpioWrite, confirmInstallAgent } from '../state/hw';
import { t } from '@shared/i18n';

export function aiContext(): AiContext {
  const w = useWizard.getState();
  const answers: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w.runner?.ctx.answers ?? {})) answers[k] = v;
  const live = useLive.getState();
  return {
    screen: useApp.getState().screen,
    answers,
    log: useLog.getState().entries.slice(-50),
    live: Date.now() - live.frameAt < 3000 ? live.frame : null,
    scene: useScene.getState().scene,
    flowId: w.state?.flowId,
    stepId: w.runner?.currentStep?.id,
  };
}

export async function askAi(question: string): Promise<AiReply | null> {
  const ai = useAi.getState();
  if (ai.busy) return null;
  ai.push({ role: 'user', text: question });
  ai.set({ busy: true });
  const r = await window.bp.ai.ask(question, aiContext());
  useAi.getState().set({ busy: false });
  if (!r.ok) {
    useAi.getState().push({ role: 'error', text: r.error.humanMessage, hint: r.error.hint });
    return null;
  }
  const reply = r.value;
  useAi.getState().push({ role: 'assistant', reply });
  for (const c of reply.toolCalls ?? []) {
    if (['read_pins', 'pullup_check', 'i2c_scan', 'i2c_read', 'adc_read'].includes(c.name)) {
      log(c.ok ? 'check' : 'failed', t('Assistant ran {tool} {input}', { tool: c.name, input: JSON.stringify(c.input) }), { source: 'assistant tool call' });
    }
  }
  if (reply.highlight.length) useScene.getState().focusOn(reply.highlight);
  if (reply.pendingWrite) {
    const pw = reply.pendingWrite;
    if (pw.kind === 'flash_agent') await confirmInstallAgent(t('The assistant asks to install the diagnostic agent: {reason}', { reason: pw.reason }));
    else if (pw.kind === 'gpio_write' && pw.pin !== undefined) await confirmGpioWrite(pw.pin, pw.level ?? 1, t('The assistant asks: {reason}', { reason: pw.reason }));
  }
  return reply;
}
