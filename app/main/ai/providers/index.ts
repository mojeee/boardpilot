// Provider factory and the plain-language error mapping shared by every AI feature.

import type { AppError } from '@shared/types';
import { PROVIDER_INFO, type AiProviderId } from '@shared/ai';
import { t } from '@shared/i18n';
import { AnthropicProvider } from './anthropic';
import { DemoProvider, demoOptions } from './demo';
import { GeminiProvider } from './gemini';
import { OpenAiProvider } from './openai';
import { ProviderError, type AiProvider } from './types';

export * from './types';
export { demoOptions } from './demo';

/** A provider client. The free demo needs no key; `env` supplies its relay URL and app version. */
export function createProvider(id: AiProviderId, apiKey: string, env: Record<string, string | undefined> = process.env): AiProvider {
  if (id === 'demo') {
    const opts = demoOptions(env);
    if (!opts) throw new ProviderError('not_configured', 'demo', 'The free demo is switched off (BOARDPILOT_DEMO_AI_URL=off).');
    return new DemoProvider(opts);
  }
  if (id === 'openai') return new OpenAiProvider(apiKey);
  if (id === 'gemini') return new GeminiProvider(apiKey);
  return new AnthropicProvider(apiKey);
}

/** Any provider failure as { code, humanMessage, hint } for the UI. Never leaks the key. */
export function toAiError(e: unknown, provider: AiProviderId, model: string): AppError {
  const name = PROVIDER_INFO[provider].name;
  if (!(e instanceof ProviderError)) {
    return { code: 'ai_error', humanMessage: t('The assistant failed: {msg}', { msg: e instanceof Error ? e.message : String(e) }), hint: t('Try again.') };
  }
  if (provider === 'demo') {
    const ownKey = t('Open AI settings (the AI chip at the top) to add your own Claude, GPT or Gemini key.');
    switch (e.kind) {
      case 'rate':
      case 'quota':
        return { code: 'ai_demo_busy', humanMessage: t('The free demo is busy or you reached its limit. Try again in a minute, or add your own key.'), hint: ownKey };
      case 'not_configured':
      case 'model':
        return { code: 'ai_demo_off', humanMessage: t('The free demo is not set up yet.'), hint: ownKey };
      case 'auth':
        return { code: 'ai_demo_refused', humanMessage: t('The free demo refused the request.'), hint: t('Try again later, or add your own key in AI settings.') };
      default:
        break;
    }
  }
  switch (e.kind) {
    case 'too_large':
      return {
        code: 'ai_too_large',
        humanMessage: t('This request is too large for the free demo.'),
        hint: t('Photos and very long chats need your own key. Add one in AI settings, or ask a shorter question.'),
      };
    case 'not_configured':
      return { code: 'ai_demo_off', humanMessage: t('The free demo is not set up yet.'), hint: t('Open AI settings (the AI chip at the top) to add your own Claude, GPT or Gemini key.') };
    case 'auth':
      return {
        code: 'ai_auth',
        humanMessage: t('{provider} did not accept the API key.', { provider: name }),
        hint: t('Open AI settings (the AI chip at the top), check the key or paste a new one.'),
      };
    case 'quota':
      return {
        code: 'ai_quota',
        humanMessage: t('Your {provider} account has no credit or quota left.', { provider: name }),
        hint: t('Check billing on the provider website, or pick another provider in AI settings.'),
      };
    case 'rate':
      return { code: 'ai_rate', humanMessage: t('The AI service is busy right now.'), hint: t('Wait a minute and ask again.') };
    case 'offline':
      return { code: 'ai_offline', humanMessage: t('The app could not reach the AI service.'), hint: t('Check your internet connection. Measurements and checks still work offline.') };
    case 'timeout':
      return { code: 'ai_timeout', humanMessage: t('The AI service took too long to answer.'), hint: t('Try again. A shorter question can help.') };
    case 'model':
      return {
        code: 'ai_model',
        humanMessage: t('The model "{model}" is not available with this key.', { model }),
        hint: t('Open AI settings, press Load models and pick another model.'),
      };
    case 'refused':
      return { code: 'ai_refused', humanMessage: t('The assistant could not answer that request.'), hint: t('Rephrase the question about your board or wiring.') };
    case 'bad_request':
      return {
        code: 'ai_error',
        humanMessage: t('{provider} rejected the request: {msg}', { provider: name, msg: e.message.slice(0, 300) }),
        hint: t('Try again. If it repeats, pick another model in AI settings.'),
      };
    default:
      return { code: 'ai_error', humanMessage: t('The AI service returned an error ({status}).', { status: e.status ?? '?' }), hint: t('Try again in a moment.') };
  }
}
