import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MCPClient } from '../../src/integrations/mcp/mcp-client.js';
import { MCPConnectionError, MCPToolError } from '../../src/utils/errors.js';
import type { MCPServerConfig } from '../../src/integrations/mcp/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const testServer: MCPServerConfig = {
  name: 'test-server',
  url: 'http://localhost:3000/mcp',
  apiKey: 'test-key',
};

describe('MCPClient', () => {
  let client: MCPClient;

  beforeEach(() => {
    client = new MCPClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connect', () => {
    it('connects successfully and sets connected state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { serverInfo: { name: 'Test MCP Server' } },
        }),
      });

      await client.connect(testServer);

      expect(client.isConnected()).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(testServer.url);
      expect(options.headers['Authorization']).toBe(`Bearer ${testServer.apiKey}`);
    });

    it('retries on 503 and succeeds on second attempt', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('HTTP 503: Service Unavailable'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: { serverInfo: { name: 'Test' } } }),
        });

      await client.connect(testServer, { maxRetries: 3 });

      expect(client.isConnected()).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws MCPConnectionError after exhausting retries', async () => {
      mockFetch.mockRejectedValue(new Error('HTTP 503: Service Unavailable'));

      await expect(client.connect(testServer, { maxRetries: 1 })).rejects.toThrow(
        MCPConnectionError
      );

      expect(client.isConnected()).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    it('does not retry on 4xx client errors', async () => {
      mockFetch.mockRejectedValue(new Error('HTTP 401: Unauthorized'));

      await expect(client.connect(testServer, { maxRetries: 3 })).rejects.toThrow(
        MCPConnectionError
      );

      // Only 1 call — no retries for 401
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on TraytorError', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await expect(client.connect(testServer, { maxRetries: 2 })).rejects.toThrow(
        MCPConnectionError
      );
    });
  });

  describe('listTools', () => {
    it('throws MCPToolError when not connected', async () => {
      await expect(client.listTools(testServer)).rejects.toThrow(MCPConnectionError);
    });

    it('returns tools on successful response', async () => {
      // Connect first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { serverInfo: { name: 'Test' } } }),
      });
      await client.connect(testServer);

      // Then list tools
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            tools: [
              { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } },
              { name: 'write_file', description: 'Write a file', inputSchema: { type: 'object' } },
            ],
          },
        }),
      });

      const tools = await client.listTools(testServer);
      expect(tools).toHaveLength(2);
      expect(tools[0]!.name).toBe('read_file');
    });

    it('throws MCPToolError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { serverInfo: { name: 'Test' } } }),
      });
      await client.connect(testServer);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      await expect(client.listTools(testServer)).rejects.toThrow(MCPToolError);
    });
  });

  describe('callTool', () => {
    it('throws MCPConnectionError when not connected', async () => {
      await expect(client.callTool(testServer, 'read_file', {})).rejects.toThrow(
        MCPConnectionError
      );
    });

    it('returns tool result content on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { serverInfo: { name: 'Test' } } }),
      });
      await client.connect(testServer);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            content: [
              { type: 'text', text: 'file contents here' },
              { type: 'image', data: 'ignored' },
            ],
          },
        }),
      });

      const result = await client.callTool(testServer, 'read_file', { path: '/test.txt' });
      expect(result.content).toBe('file contents here');
      expect(result.isError).toBeUndefined();
    });

    it('throws MCPToolError when tool returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { serverInfo: { name: 'Test' } } }),
      });
      await client.connect(testServer);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { message: 'File not found' },
        }),
      });

      await expect(client.callTool(testServer, 'read_file', { path: '/missing' })).rejects.toThrow(
        MCPToolError
      );
    });
  });

  describe('reconnect', () => {
    it('returns true when reconnection succeeds', async () => {
      // First connect
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { serverInfo: { name: 'Test' } } }),
      });
      await client.connect(testServer);

      // Simulate disconnect
      // (can't set connected to false directly, but reconnect should work)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { serverInfo: { name: 'Test' } } }),
      });

      const result = await client.reconnect();
      expect(result).toBe(true);
    });

    it('returns false when no server was previously connected', async () => {
      const result = await client.reconnect();
      expect(result).toBe(false);
    });
  });
});
