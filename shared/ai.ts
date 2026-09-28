// AI providers the user can choose from, and the settings view the renderer may see.
// The renderer never receives an API key: only whether one is set and its last 4 characters.

export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export interface AiProviderInfo {
  id: AiProviderId;
  /** Short brand name for chips, e.g. "Claude". */
  short: string;
  /** Full name, e.g. "Claude (Anthropic)". */
  name: string;
  /** Default model for the assistant, photos and part import. */
  defaultModel: string;
  /** Fast, cheap model for free-text classification. */
  fastModel: string;
  /** Where the user creates an API key. */
  keyUrl: string;
  /** Fallback environment variable (from .env.local). */
  envVar: string;
}

// Default models, checked against the providers' docs in September 2026:
// - Anthropic: CLAUDE.md (claude-sonnet-5, fast claude-haiku-4-5-20251001).
// - OpenAI: https://developers.openai.com/api/docs/models ("GPT-6 Sol ... balance intelligence and
//   cost", "GPT-6 Luna for cost-sensitive, high-volume workloads"); both support the Responses API,
//   function calling, structured outputs and image input.
// - Gemini: https://ai.google.dev/gemini-api/docs/models (gemini-3.8-flash stable; function calling,
//   structured outputs, image and PDF input; gemini-3.5-flash-lite stable, "fastest, most cost-effective").
export const PROVIDER_INFO: Record<AiProviderId, AiProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    short: 'Claude',
    name: 'Claude (Anthropic)',
    defaultModel: 'claude-sonnet-5',
    fastModel: 'claude-haiku-4-5-20251001',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    envVar: 'ANTHROPIC_API_KEY',
  },
  openai: {
    id: 'openai',
    short: 'GPT',
    name: 'GPT (OpenAI)',
    defaultModel: 'gpt-6-sol',
    fastModel: 'gpt-6-luna',
    keyUrl: 'https://platform.openai.com/api-keys',
    envVar: 'OPENAI_API_KEY',
  },
  gemini: {
    id: 'gemini',
    short: 'Gemini',
    name: 'Gemini (Google)',
    defaultModel: 'gemini-3.8-flash',
    fastModel: 'gemini-3.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/apikey',
    envVar: 'GEMINI_API_KEY',
  },
};

export const isProviderId = (x: unknown): x is AiProviderId => typeof x === 'string' && (AI_PROVIDERS as readonly string[]).includes(x);

export interface AiProviderState {
  hasKey: boolean;
  /** Last characters of the key, e.g. "…abcd". Empty when there is no key. */
  keyHint: string;
  /** Where the key comes from: saved in the app (encrypted) or .env.local. */
  keySource: 'saved' | 'env' | null;
  model: string;
}

export interface AiSettingsView {
  provider: AiProviderId;
  model: string;
  providers: Record<AiProviderId, AiProviderState>;
  /** False when the OS cannot encrypt secrets; then keys cannot be saved. */
  canSaveKeys: boolean;
}

export interface AiStatus {
  enabled: boolean;
  provider: AiProviderId;
  model: string;
}

export interface AiModelInfo {
  id: string;
  label: string;
}

export interface AiSettingsInput {
  provider: AiProviderId;
  model: string;
  /** New key; omit or leave empty to keep the stored one. */
  apiKey?: string;
}
