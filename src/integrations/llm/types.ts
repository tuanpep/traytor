/**
 * Core types for the LLM abstraction layer.
 */

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  content: string;
  usage: Usage;
  model: string;
}

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
  temperature?: number;
}

export type StreamCallback = (chunk: string) => void;

/**
 * Interface that all LLM providers must implement.
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Generate a complete response for the given prompt.
   */
  complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;

  /**
   * Stream a response, calling `onChunk` for each text delta.
   * Returns the full response once streaming completes.
   */
  stream(prompt: string, options: LLMOptions & { onChunk: StreamCallback }): Promise<LLMResponse>;
}
