import chalk from 'chalk';
import type { Config } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

export interface ModelProfileContext {
  config: Config;
}

export async function runModelProfileList(ctx: ModelProfileContext): Promise<void> {
  const { config } = ctx;
  const profiles = config.modelProfiles || {};

  console.log(chalk.bold('\nModel Profiles\n'));
  console.log(chalk.dim('─'.repeat(50)));

  if (Object.keys(profiles).length === 0) {
    console.log(chalk.dim('No custom profiles configured.\n'));
    console.log('Available default profiles:');
    console.log('  - balanced  (balanced model for general tasks)');
    console.log('  - frontier  (frontier model for complex tasks)\n');
    return;
  }

  const profileEntries = Object.entries(profiles).filter(([key]) => key !== 'stepProfiles') as [
    string,
    { provider: string; model: string; maxTokens?: number; temperature?: number },
  ][];

  for (const [name, profile] of profileEntries) {
    console.log(chalk.cyan(`\n${name}:`));
    console.log(`  Provider:  ${profile.provider}`);
    console.log(`  Model:    ${profile.model}`);
    if (profile.maxTokens) console.log(`  MaxTokens: ${profile.maxTokens}`);
    if (profile.temperature !== undefined) console.log(`  Temp:     ${profile.temperature}`);
  }

  if (profiles.stepProfiles) {
    console.log(chalk.cyan('\nStep Profiles:'));
    for (const [stepType, profileName] of Object.entries(profiles.stepProfiles)) {
      console.log(`  ${stepType}: ${profileName}`);
    }
  }

  console.log('');
}

export async function runModelProfileShow(ctx: ModelProfileContext, name: string): Promise<void> {
  const { config } = ctx;
  const profiles = config.modelProfiles || {};

  const defaultProfiles: Record<string, { provider: string; model: string; description: string }> =
    {
      balanced: {
        provider: config.provider,
        model: config.provider === 'anthropic' ? config.anthropic.model : config.openai.model,
        description: 'Balanced model for general development tasks',
      },
      frontier: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        description: 'Frontier model for complex reasoning and planning',
      },
    };

  if (name === 'stepProfiles') {
    console.log(chalk.bold(`\nStep Profiles\n`));
    console.log(chalk.dim('─'.repeat(50)));
    if (profiles.stepProfiles) {
      for (const [stepType, profileName] of Object.entries(profiles.stepProfiles)) {
        console.log(`  ${stepType}: ${profileName}`);
      }
    } else {
      console.log(chalk.dim('No step profiles configured.'));
    }
    console.log('');
    return;
  }

  const customProfile = (profiles as Record<string, unknown>)[name] as
    | { provider: string; model: string; maxTokens?: number; temperature?: number }
    | undefined;
  if (customProfile && typeof customProfile === 'object' && 'provider' in customProfile) {
    console.log(chalk.bold(`\nModel Profile: ${chalk.cyan(name)}\n`));
    console.log(chalk.dim('─'.repeat(50)));
    console.log(`Provider:    ${customProfile.provider}`);
    console.log(`Model:       ${customProfile.model}`);
    console.log(`MaxTokens:   ${customProfile.maxTokens || 'default'}`);
    console.log(
      `Temperature: ${customProfile.temperature !== undefined ? customProfile.temperature : 'default'}`
    );
    console.log('');
    return;
  }

  const builtInProfile = defaultProfiles[name];
  if (builtInProfile) {
    console.log(chalk.bold(`\nModel Profile: ${chalk.cyan(name)} (built-in)\n`));
    console.log(chalk.dim('─'.repeat(50)));
    console.log(`Description: ${builtInProfile.description}`);
    console.log(`Provider:    ${builtInProfile.provider}`);
    console.log(`Model:       ${builtInProfile.model}`);
    console.log('');
    return;
  }

  console.error(chalk.red(`Profile "${name}" not found.`));
  console.log(chalk.dim('\nAvailable profiles:'));
  console.log('  Built-in: balanced, frontier');
  const customNames = Object.keys(profiles);
  if (customNames.length > 0) {
    console.log(`  Custom:  ${customNames.join(', ')}`);
  }
}

export async function runModelProfileSet(
  ctx: ModelProfileContext,
  taskType: string,
  profileName: string
): Promise<void> {
  const logger = getLogger();
  logger.info(`Setting default profile for ${taskType} to ${profileName}`);

  console.log(chalk.green(`\nProfile for "${taskType}" set to "${profileName}".`));
  console.log(chalk.dim('Note: This feature requires config file support.\n'));
}
