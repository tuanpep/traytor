import Anthropic from '@anthropic-ai/sdk';
import { LLMProviderError } from '../../utils/errors.js';
import { getLogger } from '../../utils/logger.js';
import type { LLMProvider, LLMOptions, LLMResponse, StreamCallback } from './types.js';

export interface AnthropicProviderConfig {
  apiKey?: string;
  model: string;
  maxTokens: number;
  temperature: number;
  baseURL?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private config: AnthropicProviderConfig;

  constructor(config: AnthropicProviderConfig) {
    this.config = config;

    if (!config.apiKey) {
      throw new LLMProviderError(this.name, 'API key is not configured', {
        suggestion:
          'Set the ANTHROPIC_API_KEY environment variable or add anthropic.apiKey to your config file',
      });
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const logger = getLogger();
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens;
    const temperature = options?.temperature ?? this.config.temperature;

    logger.debug(`Anthropic complete request: model=${model}, maxTokens=${maxTokens}`);

    try {
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      };

      if (options?.system) {
        params.system = options.system;
      }

      const response = await this.client.messages.create(params);

      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      logger.debug(
        `Anthropic complete response: ${response.usage.input_tokens} input tokens, ${response.usage.output_tokens} output tokens`
      );

      return {
        content,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: response.model,
      };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async stream(
    prompt: string,
    options: LLMOptions & { onChunk: StreamCallback }
  ): Promise<LLMResponse> {
    const logger = getLogger();
    const { onChunk, ...llmOptions } = options;
    const model = llmOptions.model ?? this.config.model;
    const maxTokens = llmOptions.maxTokens ?? this.config.maxTokens;
    const temperature = llmOptions.temperature ?? this.config.temperature;

    logger.debug(`Anthropic stream request: model=${model}, maxTokens=${maxTokens}`);

    try {
      const params: Anthropic.MessageStreamParams = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      };

      if (llmOptions.system) {
        params.system = llmOptions.system;
      }

      const stream = this.client.messages.stream(params);
      const chunks: string[] = [];
      let responseModel = model;

      stream.on('text', (text) => {
        chunks.push(text);
        onChunk(text);
      });

      const finalMessage = await stream.finalMessage();

      responseModel = finalMessage.model;

      logger.debug(
        `Anthropic stream response: ${finalMessage.usage.input_tokens} input tokens, ${finalMessage.usage.output_tokens} output tokens`
      );

      return {
        content: chunks.join(''),
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
        model: responseModel,
      };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  private wrapError(error: unknown): LLMProviderError {
    if (error instanceof LLMProviderError) {
      return error;
    }

    if (error instanceof Anthropic.APIError) {
      return new LLMProviderError(this.name, `${error.status} ${error.message}`, {
        status: error.status,
        retryable: error.status === 429 || error.status >= 500,
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    return new LLMProviderError(this.name, message);
  }
}
