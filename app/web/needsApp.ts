// "This needs the app": the answer the browser demo gives for anything that needs the computer
// (USB ports, chip tools, files on disk, saved API keys, the MCP server). The error goes back to
// the caller like any other, and an event asks the page to show the "Download the app" prompt.

import type { AppError, Result } from '@shared/types';
import { NEEDS_APP_EVENT } from '@shared/api';
import { t } from '@shared/i18n';

export function needsAppError(what: string): AppError {
  return { code: 'needs_app', humanMessage: what, hint: t('Download BoardPilot (free for 30 days) to do this on your computer.') };
}

/** Shows the prompt (at most once per second, so a burst of calls opens it once). */
let last = 0;
export function showNeedsApp(what: string) {
  const now = Date.now();
  if (now - last < 1000) return;
  last = now;
  window.dispatchEvent(new CustomEvent(NEEDS_APP_EVENT, { detail: { reason: what } }));
}

export function needsApp<T>(what: string): Result<T> {
  showNeedsApp(what);
  return { ok: false, error: needsAppError(what) };
}
