/**
 * Core types for the MCP (Model Context Protocol) client.
 */

export interface MCPServerConfig {
  name: string;
  url: string;
  apiKey?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolResult {
  content: string;
  isError?: boolean;
}

export interface MCPListToolsResponse {
  tools: MCPTool[];
}
