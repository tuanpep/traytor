import { z } from 'zod';

export const LLMProviderSchema = z.enum(['anthropic', 'openai', 'openai-compatible']);

export const AgentConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  shell: z.enum(['bash', 'powershell']).default('bash'),
  env: z.record(z.string(), z.string()).default({}),
  timeout: z.number().default(300_000),
});

const TemplatesConfigSchema = z.object({
  customDir: z.string().optional(),
});

const AnthropicConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(1).default(0),
  baseURL: z.string().optional(),
});

const OpenAIConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().default('gpt-4o'),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(1).default(0),
  baseURL: z.string().optional(),
});

const OpenAICompatibleConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string(),
  baseURL: z.string(),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(1).default(0),
});

const VerificationConfigSchema = z.object({
  autoVerify: z.boolean().default(false),
  maxRetries: z.number().default(3),
});

const AutoCommitConfigSchema = z.object({
  enabled: z.boolean().default(false),
  messageTemplate: z.string().default('traytor: {taskId} - step {step} completed'),
});

const GitConfigSchema = z.object({
  autoCommit: AutoCommitConfigSchema.default({
    enabled: false,
    messageTemplate: 'traytor: {taskId} - step {step} completed',
  }),
  diffRef: z.string().optional(),
});

const WorkflowConfigSchema = z.object({
  default: z.string().default('default'),
});

const CacheConfigSchema = z.object({
  ttlMs: z.number().default(5 * 60 * 1000),
  maxEntries: z.number().default(500),
  persist: z.boolean().default(true),
});

const SecurityConfigSchema = z.object({
  useKeychain: z.boolean().default(true),
  keychainService: z.string().default('com.traytor.app'),
});

const YOLOConfigSchema = z.object({
  skipPlanning: z.boolean().default(false),
  executionAgent: z.string().default('claude-code'),
  planTemplate: z.string().optional(),
  planAgent: z.string().optional(),
  verificationEnabled: z.boolean().default(true),
  verificationAgent: z.string().optional(),
  verificationSeverity: z
    .array(z.enum(['critical', 'major', 'minor']))
    .default(['critical', 'major']),
  verificationTemplate: z.string().optional(),
  reviewAgent: z.string().optional(),
  reviewTemplate: z.string().optional(),
  reviewCategories: z.array(z.string()).optional(),
  autoCommit: z.boolean().default(false),
  commitMessage: z.string().default('auto: complete phase {phase}'),
  maxRetriesPerPhase: z.number().default(3),
  timeout: z.number().optional(),
});

const MCPServerConfigSchema = z.object({
  name: z.string(),
  url: z.string(),
  apiKey: z.string().optional(),
});

const MCPConfigSchema = z.object({
  servers: z.array(MCPServerConfigSchema).default([]),
});

const ModelProfileSchema = z.object({
  provider: LLMProviderSchema,
  model: z.string(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
});

const ModelProfilesSchema = z.object({
  balanced: ModelProfileSchema.optional(),
  frontier: ModelProfileSchema.optional(),
  custom: z.record(z.string(), ModelProfileSchema).optional(),
  stepProfiles: z
    .record(
      z.enum(['planning', 'verification', 'review', 'orchestration', 'iteration']),
      z.string()
    )
    .optional(),
});

export const ConfigSchema = z.object({
  provider: LLMProviderSchema.default('anthropic'),
  anthropic: AnthropicConfigSchema.default({
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0,
  }),
  openai: OpenAIConfigSchema.default({ model: 'gpt-4o', maxTokens: 4096, temperature: 0 }),
  openaiCompatible: OpenAICompatibleConfigSchema.optional(),
  modelProfiles: ModelProfilesSchema.default({}),
  defaultAgent: z.string().optional(),
  agents: z.array(AgentConfigSchema).default([]),
  templates: TemplatesConfigSchema.default({}),
  mcp: MCPConfigSchema.default({ servers: [] }),
  dataDir: z.string().default('~/.traytor/data'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  verification: VerificationConfigSchema.default({ autoVerify: false, maxRetries: 3 }),
  git: GitConfigSchema.default({
    autoCommit: { enabled: false, messageTemplate: 'traytor: {taskId} - step {step} completed' },
  }),
  workflow: WorkflowConfigSchema.default({ default: 'default' }),
  cache: CacheConfigSchema.default({ ttlMs: 5 * 60 * 1000, maxEntries: 500, persist: true }),
  security: SecurityConfigSchema.default({ useKeychain: true, keychainService: 'com.traytor.app' }),
  yolo: YOLOConfigSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type ModelProfile = z.infer<typeof ModelProfileSchema>;
export type ModelProfiles = z.infer<typeof ModelProfilesSchema>;
export type YOLOConfig = z.infer<typeof YOLOConfigSchema>;
