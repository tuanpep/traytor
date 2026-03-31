import type { Config } from '../../config/schema.js';
import { SDDError, ErrorCode, LLMProviderError } from '../../utils/errors.js';
import { getLogger } from '../../utils/logger.js';
import { AnthropicProvider, type AnthropicProviderConfig } from './anthropic-provider.js';
import type { LLMOptions, LLMProvider, LLMResponse, StreamCallback } from './types.js';

/**
 * Multi-provider LLM service that initializes providers from config
 * and routes requests to the configured default provider.
 */
export class LLMService {
  private providers = new Map<string, LLMProvider>();
  private defaultProviderName: string;

  constructor(config: Config) {
    const logger = getLogger();
    this.defaultProviderName = config.provider;

    // Initialize Anthropic provider
    try {
      const anthropicProvider = new AnthropicProvider({
        apiKey: config.anthropic.apiKey,
        model: config.anthropic.model,
        maxTokens: config.anthropic.maxTokens,
        temperature: config.anthropic.temperature,
      });
      this.providers.set('anthropic', anthropicProvider);
      logger.debug('Anthropic provider initialized');
    } catch (error) {
      if (error instanceof LLMProviderError) {
        logger.warn(`Anthropic provider initialization skipped: ${error.message}`);
      } else {
        throw error;
      }
    }

    if (this.providers.size === 0) {
      throw new SDDError(
        ErrorCode.LLM_API_ERROR,
        'No LLM providers could be initialized',
        'Configure at least one provider API key in your config or environment variables'
      );
    }

    if (!this.providers.has(this.defaultProviderName)) {
      logger.warn(
        `Default provider "${this.defaultProviderName}" not available, falling back to first available provider`
      );
      const available = this.providers.keys().next().value;
      if (available) {
        this.defaultProviderName = available;
      }
    }
  }

  getProvider(name?: string): LLMProvider {
    const providerName = name ?? this.defaultProviderName;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new SDDError(
        ErrorCode.LLM_API_ERROR,
        `LLM provider "${providerName}" is not available`,
        `Available providers: ${[...this.providers.keys()].join(', ')}`
      );
    }
    return provider;
  }

  getDefaultProviderName(): string {
    return this.defaultProviderName;
  }

  getAvailableProviders(): string[] {
    return [...this.providers.keys()];
  }

  async complete(prompt: string, options?: LLMOptions & { provider?: string }): Promise<LLMResponse> {
    const provider = this.getProvider(options?.provider);
    if (!options || Object.keys(options).length === 0) {
      return provider.complete(prompt);
    }
    const { provider: _p, ...llmOptions } = options;
    return provider.complete(prompt, llmOptions);
  }

  async stream(
    prompt: string,
    options: LLMOptions & { onChunk: StreamCallback; provider?: string }
  ): Promise<LLMResponse> {
    const provider = this.getProvider(options.provider);
    const { provider: _p, ...streamOptions } = options;
    return provider.stream(prompt, streamOptions as LLMOptions & { onChunk: StreamCallback });
  }
}
