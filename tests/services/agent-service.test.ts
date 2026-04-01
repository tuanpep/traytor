import { describe, expect, it } from 'vitest';
import { AgentService } from '../../src/services/agent-service.js';
import { ConfigSchema } from '../../src/config/schema.js';

function createTestConfig(overrides: Record<string, unknown> = {}) {
  return ConfigSchema.parse({
    provider: 'anthropic',
    anthropic: { model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0 },
    openai: { model: 'gpt-4o', maxTokens: 4096, temperature: 0 },
    defaultAgent: 'claude-code',
    agents: [
      {
        name: 'claude-code',
        command: 'claude',
        args: ['--dangerously-skip-permissions'],
        shell: 'bash',
        env: {},
        timeout: 300_000,
      },
    ],
    ...overrides,
  });
}

describe('AgentService', () => {
  describe('resolveAgentConfig', () => {
    it('returns configured agent by name', () => {
      const service = new AgentService(createTestConfig());
      const config = service.resolveAgentConfig('claude-code');
      expect(config.name).toBe('claude-code');
      expect(config.command).toBe('claude');
      expect(config.args).toContain('--dangerously-skip-permissions');
    });

    it('strips --dangerously-skip-permissions in safe mode', () => {
      const service = new AgentService(createTestConfig());
      const config = service.resolveAgentConfig('claude-code', true);
      expect(config.name).toBe('claude-code');
      expect(config.args).not.toContain('--dangerously-skip-permissions');
    });

    it('safe mode has no effect when agent has no dangerous args', () => {
      const service = new AgentService(
        createTestConfig({
          agents: [
            {
              name: 'safe-agent',
              command: 'claude',
              args: ['-p', 'prompt'],
              shell: 'bash',
              env: {},
              timeout: 300_000,
            },
          ],
          defaultAgent: 'safe-agent',
        })
      );
      const resolved = service.resolveAgentConfig('safe-agent', true);
      expect(resolved.args).toEqual(['-p', 'prompt']);
    });

    it('falls back to first configured agent when name not found', () => {
      const service = new AgentService(createTestConfig());
      const config = service.resolveAgentConfig('nonexistent');
      expect(config.name).toBe('claude-code');
    });

    it('returns default config when no agents configured', () => {
      const service = new AgentService(
        createTestConfig({ agents: [], defaultAgent: undefined })
      );
      const resolved = service.resolveAgentConfig();
      expect(resolved.name).toBe('claude-code');
      expect(resolved.args).toContain('--dangerously-skip-permissions');
    });
  });

  describe('formatMCPToolsForPrompt', () => {
    it('returns empty string when no MCP tools loaded', () => {
      const service = new AgentService(createTestConfig());
      expect(service.formatMCPToolsForPrompt()).toBe('');
    });
  });
});
