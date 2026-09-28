// AI providers the user can choose from, and the settings view the renderer may see.
// The renderer never receives an API key: only whether one is set and its last 4 characters.

export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'demo'] as const;
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
  /** Fallback environment variable (from .env.local). Empty for the free demo (no key). */
  envVar: string;
  /** False for the free demo, which uses BoardPilot's relay instead of a user key. */
  needsKey: boolean;
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
    needsKey: true,
  },
  openai: {
    id: 'openai',
    short: 'GPT',
    name: 'GPT (OpenAI)',
    defaultModel: 'gpt-6-sol',
    fastModel: 'gpt-6-luna',
    keyUrl: 'https://platform.openai.com/api-keys',
    envVar: 'OPENAI_API_KEY',
    needsKey: true,
  },
  gemini: {
    id: 'gemini',
    short: 'Gemini',
    name: 'Gemini (Google)',
    defaultModel: 'gemini-3.8-flash',
    fastModel: 'gemini-3.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/apikey',
    envVar: 'GEMINI_API_KEY',
    needsKey: true,
  },
  // The free demo: Gemini through BoardPilot's relay (site/functions/api/demo-ai.js), which holds a
  // free-tier key and picks the model. gemini-3.1-flash-lite is the relay default: older, stable,
  // free tier, function calling, structured outputs and Search grounding
  // (https://ai.google.dev/gemini-api/docs/models, https://ai.google.dev/gemini-api/docs/pricing).
  demo: {
    id: 'demo',
    short: 'Demo',
    name: 'Free demo',
    defaultModel: 'gemini-3.1-flash-lite',
    fastModel: 'gemini-3.1-flash-lite',
    keyUrl: '',
    envVar: '',
    needsKey: false,
  },
};

/** Providers the user brings a key for. */
export const KEYED_PROVIDERS = AI_PROVIDERS.filter((p) => PROVIDER_INFO[p].needsKey);

/** The relay of the free demo; overridable with BOARDPILOT_DEMO_AI_URL ("off" turns the demo off). */
export const DEMO_AI_URL = 'https://boardpilot.agentflowbind.com/api/demo-ai';
/** Limits the relay enforces; the app trims requests to fit them. */
export const DEMO_MAX_BODY_BYTES = 48 * 1024;
export const DEMO_MAX_OUTPUT_TOKENS = 2048;

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
  /** The provider the user picked. */
  provider: AiProviderId;
  /** The provider actually used: the picked one, or the free demo while the picked one has no key. */
  active: AiProviderId;
  /** False when the free demo is switched off (BOARDPILOT_DEMO_AI_URL=off). */
  demoEnabled: boolean;
  model: string;
  providers: Record<AiProviderId, AiProviderState>;
  /** False when the OS cannot encrypt secrets; then keys cannot be saved. */
  canSaveKeys: boolean;
}

export interface AiStatus {
  enabled: boolean;
  /** The provider in use ('demo' while the free demo answers). */
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
