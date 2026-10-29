// Trial and license UI: a chip in the top bar, a dialog to enter a key, and what happens once the
// 30-day trial is over: during the free beta (BETA_FREE) a notice that can be closed and comes back
// at most once a week; otherwise a lock screen.

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { LicenseStatus } from '@shared/types';
import { t } from '@shared/i18n';
import { BETA_FREE, FEEDBACK_URL, REPO_URL } from '@shared/brand';
import { betaNoticeDue, licenseGate } from '@shared/betaNotice';
import { Icon } from './Icon';
import { LogoMark } from './Logo';

interface LicenseStore {
  status: LicenseStatus | null;
  dialog: boolean;
  refresh(): Promise<void>;
  set(p: Partial<Pick<LicenseStore, 'status' | 'dialog'>>): void;
}

export const useLicense = create<LicenseStore>((set) => ({
  status: null,
  dialog: false,
  refresh: async () => set({ status: await window.bp.license.status() }),
  set: (p) => set(p),
}));

const NOTICE_KEY = 'bp.betaNoticeClosed';

/** Per-viewer convenience only: if storage is blocked the notice simply shows again next start. */
function lastNoticeClosed(): string | null {
  try {
    return localStorage.getItem(NOTICE_KEY);
  } catch {
    return null;
  }
}

function KeyForm({ onDone, showBuy = true }: { onDone?: () => void; showBuy?: boolean }) {
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activate = async () => {
    setBusy(true);
    setErr(null);
    const r = await window.bp.license.activate(key);
    setBusy(false);
    if (!r.ok) return setErr(`${t(r.error.humanMessage)} ${t(r.error.hint)}`);
    useLicense.getState().set({ status: r.value });
    onDone?.();
  };
  return (
    <div className="key-form">
      <textarea rows={3} className="mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="BP1-…" />
      {err && <p className="err-text small">{err}</p>}
      <div className="row gap wrap">
        <button className="btn primary" disabled={busy || !key.trim()} onClick={activate}>
          <Icon name="key" size={15} /> {t('Activate')}
        </button>
        {showBuy && (
          <button className="btn" onClick={() => window.bp.license.openBuyPage()}>
            {t('Buy a license')}
          </button>
        )}
        <button className="btn ghost" onClick={() => window.bp.app.openExternal(`${REPO_URL}/blob/main/LICENSE.md`)}>
          {t('Read the license')}
        </button>
      </div>
    </div>
  );
}

export function LicenseChip() {
  const s = useLicense((x) => x.status);
  if (!s) return null;
  const label =
    s.state === 'licensed'
      ? t('Licensed')
      : s.state === 'expired'
        ? BETA_FREE
          ? t('Free beta')
          : t('Trial ended')
        : t('Trial: {n} days left', { n: s.daysLeft });
  return (
    <button className={`chip lic-chip lic-${s.state}`} onClick={() => useLicense.getState().set({ dialog: true })}>
      {label}
    </button>
  );
}

export function LicenseDialog() {
  const open = useLicense((x) => x.dialog);
  const s = useLicense((x) => x.status);
  if (!open || !s) return null;
  return (
    <div className="modal-back" role="dialog" aria-modal>
      <div className="modal">
        <div className="row between">
          <h2>{t('License')}</h2>
          <button className="close" onClick={() => useLicense.getState().set({ dialog: false })}>
            ×
          </button>
        </div>
        {s.state === 'licensed' ? (
          <p>{t('Licensed to {name} ({plan}). Thank you for supporting BoardPilot.', { name: s.licensee ?? '', plan: s.plan ?? '' })}</p>
        ) : s.state === 'expired' && BETA_FREE ? (
          <>
            <p>{t('BoardPilot is free during the beta. The {total}-day trial is over, but you can keep using everything.', { total: s.trialDays })}</p>
            <p>{t('The terms may change for future versions, and you will be told well in advance. Until then, tell us what works and what does not.')}</p>
            <div className="row gap wrap">
              <button className="btn primary" onClick={() => window.bp.app.openExternal(FEEDBACK_URL)}>
                {t('Send feedback')}
              </button>
              <button className="btn ghost" onClick={() => window.bp.app.openExternal(`${REPO_URL}/blob/main/LICENSE.md`)}>
                {t('Read the license')}
              </button>
            </div>
            <p className="small dim">{t('Have a license key? Enter it here.')}</p>
            <KeyForm showBuy={false} onDone={() => useLicense.getState().set({ dialog: false })} />
          </>
        ) : (
          <>
            <p>
              {s.state === 'trial'
                ? t('You are using the free trial: {n} of {total} days left.', { n: s.daysLeft, total: s.trialDays })
                : t('The {total}-day trial has ended.', { total: s.trialDays })}{' '}
              {t('BoardPilot is source-available: you can read and build the code, and continued use needs a license key.')}
            </p>
            <KeyForm onDone={() => useLicense.getState().set({ dialog: false })} />
          </>
        )}
      </div>
    </div>
  );
}

/** Free beta: shown once the trial is over, closable, and back after a week at most. */
export function BetaNotice() {
  const s = useLicense((x) => x.status);
  const dialogOpen = useLicense((x) => x.dialog);
  const [open, setOpen] = useState(false);
  const gate = s ? licenseGate(s.state, BETA_FREE) : 'none';
  useEffect(() => {
    if (gate === 'notice' && betaNoticeDue(lastNoticeClosed())) setOpen(true);
  }, [gate]);
  if (gate !== 'notice' || !s || !open || dialogOpen) return null;
  const close = () => {
    try {
      localStorage.setItem(NOTICE_KEY, new Date().toISOString());
    } catch {
      /* storage blocked: the notice just comes back next start */
    }
    setOpen(false);
  };
  return (
    <div className="modal-back" role="dialog" aria-modal>
      <div className="modal">
        <div className="row between">
          <h2>{t('BoardPilot is free during the beta')}</h2>
          <button className="close" aria-label={t('Close')} onClick={close}>
            ×
          </button>
        </div>
        <p>
          {t('Your {total}-day trial is over, and that is fine: you can keep using everything. Thank you for trying BoardPilot.', {
            total: s.trialDays,
          })}
        </p>
        <p>{t('The terms may change for future versions, and you will be told well in advance. Tell us what works and what does not.')}</p>
        <div className="row gap wrap">
          <button
            className="btn primary"
            onClick={() => {
              window.bp.app.openExternal(FEEDBACK_URL);
              close();
            }}
          >
            {t('Send feedback')}
          </button>
          <button className="btn" onClick={close}>
            {t('Keep using BoardPilot')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LockScreen() {
  const s = useLicense((x) => x.status);
  if (!s || licenseGate(s.state, BETA_FREE) !== 'lock') return null;
  return (
    <div className="lock-screen">
      <div className="lock-card">
        <LogoMark size={48} />
        <h1>{t('Your free trial has ended')}</h1>
        <p>
          {t('Thank you for trying BoardPilot for {total} days. To keep using it, enter a license key. Your projects, backups and parts library are safe on this Mac.', {
            total: s.trialDays,
          })}
        </p>
        <KeyForm />
      </div>
    </div>
  );
}
