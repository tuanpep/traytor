import {
  TraytorError,
  MCPConnectionError,
  MCPToolError,
} from '../../utils/errors.js';
import { getLogger } from '../../utils/logger.js';
import type { MCPServerConfig, MCPTool, MCPToolResult, MCPListToolsResponse } from './types.js';

const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = baseDelayMs * Math.pow(2, attempt);
  const jitter = delay * Math.random() * 0.25;
  return Math.min(delay + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number, retryableStatuses: number[]): boolean {
  return retryableStatuses.includes(status);
}

/**
 * HTTP-based MCP client for connecting to Model Context Protocol servers.
 * Supports no-auth and API key authentication with automatic retry on transient errors.
 */
export class MCPClient {
  private logger = getLogger();
  private connected = false;
  private lastServer?: MCPServerConfig;

  /**
   * Connect to an MCP server and verify connectivity.
   * Retries on transient HTTP errors (429, 5xx) with exponential backoff.
   */
  async connect(server: MCPServerConfig, options?: { maxRetries?: number }): Promise<void> {
    this.logger.info(`Connecting to MCP server "${server.name}" at ${server.url}`);

    const maxRetries = options?.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.tryConnect(server);
        this.connected = true;
        this.lastServer = server;
        return;
      } catch (error) {
        lastError = error;

        if (error instanceof TraytorError) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        const statusMatch = message.match(/HTTP (\d+)/);
        const status = statusMatch ? parseInt(statusMatch[1]!, 10) : 0;

        if (attempt === maxRetries || !isRetryableStatus(status, DEFAULT_RETRY_OPTIONS.retryableStatuses)) {
          break;
        }

        const delay = calculateDelay(attempt, DEFAULT_RETRY_OPTIONS.baseDelayMs, DEFAULT_RETRY_OPTIONS.maxDelayMs);
        this.logger.warn(
          `MCP connect failed (attempt ${attempt + 1}/${maxRetries + 1}, status: ${status || 'unknown'}). Retrying in ${Math.round(delay)}ms...`
        );
        await sleep(delay);
      }
    }

    this.connected = false;
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new MCPConnectionError(server.name, message, { serverUrl: server.url });
  }

  /**
   * Attempt a single connection to the MCP server.
   */
  private async tryConnect(server: MCPServerConfig): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (server.apiKey) {
      headers['Authorization'] = `Bearer ${server.apiKey}`;
    }

    const response = await fetch(server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'traytor',
            version: '1.0.0',
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { result?: { serverInfo?: { name?: string } } };

    if (data.result?.serverInfo?.name) {
      this.logger.info(`Connected to MCP server: ${data.result.serverInfo.name}`);
    }
  }

  /**
   * List all available tools from the MCP server.
   */
  async listTools(server: MCPServerConfig): Promise<MCPTool[]> {
    this.ensureConnected(server.name);

    this.logger.debug(`Listing tools from MCP server "${server.name}"`);

    try {
      const headers = this.buildHeaders(server);

      const response = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { result?: MCPListToolsResponse };
      const tools = data.result?.tools ?? [];

      this.logger.debug(`MCP server "${server.name}" has ${tools.length} tools`);
      return tools;
    } catch (error) {
      if (error instanceof TraytorError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new MCPToolError(server.name, 'listTools', message);
    }
  }

  /**
   * Call a specific tool on the MCP server with the given arguments.
   */
  async callTool(
    server: MCPServerConfig,
    name: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    this.ensureConnected(server.name);

    this.logger.debug(`Calling tool "${name}" on MCP server "${server.name}"`);

    try {
      const headers = this.buildHeaders(server);

      const response = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name,
            arguments: args,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        result?: {
          content?: Array<{ type: string; text?: string }>;
          isError?: boolean;
        };
        error?: { message: string };
      };

      if (data.error) {
        throw new Error(data.error.message);
      }

      const content =
        data.result?.content
          ?.filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('\n') ?? '';

      return {
        content,
        isError: data.result?.isError,
      };
    } catch (error) {
      if (error instanceof TraytorError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new MCPToolError(server.name, name, message);
    }
  }

  /**
   * List tools from all configured MCP servers and return them as agent-usable tool definitions.
   */
  async listAllTools(
    servers: MCPServerConfig[]
  ): Promise<Array<{ server: string; tool: MCPTool }>> {
    const allTools: Array<{ server: string; tool: MCPTool }> = [];

    for (const server of servers) {
      try {
        await this.connect(server);
        const tools = await this.listTools(server);
        for (const tool of tools) {
          allTools.push({ server: server.name, tool });
        }
      } catch (error) {
        this.logger.warn(`Failed to connect to MCP server "${server.name}", skipping`);
      }
    }

    this.logger.info(`Discovered ${allTools.length} MCP tools across ${servers.length} servers`);
    return allTools;
  }

  /**
   * Attempt to reconnect to the last connected server.
   * Returns true if reconnection succeeded.
   */
  async reconnect(options?: { maxRetries?: number }): Promise<boolean> {
    if (!this.lastServer) {
      return false;
    }

    try {
      this.connected = false;
      await this.connect(this.lastServer, options);
      return true;
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private ensureConnected(serverName: string): void {
    if (!this.connected) {
      throw new MCPConnectionError(
        serverName,
        'Not connected. Call connect() before using MCP tools.'
      );
    }
  }

  private buildHeaders(server: MCPServerConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (server.apiKey) {
      headers['Authorization'] = `Bearer ${server.apiKey}`;
    }

    return headers;
  }
}
