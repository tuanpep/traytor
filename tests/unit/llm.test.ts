import { describe, expect, it, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from '../../src/integrations/llm/anthropic-provider.js';
import { LLMService } from '../../src/integrations/llm/llm-service.js';
import { LLMProviderError } from '../../src/utils/errors.js';
import type { Config } from '../../src/config/schema.js';

// --- AnthropicProvider Tests ---

describe('AnthropicProvider', () => {
  const mockConfig = {
    apiKey: 'test-api-key',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0,
  };

  describe('constructor', () => {
    it('throws LLMProviderError when API key is missing', () => {
      expect(() => new AnthropicProvider({ ...mockConfig, apiKey: undefined })).toThrow(
        LLMProviderError
      );
    });

    it('throws LLMProviderError with empty API key', () => {
      expect(() => new AnthropicProvider({ ...mockConfig, apiKey: '' })).toThrow(LLMProviderError);
    });
  });

  describe('complete', () => {
    let provider: AnthropicProvider;
    let mockCreate: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockCreate = vi.fn();
      provider = new AnthropicProvider(mockConfig);

      // Replace the client's messages.create with a mock
      vi.spyOn(provider as unknown as { client: Anthropic }, 'client', 'get').mockReturnValue({
        messages: {
          create: mockCreate,
        },
      } as unknown as Anthropic);
    });

    it('returns structured LLMResponse with content and usage', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello, world!' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
      });

      const response = await provider.complete('Say hello');

      expect(response).toEqual({
        content: 'Hello, world!',
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'claude-sonnet-4-20250514',
      });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          temperature: 0,
          messages: [{ role: 'user', content: 'Say hello' }],
        })
      );
    });

    it('passes system prompt when provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
      });

      await provider.complete('Prompt', { system: 'You are helpful.' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are helpful.',
        })
      );
    });

    it('allows overriding model, maxTokens, and temperature', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-opus-4-20250514',
      });

      const response = await provider.complete('Prompt', {
        model: 'claude-opus-4-20250514',
        maxTokens: 8192,
        temperature: 0.7,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4-20250514',
          max_tokens: 8192,
          temperature: 0.7,
        })
      );
      expect(response.model).toBe('claude-opus-4-20250514');
    });

    it('joins multiple text blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
      });

      const response = await provider.complete('Prompt');
      expect(response.content).toBe('Part 1Part 2');
    });

    it('wraps APIError in LLMProviderError with status and retry info', async () => {
      const apiError = new Anthropic.APIError(429, {
        type: 'rate_limit_error',
        message: 'Rate limited',
      } as unknown as Anthropic.APIError['error'], 'Rate limited', new Headers());

      mockCreate.mockRejectedValue(apiError);

      await expect(provider.complete('Prompt')).rejects.toThrow(LLMProviderError);
      await expect(provider.complete('Prompt')).rejects.toMatchObject({
        details: expect.objectContaining({
          status: 429,
          retryable: true,
        }),
      });
    });

    it('wraps unknown errors in LLMProviderError', async () => {
      mockCreate.mockRejectedValue(new Error('Something went wrong'));

      await expect(provider.complete('Prompt')).rejects.toThrow(LLMProviderError);
      await expect(provider.complete('Prompt')).rejects.toMatchObject({
        message: expect.stringContaining('Something went wrong'),
      });
    });
  });

  describe('stream', () => {
    let provider: AnthropicProvider;

    beforeEach(() => {
      provider = new AnthropicProvider(mockConfig);
    });

    it('yields chunks via callback and returns full response', async () => {
      const onChunk = vi.fn();
      const chunks = ['Hello', ', ', 'world!'];

      const mockStream = {
        on: vi.fn((event: string, callback: (text: string) => void) => {
          if (event === 'text') {
            for (const chunk of chunks) {
              callback(chunk);
            }
          }
        }),
        finalMessage: vi.fn().mockResolvedValue({
          usage: { input_tokens: 10, output_tokens: 5 },
          model: 'claude-sonnet-4-20250514',
        }),
      };

      vi.spyOn(provider as unknown as { client: Anthropic }, 'client', 'get').mockReturnValue({
        messages: {
          stream: vi.fn().mockReturnValue(mockStream),
        },
      } as unknown as Anthropic);

      const response = await provider.stream('Say hello', { onChunk });

      expect(onChunk).toHaveBeenCalledTimes(3);
      expect(onChunk).toHaveBeenCalledWith('Hello');
      expect(onChunk).toHaveBeenCalledWith(', ');
      expect(onChunk).toHaveBeenCalledWith('world!');
      expect(response).toEqual({
        content: 'Hello, world!',
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'claude-sonnet-4-20250514',
      });
    });

    it('passes system prompt when streaming', async () => {
      const mockStream = {
        on: vi.fn(),
        finalMessage: vi.fn().mockResolvedValue({
          usage: { input_tokens: 10, output_tokens: 5 },
          model: 'claude-sonnet-4-20250514',
        }),
      };

      const mockClient = {
        messages: {
          stream: vi.fn().mockReturnValue(mockStream),
        },
      };

      vi.spyOn(provider as unknown as { client: Anthropic }, 'client', 'get').mockReturnValue(
        mockClient as unknown as Anthropic
      );

      await provider.stream('Prompt', { onChunk: vi.fn(), system: 'You are helpful.' });

      expect(mockClient.messages.stream).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are helpful.',
          stream: true,
        })
      );
    });

    it('wraps stream errors in LLMProviderError', async () => {
      const apiError = new Anthropic.APIError(500, {
        type: 'server_error',
        message: 'Internal error',
      } as unknown as Anthropic.APIError['error'], 'Internal error', new Headers());

      const mockClient = {
        messages: {
          stream: vi.fn().mockRejectedValue(apiError),
        },
      };

      vi.spyOn(provider as unknown as { client: Anthropic }, 'client', 'get').mockReturnValue(
        mockClient as unknown as Anthropic
      );

      await expect(
        provider.stream('Prompt', { onChunk: vi.fn() })
      ).rejects.toThrow(LLMProviderError);
    });
  });
});

