import { SDDError, ErrorCode } from '../../utils/errors.js';
import { getLogger } from '../../utils/logger.js';
import type { MCPServerConfig, MCPTool, MCPToolResult, MCPListToolsResponse } from './types.js';

/**
 * HTTP-based MCP client for connecting to Model Context Protocol servers.
 * Supports no-auth and API key authentication.
 */
export class MCPClient {
  private logger = getLogger();
  private connected = false;

  /**
   * Connect to an MCP server and verify connectivity.
   */
  async connect(server: MCPServerConfig): Promise<void> {
    this.logger.info(`Connecting to MCP server "${server.name}" at ${server.url}`);

    try {
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

      const data = await response.json() as { result?: { serverInfo?: { name?: string } } };

      if (data.result?.serverInfo?.name) {
        this.logger.info(`Connected to MCP server: ${data.result.serverInfo.name}`);
      }

      this.connected = true;
    } catch (error) {
      this.connected = false;
      if (error instanceof SDDError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new SDDError(
        ErrorCode.LLM_API_ERROR,
        `Failed to connect to MCP server "${server.name}": ${message}`,
        'Check the server URL and API key configuration'
      );
    }
  }

  /**
   * List all available tools from the MCP server.
   */
  async listTools(server: MCPServerConfig): Promise<MCPTool[]> {
    this.ensureConnected(server.name);

    this.logger.debug(`Listing tools from MCP server "${server.name}"`);

    try {
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
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { result?: MCPListToolsResponse };
      const tools = data.result?.tools ?? [];

      this.logger.debug(`MCP server "${server.name}" has ${tools.length} tools`);
      return tools;
    } catch (error) {
      if (error instanceof SDDError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new SDDError(
        ErrorCode.LLM_API_ERROR,
        `Failed to list tools from MCP server "${server.name}": ${message}`,
        'Ensure the MCP server is running and accessible'
      );
    }
  }

  /**
   * Call a specific tool on the MCP server with the given arguments.
   */
  async callTool(server: MCPServerConfig, name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensureConnected(server.name);

    this.logger.debug(`Calling tool "${name}" on MCP server "${server.name}"`);

    try {
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

      const data = await response.json() as {
        result?: {
          content?: Array<{ type: string; text?: string }>;
          isError?: boolean;
        };
        error?: { message: string };
      };

      if (data.error) {
        throw new Error(data.error.message);
      }

      const content = data.result?.content
        ?.filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n') ?? '';

      return {
        content,
        isError: data.result?.isError,
      };
    } catch (error) {
      if (error instanceof SDDError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new SDDError(
        ErrorCode.LLM_API_ERROR,
        `Failed to call tool "${name}" on MCP server "${server.name}": ${message}`,
        'Check the tool name and arguments'
      );
    }
  }

  /**
   * List tools from all configured MCP servers and return them as agent-usable tool definitions.
   */
  async listAllTools(servers: MCPServerConfig[]): Promise<Array<{ server: string; tool: MCPTool }>> {
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

  isConnected(): boolean {
    return this.connected;
  }

  private ensureConnected(serverName: string): void {
    if (!this.connected) {
      throw new SDDError(
        ErrorCode.LLM_API_ERROR,
        `Not connected to MCP server "${serverName}"`,
        'Call connect() before using MCP tools'
      );
    }
  }
}
