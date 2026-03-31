import type { Config } from './schema.js';

export const DEFAULT_CONFIG: Config = {
  provider: 'anthropic',
  anthropic: {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0,
  },
  openai: {
    model: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0,
  },
  agents: [],
  dataDir: '~/.sdd-tool/data',
  logLevel: 'info',
  verification: {
    autoVerify: false,
    maxRetries: 3,
  },
};
