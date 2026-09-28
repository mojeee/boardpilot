// AI settings: pick the provider (Claude, GPT, Gemini), paste your own API key, pick a model.
// The key goes to the main process once and is stored encrypted there; this dialog only ever
// sees whether a key exists and its last 4 characters.

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { AI_PROVIDERS, PROVIDER_INFO, type AiModelInfo, type AiProviderId, type AiSettingsView } from '@shared/ai';
import type { AppError } from '@shared/types';
import { t } from '@shared/i18n';
import { useApp } from '../state/store';
import { Icon } from './Icon';

interface AiSettingsStore {
  open: boolean;
  show(): void;
  hide(): void;
}

export const useAiSettings = create<AiSettingsStore>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export const openAiSettings = () => useAiSettings.getState().show();

async function refreshAiStatus() {
  useApp.getState().set({ ai: await window.bp.ai.status() });
}

function blurb(p: AiProviderId): string {
  if (p === 'anthropic') return t('Claude by Anthropic. Careful answers and strong tool use. The default for BoardPilot.');
  if (p === 'openai') return t('GPT by OpenAI. Uses a key from the OpenAI platform.');
  return t('Gemini by Google. Uses a key from Google AI Studio.');
}

type Busy = null | 'models' | 'test' | 'save' | 'clear';
type Msg = { kind: 'ok' | 'err'; text: string } | null;

const errText = (e: AppError) => `${e.humanMessage} ${e.hint}`.trim();

export function AiSettingsDialog() {
  const open = useAiSettings((s) => s.open);
  if (!open) return null;
  return <AiSettingsBody />;
}

