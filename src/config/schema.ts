import { z } from 'zod';

export const LLMProviderSchema = z.enum(['anthropic', 'openai']);

export const AgentConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  timeout: z.number().default(300_000),
});

const AnthropicConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(1).default(0),
});

const OpenAIConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().default('gpt-4o'),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(1).default(0),
});

const VerificationConfigSchema = z.object({
  autoVerify: z.boolean().default(false),
  maxRetries: z.number().default(3),
});

export const ConfigSchema = z.object({
  provider: LLMProviderSchema.default('anthropic'),
  anthropic: AnthropicConfigSchema.default({
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0,
  }),
  openai: OpenAIConfigSchema.default({ model: 'gpt-4o', maxTokens: 4096, temperature: 0 }),
  agents: z.array(AgentConfigSchema).default([]),
  dataDir: z.string().default('~/.sdd-tool/data'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  verification: VerificationConfigSchema.default({ autoVerify: false, maxRetries: 3 }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
