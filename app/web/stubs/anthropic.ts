// Web build only: stands in for app/main/ai/providers/anthropic.ts. A web page cannot hold an API
// key, so the browser demo only uses the free demo relay; this keeps the Anthropic SDK out of the
// bundle. vite.web.config.ts swaps it in; the Electron app never sees it.

import type { AiModelInfo } from '@shared/ai';
import { ProviderError, type AiProvider, type ChatResponse } from '../../main/ai/providers/types';

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic' as const;

  constructor(_apiKey: string) {}

  async chat(): Promise<ChatResponse> {
    throw new ProviderError('not_configured', 'anthropic', 'Own API keys need the desktop app.');
  }

  complete(): Promise<ChatResponse> {
    return this.chat();
  }

  async listModels(): Promise<AiModelInfo[]> {
    throw new ProviderError('not_configured', 'anthropic', 'Own API keys need the desktop app.');
  }
}