// --- LLMService Tests ---

describe('LLMService', () => {
  const createConfig = (overrides?: Partial<Config>): Config => ({
    provider: 'anthropic',
    anthropic: {
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0,
    },
    openai: {
      model: 'gpt-4o',
      maxTokens: 4096,
      temperature: 0,
    },
    modelProfiles: {},
    agents: [],
    templates: {},
    mcp: { servers: [] },
    dataDir: '~/.sdd-tool/data',
    logLevel: 'info',
    verification: { autoVerify: false, maxRetries: 3 },
    ...overrides,
  });

  describe('constructor', () => {
    it('initializes Anthropic provider from config', () => {
      const service = new LLMService(createConfig());
      expect(service.getAvailableProviders()).toContain('anthropic');
      expect(service.getDefaultProviderName()).toBe('anthropic');
    });

    it('throws when no providers can be initialized', () => {
      expect(() => new LLMService(createConfig({ anthropic: { apiKey: undefined, model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0 } }))).toThrow();
    });

    it('falls back to available provider when default is not configured', () => {
      // OpenAI is not yet implemented, so only Anthropic is available
      const service = new LLMService(createConfig({ provider: 'openai' }));
      // Since openai provider isn't implemented, it should fall back to anthropic
      expect(service.getDefaultProviderName()).toBe('anthropic');
    });
  });

  describe('getProvider', () => {
    it('returns the default provider when no name specified', () => {
      const service = new LLMService(createConfig());
      const provider = service.getProvider();
      expect(provider.name).toBe('anthropic');
    });

    it('returns named provider', () => {
      const service = new LLMService(createConfig());
      const provider = service.getProvider('anthropic');
      expect(provider.name).toBe('anthropic');
    });

    it('throws for unavailable provider', () => {
      const service = new LLMService(createConfig());
      expect(() => service.getProvider('nonexistent')).toThrow();
    });
  });

  describe('complete', () => {
    it('delegates to the provider', async () => {
      const service = new LLMService(createConfig());
      const provider = service.getProvider('anthropic');

      const mockResponse = {
        content: 'Test response',
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'claude-sonnet-4-20250514',
      };

      vi.spyOn(provider, 'complete').mockResolvedValue(mockResponse);

      const result = await service.complete('Test prompt');
      expect(result).toEqual(mockResponse);
      expect(provider.complete).toHaveBeenCalledWith('Test prompt', expect.any(Object));
    });

    it('passes options through to provider', async () => {
      const service = new LLMService(createConfig());
      const provider = service.getProvider('anthropic');

      vi.spyOn(provider, 'complete').mockResolvedValue({
        content: 'Response',
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'claude-sonnet-4-20250514',
      });

      await service.complete('Prompt', {
        model: 'claude-opus-4-20250514',
        maxTokens: 8192,
        provider: 'anthropic',
      });

      expect(provider.complete).toHaveBeenCalledWith(
        'Prompt',
        expect.objectContaining({
          model: 'claude-opus-4-20250514',
          maxTokens: 8192,
        })
      );
    });
  });

  describe('stream', () => {
    it('delegates streaming to the provider', async () => {
      const service = new LLMService(createConfig());
      const provider = service.getProvider('anthropic');
      const onChunk = vi.fn();

      const mockResponse = {
        content: 'Streamed response',
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'claude-sonnet-4-20250514',
      };

      vi.spyOn(provider, 'stream').mockResolvedValue(mockResponse);

      const result = await service.stream('Prompt', { onChunk, provider: 'anthropic' });
      expect(result).toEqual(mockResponse);
      expect(provider.stream).toHaveBeenCalledWith('Prompt', expect.objectContaining({ onChunk }));
    });
  });
});