function AiSettingsBody() {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [provider, setProvider] = useState<AiProviderId>('anthropic');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<Partial<Record<AiProviderId, AiModelInfo[]>>>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const close = () => useAiSettings.getState().hide();

  useEffect(() => {
    void window.bp.ai.getSettings().then((v) => {
      setView(v);
      setProvider(v.provider);
      setModel(v.model);
    });
  }, []);

  if (!view) return null;
  const info = PROVIDER_INFO[provider];
  const state = view.providers[provider];
  const list = models[provider] ?? [];

  const pick = (p: AiProviderId) => {
    setProvider(p);
    setKey('');
    setModel(view.providers[p].model);
    setMsg(null);
  };

  const loadModels = async () => {
    setBusy('models');
    setMsg(null);
    const r = await window.bp.ai.listModels(provider, key.trim() || undefined);
    setBusy(null);
    if (!r.ok) return setMsg({ kind: 'err', text: errText(r.error) });
    setModels((m) => ({ ...m, [provider]: r.value }));
    setMsg({ kind: 'ok', text: r.value.length === 1 ? t('1 model found.') : t('{n} models found.', { n: r.value.length }) });
  };

  const test = async () => {
    setBusy('test');
    setMsg(null);
    const r = await window.bp.ai.test({ provider, model: model.trim() || info.defaultModel, apiKey: key.trim() || undefined });
    setBusy(null);
    if (!r.ok) return setMsg({ kind: 'err', text: errText(r.error) });
    setMsg({ kind: 'ok', text: t('It works: {provider} answered in {ms} ms using {model}.', { provider: PROVIDER_INFO[r.value.provider].name, ms: r.value.ms, model: r.value.model }) });
  };

  const save = async () => {
    setBusy('save');
    setMsg(null);
    const r = await window.bp.ai.saveSettings({ provider, model: model.trim() || info.defaultModel, apiKey: key.trim() || undefined });
    setBusy(null);
    if (!r.ok) return setMsg({ kind: 'err', text: errText(r.error) });
    setView(r.value);
    setKey('');
    await refreshAiStatus();
    close();
  };

  const removeKey = async () => {
    setBusy('clear');
    setMsg(null);
    const r = await window.bp.ai.clearKey(provider);
    setBusy(null);
    if (!r.ok) return setMsg({ kind: 'err', text: errText(r.error) });
    setView(r.value);
    await refreshAiStatus();
    setMsg({ kind: 'ok', text: t('The saved key was removed.') });
  };

  const keyStatus = (p: AiProviderId) => {
    const s = view.providers[p];
    if (s.keySource === 'saved') return t('Key saved {hint}', { hint: s.keyHint });
    if (s.keySource === 'env') return t('Key from .env.local {hint}', { hint: s.keyHint });
    return t('No key yet');
  };

  return (
    <div className="modal-back" role="dialog" aria-modal onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal ai-settings">
        <div className="row between">
          <h2>{t('AI settings')}</h2>
          <button className="close" aria-label={t('Close')} onClick={close}>
            ×
          </button>
        </div>
        <p>{t('Pick the AI service and paste your own API key. Every check and measurement works without AI.')}</p>

        <div className="ai-prov-grid">
          {AI_PROVIDERS.map((p) => (
            <button key={p} className={`ai-prov ${p === provider ? 'on' : ''}`} onClick={() => pick(p)} aria-pressed={p === provider}>
              <span className="ai-prov-name">
                {PROVIDER_INFO[p].short}
                {p === view.provider && view.providers[p].hasKey && <span className="chip ai-chip">{t('in use')}</span>}
              </span>
              <span className="ai-prov-desc">{blurb(p)}</span>
              <span className={`ai-prov-key small ${view.providers[p].hasKey ? 'ok' : ''}`}>{keyStatus(p)}</span>
            </button>
          ))}
        </div>

        <div className="ai-field">
          <div className="row between">
            <label className="label" htmlFor="ai-key">
              {t('API key for {provider}', { provider: info.name })}
            </label>
            <button className="link small" onClick={() => void window.bp.app.openExternal(info.keyUrl)}>
              <Icon name="key" size={13} /> {t('Get a key')}
            </button>
          </div>
          <input
            id="ai-key"
            className="text-in mono"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={state.hasKey ? t('Leave empty to keep the current key ({hint})', { hint: state.keyHint }) : t('Paste your key here')}
          />
          {!view.canSaveKeys && <p className="warn-text small">{t('This Mac cannot encrypt keys right now, so keys cannot be saved here. A key in .env.local still works.')}</p>}
        </div>

        <div className="ai-field">
          <label className="label" htmlFor="ai-model">
            {t('Model')}
          </label>
          <div className="row gap">
            <input
              id="ai-model"
              className="text-in mono grow"
              list="ai-model-list"
              spellCheck={false}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={info.defaultModel}
            />
            <datalist id="ai-model-list">
              {[info.defaultModel, ...list.map((m) => m.id).filter((id) => id !== info.defaultModel)].map((id) => (
                <option key={id} value={id}>
                  {list.find((m) => m.id === id)?.label ?? id}
                </option>
              ))}
            </datalist>
            <button className="btn small" disabled={busy !== null || (!state.hasKey && !key.trim())} onClick={() => void loadModels()}>
              {busy === 'models' ? t('Loading…') : t('Load models')}
            </button>
          </div>
          <span className="dim small">{t('Recommended: {model}', { model: info.defaultModel })}</span>
        </div>

        <p className="ai-privacy small">
          <Icon name="key" size={13} /> {t('Your key is stored encrypted on this computer. Requests go directly from the app to the provider you choose.')}
        </p>

        {msg && <p className={`small ${msg.kind === 'ok' ? 'ok-text' : 'err-text'}`}>{msg.text}</p>}

        <div className="modal-actions">
          {state.keySource === 'saved' && (
            <button className="btn danger" disabled={busy !== null} onClick={() => void removeKey()}>
              <Icon name="trash" size={14} /> {t('Remove key')}
            </button>
          )}
          <span className="grow" />
          <button className="btn" disabled={busy !== null || (!state.hasKey && !key.trim())} onClick={() => void test()}>
            {busy === 'test' ? t('Testing…') : t('Test connection')}
          </button>
          <button className="btn primary" disabled={busy !== null} onClick={() => void save()}>
            <Icon name="check" size={14} /> {t('Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
