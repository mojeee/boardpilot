// AI settings: chosen provider, model per provider and API keys per provider, stored in
// userData/settings.json. Keys are encrypted with Electron safeStorage (Keychain on macOS);
// if encryption is unavailable, keys are not saved at all. .env.local keys still work as fallback.
// Only view() leaves the main process, and it never contains a key.
// The free demo ('demo') needs no key: it is used whenever the picked provider has no key, so the
// assistant works on first launch, unless BOARDPILOT_DEMO_AI_URL=off.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Result } from '@shared/types';
import {
  AI_PROVIDERS,
  KEYED_PROVIDERS,
  isProviderId,
  PROVIDER_INFO,
  type AiProviderId,
  type AiProviderState,
  type AiSettingsInput,
  type AiSettingsView,
} from '@shared/ai';
import { t } from '@shared/i18n';
import { demoOptions } from '../ai/providers/demo';

/** The part of Electron's safeStorage we use (injected so tests can run without Electron). */
export interface SecretBox {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

interface SettingsFile {
  version: 1;
  provider: AiProviderId;
  models: Partial<Record<AiProviderId, string>>;
  /** base64 of safeStorage-encrypted keys */
  keys: Partial<Record<AiProviderId, string>>;
}

export function keyHint(key: string): string {
  return key.length >= 8 ? `…${key.slice(-4)}` : '…';
}

/** Checks a pasted key. Returns an error text, or null if it looks usable. */
export function checkKeyFormat(key: string): string | null {
  if (key.length < 16) return t('That key looks too short. Copy the whole key from the provider website.');
  if (key.length > 500 || /\s/.test(key)) return t('That key contains spaces or line breaks. Copy only the key itself.');
  return null;
}

const fail = <T>(code: string, humanMessage: string, hint: string): Result<T> => ({ ok: false, error: { code, humanMessage, hint } });

export class AiSettingsStore {
  private data: SettingsFile;
  private cache = new Map<AiProviderId, string>();

  constructor(
    private readonly file: string,
    private readonly box: SecretBox,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {
    this.data = this.read();
  }

  private read(): SettingsFile {
    const fresh: SettingsFile = { version: 1, provider: this.firstEnvProvider(), models: {}, keys: {} };
    if (!existsSync(this.file)) return fresh;
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SettingsFile>;
      const models: SettingsFile['models'] = {};
      const keys: SettingsFile['keys'] = {};
      for (const p of KEYED_PROVIDERS) {
        const m = raw.models?.[p];
        if (typeof m === 'string' && m.trim()) models[p] = m.trim();
        const k = raw.keys?.[p];
        if (typeof k === 'string' && k) keys[p] = k;
      }
      return { version: 1, provider: isProviderId(raw.provider) ? raw.provider : fresh.provider, models, keys };
    } catch {
      return fresh;
    }
  }

  private write() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  private firstEnvProvider(): AiProviderId {
    return KEYED_PROVIDERS.find((p) => this.envKey(p)) ?? (this.demoEnabled ? 'demo' : 'anthropic');
  }

  private envKey(p: AiProviderId): string | null {
    const name = PROVIDER_INFO[p].envVar;
    return (name && this.env[name]?.trim()) || null;
  }

  /** False when the free demo is switched off with BOARDPILOT_DEMO_AI_URL=off. */
  get demoEnabled(): boolean {
    return demoOptions(this.env) !== null;
  }

  private savedKey(p: AiProviderId): string | null {
    if (!PROVIDER_INFO[p].needsKey) return null;
    if (this.cache.has(p)) return this.cache.get(p) ?? null;
    const enc = this.data.keys[p];
    if (!enc || !this.box.isEncryptionAvailable()) return null;
    try {
      const key = this.box.decryptString(Buffer.from(enc, 'base64'));
      this.cache.set(p, key);
      return key;
    } catch {
      return null;
    }
  }

  /** The key to use for a provider: saved (encrypted) first, then .env.local. Main process only. */
  getKey(p: AiProviderId): string | null {
    if (!PROVIDER_INFO[p].needsKey) return null;
    return this.savedKey(p) ?? this.envKey(p);
  }

