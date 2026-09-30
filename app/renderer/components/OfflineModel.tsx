// AI settings, "Offline model": what this computer can run, the model the app recommends, and the
// download of the model files. Everything runs in the main process; this only shows and asks.

import { useEffect, useState } from 'react';
import { describeHardware, formatBytes, type LocalAiStatus, type LocalDownloadEvent, type LocalFit } from '@shared/localModels';
import { t } from '@shared/i18n';

const fitText = (fit: LocalFit): string => {
  if (fit === 'fast') return t('Fast on this computer');
  if (fit === 'ok') return t('Runs well on this computer');
  if (fit === 'slow') return t('Works, but slow on this computer');
  if (fit === 'no_disk') return t('Not enough free disk space');
  return t('Not enough memory');
};

interface Props {
  /** The model picked in the dialog (saved with the Save button). */
  picked: string;
  onPick(id: string): void;
  /** Called after a download or a delete, so the dialog can refresh what it knows. */
  onChanged(): void;
}

export function OfflineModel({ picked, onPick, onChanged }: Props) {
  const [status, setStatus] = useState<LocalAiStatus | null>(null);
  const [progress, setProgress] = useState<LocalDownloadEvent | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void window.bp.localAi.status().then((s) => alive && setStatus(s));
    const off = window.bp.localAi.onProgress((p) => alive && setProgress(p));
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!status) return <p className="dim small">{t('Looking at this computer…')}</p>;
  const hw = describeHardware(status.hardware);
  const busyId = status.downloading;

  const refresh = async () => {
    setStatus(await window.bp.localAi.status());
    onChanged();
  };

  const download = async (id: string) => {
    setError('');
    setProgress(null);
    setStatus({ ...status, downloading: id });
    const r = await window.bp.localAi.download(id);
    setProgress(null);
    if (!r.ok) {
      if (r.error.code !== 'cancelled') setError(`${r.error.humanMessage} ${r.error.hint}`.trim());
    } else onPick(id);
    await refresh();
  };

  const remove = async (id: string) => {
    setError('');
    const r = await window.bp.localAi.remove(id);
    if (!r.ok) return setError(`${r.error.humanMessage} ${r.error.hint}`.trim());
    setStatus(r.value);
    onChanged();
  };

  const recommended = status.models.find((m) => m.id === status.recommendedId);

  return (
    <div className="ai-local">
      <p className="ai-local-lead">{t('Runs on this computer: free, private and works without internet. It is smaller than Claude, GPT or Gemini, so it can be wrong more often. Measurements and checks are the same.')}</p>

      {!status.engineOk && (
        <p className="warn-text small">
          {t('The offline engine could not start on this computer. Use Claude, GPT or Gemini instead.')} {status.engineError}
        </p>
      )}

      <p className="small dim ai-local-hw">
        {t('This computer: {memory} memory', { memory: hw.memory })}
        {hw.gpu ? `, ${hw.gpu}` : `, ${t('no fast graphics card found')}`}
        {`, ${t('{disk} free', { disk: hw.disk })}`}
      </p>

      {recommended ? (
        <p className="small ai-local-rec">
          {t('Best for this computer: {name} ({size}).', { name: recommended.name, size: formatBytes(recommended.approxBytes) })}
        </p>
      ) : (
        <p className="small warn-text">{t('This computer is short on memory or disk space for an offline model. Use a cheap online model instead: Claude Haiku, GPT Luna or Gemini Flash-Lite.')}</p>
      )}

      <div className="ai-local-list" role="radiogroup" aria-label={t('Offline models')}>
        {status.models.map((m) => {
          const isBusy = busyId === m.id;
          const pct = isBusy && progress?.modelId === m.id && progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null;
          const blocked = m.fit === 'no_memory' || m.fit === 'no_disk';
          return (
            <div key={m.id} className={`ai-local-row ${m.installed && picked === m.id ? 'on' : ''}`}>
              <div className="ai-local-info">
                <b>{m.name}</b> <span className="dim small">{formatBytes(m.approxBytes)}</span>
                {m.id === status.recommendedId && <span className="chip ai-chip">{t('recommended')}</span>}
                <div className={`small ${blocked ? 'warn-text' : m.fit === 'slow' ? 'dim' : 'ok-text'}`}>{fitText(m.fit)}</div>
              </div>
              <div className="ai-local-actions">
                {m.installed ? (
                  <>
                    <button className="btn small" role="radio" aria-checked={picked === m.id} disabled={picked === m.id} onClick={() => onPick(m.id)}>
                      {picked === m.id ? t('In use') : t('Use this one')}
                    </button>
                    <button className="btn small danger" disabled={busyId !== null} onClick={() => void remove(m.id)}>
                      {t('Delete')}
                    </button>
                  </>
                ) : isBusy ? (
                  <button className="btn small" onClick={() => void window.bp.localAi.cancel()}>
                    {t('Cancel')}
                  </button>
                ) : (
                  <button className="btn small primary" disabled={blocked || busyId !== null || !status.engineOk} onClick={() => void download(m.id)}>
                    {m.partialBytes > 0 ? t('Continue download') : t('Download')}
                  </button>
                )}
              </div>
              {isBusy && (
                <div className="ai-local-progress progress">
                  <div className="bar">
                    <i style={{ width: `${pct ?? 0}%` }} />
                  </div>
                  <span className="small dim">
                    {progress?.phase === 'verifying'
                      ? t('Checking the file…')
                      : pct === null
                        ? t('Starting…')
                        : t('{done} of {total}', { done: formatBytes(progress!.received), total: formatBytes(progress!.total) })}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="small err-text">{error}</p>}
      <p className="small dim">{t('The model is downloaded once from Hugging Face and kept on this computer. Press Save to use it.')}</p>
    </div>
  );
}
