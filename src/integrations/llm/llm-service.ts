import type { Config, ModelProfile } from '../../config/schema.js';
import { SDDError, ErrorCode, LLMProviderError } from '../../utils/errors.js';
import { getLogger } from '../../utils/logger.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import type { LLMOptions, LLMProvider, LLMResponse, StreamCallback } from './types.js';

/**
 * Multi-provider LLM service that initializes providers from config
 * and routes requests to the configured default provider.
 * Supports model profiles (balanced, frontier, custom) for per-task-type selection.
 */
export class LLMService {
  private providers = new Map<string, LLMProvider>();
  private defaultProviderName: string;
  private modelProfiles = new Map<string, ModelProfile>();

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

    // Initialize OpenAI provider
    try {
      const openaiProvider = new OpenAIProvider({
        apiKey: config.openai.apiKey,
        model: config.openai.model,
        maxTokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      this.providers.set('openai', openaiProvider);
      logger.debug('OpenAI provider initialized');
    } catch (error) {
      if (error instanceof LLMProviderError) {
        logger.warn(`OpenAI provider initialization skipped: ${error.message}`);
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

    // Register model profiles
    if (config.modelProfiles.balanced) {
      this.modelProfiles.set('balanced', config.modelProfiles.balanced);
    }
    if (config.modelProfiles.frontier) {
      this.modelProfiles.set('frontier', config.modelProfiles.frontier);
    }
    for (const [name, profile] of Object.entries(config.modelProfiles.custom ?? {})) {
      this.modelProfiles.set(name, profile);
    }

    if (this.modelProfiles.size > 0) {
      logger.debug(`Model profiles registered: ${[...this.modelProfiles.keys()].join(', ')}`);
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

  /**
   * Get a model profile by name (balanced, frontier, or custom).
   * Returns undefined if the profile doesn't exist.
   */
  getModelProfile(name: string): ModelProfile | undefined {
    return this.modelProfiles.get(name);
  }

  /**
   * Resolve LLM options from a model profile, merging profile settings
   * with any explicitly provided options.
   */
  resolveOptions(
    options: LLMOptions & { provider?: string; profile?: string } = {}
  ): { provider: string; llmOptions: LLMOptions } {
    if (options.profile) {
      const profile = this.modelProfiles.get(options.profile);
      if (profile) {
        return {
          provider: options.provider ?? profile.provider,
          llmOptions: {
            model: options.model ?? profile.model,
            maxTokens: options.maxTokens ?? profile.maxTokens,
            temperature: options.temperature ?? profile.temperature,
            system: options.system,
          },
        };
      }
    }

    return {
      provider: options.provider ?? this.defaultProviderName,
      llmOptions: {
        model: options.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        system: options.system,
      },
    };
  }

  async complete(prompt: string, options?: LLMOptions & { provider?: string; profile?: string }): Promise<LLMResponse> {
    const { provider: providerName, llmOptions } = this.resolveOptions(options);
    const provider = this.getProvider(providerName);
    return provider.complete(prompt, llmOptions);
  }

  async stream(
    prompt: string,
    options: LLMOptions & { onChunk: StreamCallback; provider?: string; profile?: string }
  ): Promise<LLMResponse> {
    const { onChunk, profile, provider, ...restOptions } = options;
    const { provider: providerName, llmOptions } = this.resolveOptions({ ...restOptions, profile, provider });
    const providerInstance = this.getProvider(providerName);
    return providerInstance.stream(prompt, { ...llmOptions, onChunk });
  }
}
