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
  modelProfiles: {},
  defaultAgent: undefined,
  agents: [],
  templates: {},
  mcp: {
    servers: [],
  },
  dataDir: '~/.traytor/data',
  logLevel: 'info',
  verification: {
    autoVerify: false,
    maxRetries: 3,
  },
  git: {
    autoCommit: {
      enabled: false,
      messageTemplate: 'traytor: {taskId} - step {step} completed',
    },
  },
  workflow: {
    default: 'default',
  },
  cache: {
    ttlMs: 5 * 60 * 1000,
    maxEntries: 500,
    persist: true,
  },
  security: {
    useKeychain: true,
    keychainService: 'com.traytor.app',
  },
};
