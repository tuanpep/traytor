import OpenAI from 'openai';
import { LLMProviderError } from '../../utils/errors.js';
import { getLogger } from '../../utils/logger.js';
import type { LLMProvider, LLMOptions, LLMResponse, StreamCallback } from './types.js';

export interface OpenAIProviderConfig {
  apiKey?: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;

    if (!config.apiKey) {
      throw new LLMProviderError(
        this.name,
        'API key is not configured',
        {
          suggestion:
            'Set the OPENAI_API_KEY environment variable or add openai.apiKey to your config file',
        }
      );
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const logger = getLogger();
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens;
    const temperature = options?.temperature ?? this.config.temperature;

    logger.debug(`OpenAI complete request: model=${model}, maxTokens=${maxTokens}`);

    try {
      const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      };

      if (options?.system) {
        params.messages = [
          { role: 'system', content: options.system },
          { role: 'user', content: prompt },
        ];
      }

      const response = await this.client.chat.completions.create(params);

      const content = response.choices[0]?.message?.content ?? '';

      logger.debug(
        `OpenAI complete response: ${response.usage?.prompt_tokens ?? 0} input tokens, ${response.usage?.completion_tokens ?? 0} output tokens`
      );

      return {
        content,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
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

    logger.debug(`OpenAI stream request: model=${model}, maxTokens=${maxTokens}`);

    try {
      const params: OpenAI.ChatCompletionCreateParamsStreaming = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      };

      if (llmOptions.system) {
        params.messages = [
          { role: 'system', content: llmOptions.system },
          { role: 'user', content: prompt },
        ];
      }

      const stream = await this.client.chat.completions.create(params);
      const chunks: string[] = [];
      let responseModel = model;
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        responseModel = chunk.model;
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          chunks.push(delta);
          onChunk(delta);
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }

      logger.debug(
        `OpenAI stream response: ${inputTokens} input tokens, ${outputTokens} output tokens`
      );

      return {
        content: chunks.join(''),
        usage: {
          inputTokens,
          outputTokens,
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

    if (error instanceof OpenAI.APIError) {
      return new LLMProviderError(
        this.name,
        `${error.status} ${error.message}`,
        {
          status: error.status,
          retryable: error.status === 429 || (error.status ?? 0) >= 500,
        }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return new LLMProviderError(this.name, message);
  }
}
