// Free public beta: what the app does when the 30-day trial has ended.
// Decided Sep 28 (docs/roadmap-2026-10.md): the app keeps working and shows a notice that can be
// closed and comes back at most once a week. The trial and license-key code stays, so a paid model
// can be switched on again by setting BETA_FREE to false in shared/brand.ts.

export const BETA_NOTICE_INTERVAL_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

export type LicenseGate = 'none' | 'notice' | 'lock';

/**
 * What the license state means for the screen:
 * - licensed or still in the trial: nothing;
 * - trial over and the beta is free: a notice (never a lock);
 * - trial over and no free beta: the lock screen.
 */
export function licenseGate(state: 'trial' | 'licensed' | 'expired', betaFree: boolean): LicenseGate {
  if (state !== 'expired') return 'none';
  return betaFree ? 'notice' : 'lock';
}

/** True when the notice was never closed, or was last closed at least a week ago. */
export function betaNoticeDue(lastDismissedIso: string | null | undefined, now = new Date()): boolean {
  if (!lastDismissedIso) return true;
  const t = Date.parse(lastDismissedIso);
  if (Number.isNaN(t)) return true;
  if (t > now.getTime()) return true; // clock went backwards: show it rather than hide it forever
  return now.getTime() - t >= BETA_NOTICE_INTERVAL_DAYS * DAY;
}