  /** The provider the user picked. */
  get provider(): AiProviderId {
    return this.data.provider;
  }

  /** The provider to use: the picked one when it has a key (or is the demo), else the free demo.
   *  Returns the picked provider when neither works; callers then report "AI is off". */
  active(): AiProviderId {
    const p = this.data.provider;
    if (PROVIDER_INFO[p].needsKey && this.getKey(p)) return p;
    return this.demoEnabled ? 'demo' : p;
  }

  /** True when the active provider can answer (it has a key, or it is the enabled demo). */
  get usable(): boolean {
    const a = this.active();
    return a === 'demo' ? this.demoEnabled : this.getKey(a) !== null;
  }

  model(p: AiProviderId = this.active()): string {
    if (!PROVIDER_INFO[p].needsKey) return PROVIDER_INFO[p].defaultModel;
    return this.data.models[p] ?? PROVIDER_INFO[p].defaultModel;
  }

  /** What the renderer may see: no keys, only whether one exists and its last characters. */
  view(): AiSettingsView {
    const providers = {} as Record<AiProviderId, AiProviderState>;
    for (const p of AI_PROVIDERS) {
      const saved = this.savedKey(p);
      const env = PROVIDER_INFO[p].needsKey ? this.envKey(p) : null;
      const key = saved ?? env;
      providers[p] = { hasKey: Boolean(key), keyHint: key ? keyHint(key) : '', keySource: saved ? 'saved' : env ? 'env' : null, model: this.model(p) };
    }
    return {
      provider: this.data.provider,
      active: this.active(),
      demoEnabled: this.demoEnabled,
      model: this.model(this.data.provider),
      providers,
      canSaveKeys: this.box.isEncryptionAvailable(),
    };
  }

  save(input: AiSettingsInput): Result<AiSettingsView> {
    if (!isProviderId(input.provider)) return fail('bad_provider', t('Unknown AI provider.'), t('Pick Claude, GPT or Gemini.'));
    const model = (input.model ?? '').trim();
    if (model.length > 200 || /\s/.test(model)) return fail('bad_model', t('That model name is not valid.'), t('Pick a model from the list, or press Load models.'));
    // The free demo has no key and its model is chosen by the relay.
    const key = PROVIDER_INFO[input.provider].needsKey ? (input.apiKey ?? '').trim() : '';
    if (key) {
      const bad = checkKeyFormat(key);
      if (bad) return fail('bad_key', bad, t('Paste the key again.'));
      if (!this.box.isEncryptionAvailable()) {
        return fail(
          'no_encryption',
          t('This Mac cannot encrypt the key right now, so it was not saved.'),
          t('Put the key in .env.local in the project folder instead (for example OPENAI_API_KEY=...), then restart the app.'),
        );
      }
      this.data.keys[input.provider] = this.box.encryptString(key).toString('base64');
      this.cache.set(input.provider, key);
    }
    this.data.provider = input.provider;
    if (model && model !== PROVIDER_INFO[input.provider].defaultModel && PROVIDER_INFO[input.provider].needsKey) this.data.models[input.provider] = model;
    else delete this.data.models[input.provider];
    try {
      this.write();
    } catch (e) {
      return fail('save_failed', t('The settings could not be saved: {msg}', { msg: e instanceof Error ? e.message : String(e) }), t('Check that the disk is not full, then try again.'));
    }
    return { ok: true, value: this.view() };
  }

  clearKey(p: AiProviderId): Result<AiSettingsView> {
    if (!isProviderId(p)) return fail('bad_provider', t('Unknown AI provider.'), t('Pick Claude, GPT or Gemini.'));
    delete this.data.keys[p];
    this.cache.delete(p);
    try {
      this.write();
    } catch (e) {
      return fail('save_failed', t('The settings could not be saved: {msg}', { msg: e instanceof Error ? e.message : String(e) }), t('Check that the disk is not full, then try again.'));
    }
    return { ok: true, value: this.view() };
  }
}
