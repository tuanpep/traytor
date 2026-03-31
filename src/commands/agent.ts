import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { AgentConfigSchema, type AgentConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentCommandContext {
  projectConfigDir: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getProjectConfigPath(projectConfigDir: string): string {
  return path.join(projectConfigDir, 'config.yaml');
}

function readProjectConfig(configPath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return (parseYaml(content) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeProjectConfig(configPath: string, config: Record<string, unknown>): void {
  fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');
}

function getAgentsFromConfig(config: Record<string, unknown>): AgentConfig[] {
  const agents = (config.agents ?? []) as unknown[];
  return agents.map((a) => AgentConfigSchema.parse(a));
}

function setAgentsInConfig(config: Record<string, unknown>, agents: AgentConfig[]): Record<string, unknown> {
  return { ...config, agents: agents.map((a) => ({ ...a })) };
}

// ─── list ────────────────────────────────────────────────────────────────────

export function runAgentList(ctx: AgentCommandContext, defaultAgent?: string): void {
  const configPath = getProjectConfigPath(ctx.projectConfigDir);
  const config = readProjectConfig(configPath);
  const agents = getAgentsFromConfig(config);

  if (agents.length === 0) {
    console.log(chalk.dim('No custom agents configured.'));
    console.log(chalk.dim('Add one with: sdd agent add'));
    return;
  }

  console.log(chalk.bold('Configured Agents:'));
  console.log('');

  for (const agent of agents) {
    const isDefault = agent.name === defaultAgent;
    const marker = isDefault ? chalk.green(' (default)') : '';
    console.log(chalk.cyan(`  ${agent.name}${marker}`));
    console.log(chalk.dim(`    command: ${agent.command} ${agent.args.join(' ')}`));
    console.log(chalk.dim(`    shell:   ${agent.shell}`));
    if (Object.keys(agent.env).length > 0) {
      console.log(chalk.dim(`    env:     ${JSON.stringify(agent.env)}`));
    }
    console.log(chalk.dim(`    timeout: ${agent.timeout}ms`));
    console.log('');
  }
}

// ─── add ─────────────────────────────────────────────────────────────────────

export interface AgentAddOptions {
  command: string;
  args?: string[];
  shell?: 'bash' | 'powershell';
  env?: Record<string, string>;
  timeout?: number;
  setDefault?: boolean;
}

export function runAgentAdd(
  ctx: AgentCommandContext,
  name: string,
  options: AgentAddOptions
): void {
  const logger = getLogger();
  const configPath = getProjectConfigPath(ctx.projectConfigDir);

  // Ensure .sdd-tool directory exists
  fs.mkdirSync(ctx.projectConfigDir, { recursive: true });

  const config = readProjectConfig(configPath);
  const agents = getAgentsFromConfig(config);

  // Check for duplicate name
  const existing = agents.find((a) => a.name === name);
  if (existing) {
    console.error(chalk.red(`Agent "${name}" already exists. Use \`sdd agent remove ${name}\` first.`));
    return;
  }

  // Create new agent config
  const newAgent: AgentConfig = {
    name,
    command: options.command,
    args: options.args ?? [],
    shell: options.shell ?? 'bash',
    env: options.env ?? {},
    timeout: options.timeout ?? 300_000,
  };

  // Validate
  const parsed = AgentConfigSchema.safeParse(newAgent);
  if (!parsed.success) {
    console.error(chalk.red('Invalid agent configuration:'));
    for (const issue of parsed.error.issues) {
      console.error(chalk.dim(`  - ${issue.path.join('.')}: ${issue.message}`));
    }
    return;
  }

  agents.push(parsed.data);

  // Set as default if requested
  let defaultAgent = (config.defaultAgent as string) ?? undefined;
  if (options.setDefault) {
    defaultAgent = name;
  }

  const updatedConfig = setAgentsInConfig(config, agents);
  if (defaultAgent) {
    updatedConfig.defaultAgent = defaultAgent;
  }

  writeProjectConfig(configPath, updatedConfig);
  logger.info(`Agent "${name}" added to ${configPath}`);

  console.log(chalk.green(`Agent "${chalk.bold(name)}" added successfully.`));
  if (options.setDefault) {
    console.log(chalk.green(`Set as default agent.`));
  }
  console.log(chalk.dim(`  Config: ${configPath}`));
}

// ─── remove ──────────────────────────────────────────────────────────────────

export function runAgentRemove(ctx: AgentCommandContext, name: string): void {
  const logger = getLogger();
  const configPath = getProjectConfigPath(ctx.projectConfigDir);

  if (!fs.existsSync(configPath)) {
    console.error(chalk.red(`No project config found at ${configPath}`));
    return;
  }

  const config = readProjectConfig(configPath);
  const agents = getAgentsFromConfig(config);
  const index = agents.findIndex((a) => a.name === name);

  if (index === -1) {
    console.error(chalk.red(`Agent "${name}" not found.`));
    console.log(chalk.dim(`Available agents: ${agents.map((a) => a.name).join(', ') || 'none'}`));
    return;
  }

  agents.splice(index, 1);
  const updatedConfig = setAgentsInConfig(config, agents);

  // Clear default if removed agent was default
  if (config.defaultAgent === name) {
    delete updatedConfig.defaultAgent;
  }

  writeProjectConfig(configPath, updatedConfig);
  logger.info(`Agent "${name}" removed from ${configPath}`);

  console.log(chalk.green(`Agent "${chalk.bold(name)}" removed successfully.`));
}

// ─── set-default ─────────────────────────────────────────────────────────────

export function runAgentSetDefault(ctx: AgentCommandContext, name: string): void {
  const logger = getLogger();
  const configPath = getProjectConfigPath(ctx.projectConfigDir);

  if (!fs.existsSync(configPath)) {
    console.error(chalk.red(`No project config found at ${configPath}`));
    return;
  }

  const config = readProjectConfig(configPath);
  const agents = getAgentsFromConfig(config);

  const existing = agents.find((a) => a.name === name);
  if (!existing) {
    console.error(chalk.red(`Agent "${name}" not found.`));
    console.log(chalk.dim(`Available agents: ${agents.map((a) => a.name).join(', ') || 'none'}`));
    return;
  }

  const updatedConfig = { ...config, defaultAgent: name };
  writeProjectConfig(configPath, updatedConfig);
  logger.info(`Default agent set to "${name}"`);

  console.log(chalk.green(`Default agent set to "${chalk.bold(name)}".`));
}
