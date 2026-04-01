import chalk from 'chalk';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import inquirer from 'inquirer';
import fs from 'node:fs';
import type { Config } from '../config/schema.js';
import { SecureStorage } from '../utils/secure-storage.js';
import { isKeychainAvailable, getConfigDir } from '../utils/platform.js';

const PROVIDERS = ['anthropic', 'openai', 'openai-compatible'] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  'openai-compatible': 'OpenAI Compatible',
};

export function runConfigCommand(config: Config): void {
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}

export async function runConfigSwitch(): Promise<void> {
  console.log('');
  console.log(chalk.bold.cyan('  Switch Provider'));
  console.log('');

  const providerAnswer = await inquirer.prompt({
    type: 'select',
    name: 'provider',
    message: 'Select your LLM provider:',
    choices: [
      { name: 'Anthropic (Claude)', value: 'anthropic' },
      { name: 'OpenAI (GPT)', value: 'openai' },
      { name: 'OpenAI Compatible (Z.ai, Ollama, OpenRouter, etc.)', value: 'openai-compatible' },
    ],
  });

  const provider = providerAnswer.provider as Provider;

  const secureStorage = new SecureStorage();
  const existingKey = await secureStorage.getApiKey(provider);

  if (!existingKey) {
    const apiKeyAnswer = await inquirer.prompt({
      type: 'password',
      name: 'apiKey',
      message: `Enter your ${PROVIDER_LABELS[provider]} API key:`,
      mask: '*',
      validate: (input: string) => input.trim().length > 0 || 'API key is required',
    });

    const keychainAvailable = isKeychainAvailable();
    if (!keychainAvailable) {
      console.log(chalk.yellow('System keychain unavailable. Using encrypted file storage.'));
    }

    await secureStorage.storeApiKey(provider, apiKeyAnswer.apiKey);
    console.log(chalk.green(`  ✓ API key stored securely`));
  } else {
    console.log(chalk.green(`  ✓ Using existing API key (${existingKey.slice(0, 8)}...)`));
  }

  // Update user config
  const configDir = getConfigDir();
  const configPath = `${configDir}/config.yaml`;
  const existingConfig = readYamlFile(configPath);

  const updatedConfig = { ...existingConfig, provider };
  writeYamlFile(configPath, updatedConfig);

  console.log(chalk.green(`  ✓ Switched to ${chalk.bold(PROVIDER_LABELS[provider])}`));
  console.log('');
}

export async function runConfigSetKey(provider: string, apiKey: string): Promise<void> {
  const validProviders = ['anthropic', 'openai', 'openai-compatible'];
  if (!validProviders.includes(provider)) {
    console.error(chalk.red(`Invalid provider: ${provider}`));
    console.log(chalk.dim(`Valid providers: ${validProviders.join(', ')}`));
    process.exit(1);
  }

  const secureStorage = new SecureStorage();

  if (!isKeychainAvailable()) {
    console.log(chalk.yellow('System keychain not available. Using encrypted file storage.'));
  }

  try {
    await secureStorage.storeApiKey(provider, apiKey);
    console.log(chalk.green(`API key for ${chalk.bold(provider)} stored securely.`));

    // Verify it can be retrieved
    const retrieved = await secureStorage.getApiKey(provider);
    if (retrieved) {
      console.log(chalk.dim(`Key verified (starts with: ${retrieved.slice(0, 8)}...)`));
    } else {
      console.log(chalk.yellow('Warning: Key was stored but could not be verified.'));
    }
  } catch (error) {
    console.error(
      chalk.red(
        `Failed to store API key: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
}

export async function runConfigGetKey(provider: string): Promise<void> {
  const validProviders = ['anthropic', 'openai', 'openai-compatible'];
  if (!validProviders.includes(provider)) {
    console.error(chalk.red(`Invalid provider: ${provider}`));
    console.log(chalk.dim(`Valid providers: ${validProviders.join(', ')}`));
    process.exit(1);
  }

  const secureStorage = new SecureStorage();
  const apiKey = await secureStorage.getApiKey(provider);

  if (apiKey) {
    console.log(
      `${chalk.bold(provider)} API key: ${chalk.dim(apiKey.slice(0, 8))}${'*'.repeat(Math.max(0, apiKey.length - 8))}`
    );
    console.log(chalk.dim(`Key length: ${apiKey.length} characters`));
  } else {
    console.log(chalk.yellow(`No API key found for ${provider}.`));
    console.log(chalk.dim(`Set one with: traytor config set-key ${provider} <key>`));
    console.log(
      chalk.dim(
        `Or use the environment variable: ${provider === 'anthropic' ? 'TRAYTOR_ANTHROPIC_API_KEY' : provider === 'openai' ? 'TRAYTOR_OPENAI_API_KEY' : 'TRAYTOR_COMPATIBLE_API_KEY'}`
      )
    );
  }
}

export async function runConfigRemoveKey(provider: string): Promise<void> {
  const validProviders = ['anthropic', 'openai', 'openai-compatible'];
  if (!validProviders.includes(provider)) {
    console.error(chalk.red(`Invalid provider: ${provider}`));
    console.log(chalk.dim(`Valid providers: ${validProviders.join(', ')}`));
    process.exit(1);
  }

  const secureStorage = new SecureStorage();
  await secureStorage.deleteApiKey(provider);
  console.log(chalk.green(`API key for ${chalk.bold(provider)} removed.`));
}

function readYamlFile(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return (parseYaml(content) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeYamlFile(filePath: string, config: Record<string, unknown>): void {
  fs.writeFileSync(filePath, stringifyYaml(config), 'utf-8');
}
