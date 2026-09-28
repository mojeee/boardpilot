// Trial and license UI: a chip in the top bar, a dialog to enter a key, and a lock screen once
// the 30-day trial is over.

import { useState } from 'react';
import { create } from 'zustand';
import type { LicenseStatus } from '@shared/types';
import { t } from '@shared/i18n';
import { REPO_URL } from '@shared/brand';
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

function KeyForm({ onDone }: { onDone?: () => void }) {
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
        <button className="btn" onClick={() => window.bp.license.openBuyPage()}>
          {t('Buy a license')}
        </button>
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
        ? t('Trial ended')
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

export function LockScreen() {
  const s = useLicense((x) => x.status);
  if (!s || s.state !== 'expired') return null;
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
