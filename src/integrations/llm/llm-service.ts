import type { Config, ModelProfile } from '../../config/schema.js';
import { SDDError, ErrorCode, LLMProviderError } from '../../utils/errors.js';
import { getLogger } from '../../utils/logger.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { withRetry } from './retry.js';
import type { LLMOptions, LLMProvider, LLMResponse, StreamCallback } from './types.js';

export type StepType = 'planning' | 'verification' | 'review' | 'orchestration' | 'iteration';

/**
 * Multi-provider LLM service that initializes providers from config
 * and routes requests to the configured default provider.
 * Supports model profiles (balanced, frontier, custom) for per-task-type selection.
 */
export class LLMService {
  private providers = new Map<string, LLMProvider>();
  private defaultProviderName: string;
  private modelProfiles = new Map<string, ModelProfile>();
  private stepProfiles: Record<StepType, string> = {
    planning: 'balanced',
    verification: 'balanced',
    review: 'balanced',
    orchestration: 'balanced',
    iteration: 'balanced',
  };
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

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
        baseURL: config.anthropic.baseURL,
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
        baseURL: config.openai.baseURL,
        disableThinking: true,
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

    // Initialize OpenAI-compatible provider (Z.ai, Ollama, OpenRouter, etc.)
    if (config.openaiCompatible) {
      try {
        const compatibleProvider = new OpenAIProvider({
          apiKey: config.openaiCompatible.apiKey,
          model: config.openaiCompatible.model,
          maxTokens: config.openaiCompatible.maxTokens,
          temperature: config.openaiCompatible.temperature,
          baseURL: config.openaiCompatible.baseURL,
          disableThinking: true,
        });
        this.providers.set('openai-compatible', compatibleProvider);
        logger.debug('OpenAI-compatible provider initialized');
      } catch (error) {
        if (error instanceof LLMProviderError) {
          logger.warn(`OpenAI-compatible provider initialization skipped: ${error.message}`);
        } else {
          throw error;
        }
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

    // Register step-level profiles
    if (config.modelProfiles.stepProfiles) {
      for (const [stepType, profileName] of Object.entries(config.modelProfiles.stepProfiles)) {
        const validProfileNames = [
          'balanced',
          'frontier',
          ...Object.keys(config.modelProfiles.custom ?? {}),
        ];
        if (!validProfileNames.includes(profileName)) {
          logger.warn(
            `Step profile "${stepType}" references unknown profile "${profileName}". Available: ${validProfileNames.join(', ')}`
          );
        }
        this.stepProfiles[stepType as StepType] = profileName;
      }
    }

    if (this.modelProfiles.size > 0) {
      logger.debug(`Model profiles registered: ${[...this.modelProfiles.keys()].join(', ')}`);
      logger.debug(`Step profiles: ${JSON.stringify(this.stepProfiles)}`);
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
   * Get the profile name configured for a specific step type.
   */
  getStepProfile(stepType: StepType): string {
    return this.stepProfiles[stepType];
  }

  /**
   * Set the profile for a specific step type.
   */
  setStepProfile(stepType: StepType, profileName: string): void {
    this.stepProfiles[stepType] = profileName;
  }

  /**
   * Get model options for a specific step type (planning, verification, review, etc.)
   */
  getStepOptions(stepType: StepType): LLMOptions {
    const profileName = this.stepProfiles[stepType];
    const profile = this.modelProfiles.get(profileName);
    if (profile) {
      return {
        model: profile.model,
        maxTokens: profile.maxTokens,
        temperature: profile.temperature,
      };
    }
    return {};
  }

  /**
   * Resolve LLM options from a model profile, merging profile settings
   * with any explicitly provided options.
   */
  resolveOptions(options: LLMOptions & { provider?: string; profile?: string } = {}): {
    provider: string;
    llmOptions: LLMOptions;
  } {
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

  async complete(
    prompt: string,
    options?: LLMOptions & { provider?: string; profile?: string }
  ): Promise<LLMResponse> {
    const { provider: providerName, llmOptions } = this.resolveOptions(options);
    const provider = this.getProvider(providerName);
    const response = await withRetry(() => provider.complete(prompt, llmOptions));
    this.totalInputTokens += response.usage.inputTokens;
    this.totalOutputTokens += response.usage.outputTokens;
    return response;
  }

  async stream(
    prompt: string,
    options: LLMOptions & { onChunk: StreamCallback; provider?: string; profile?: string }
  ): Promise<LLMResponse> {
    const { onChunk, profile, provider, ...restOptions } = options;
    const { provider: providerName, llmOptions } = this.resolveOptions({
      ...restOptions,
      profile,
      provider,
    });
    const providerInstance = this.getProvider(providerName);
    const response = await withRetry(() =>
      providerInstance.stream(prompt, { ...llmOptions, onChunk })
    );
    this.totalInputTokens += response.usage.inputTokens;
    this.totalOutputTokens += response.usage.outputTokens;
    return response;
  }

  /**
   * Get cumulative token usage across all LLM calls in this session.
   */
  getTotalUsage(): { inputTokens: number; outputTokens: number; totalTokens: number } {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
    };
  }
}
