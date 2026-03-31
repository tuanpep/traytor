import chalk from 'chalk';
import type { Config } from '../config/schema.js';
import { SecureStorage } from '../utils/secure-storage.js';
import { isKeychainAvailable } from '../utils/platform.js';

export function runConfigCommand(config: Config): void {
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}

export async function runConfigSetKey(
  provider: string,
  apiKey: string,
): Promise<void> {
  const validProviders = ['anthropic', 'openai'];
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
    console.error(chalk.red(`Failed to store API key: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

export async function runConfigGetKey(provider: string): Promise<void> {
  const validProviders = ['anthropic', 'openai'];
  if (!validProviders.includes(provider)) {
    console.error(chalk.red(`Invalid provider: ${provider}`));
    console.log(chalk.dim(`Valid providers: ${validProviders.join(', ')}`));
    process.exit(1);
  }

  const secureStorage = new SecureStorage();
  const apiKey = await secureStorage.getApiKey(provider);

  if (apiKey) {
    console.log(`${chalk.bold(provider)} API key: ${chalk.dim(apiKey.slice(0, 8))}${'*'.repeat(Math.max(0, apiKey.length - 8))}`);
    console.log(chalk.dim(`Key length: ${apiKey.length} characters`));
  } else {
    console.log(chalk.yellow(`No API key found for ${provider}.`));
    console.log(chalk.dim(`Set one with: sdd config set-key ${provider} <key>`));
    console.log(chalk.dim(`Or use the environment variable: ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'}`));
  }
}

export async function runConfigRemoveKey(provider: string): Promise<void> {
  const validProviders = ['anthropic', 'openai'];
  if (!validProviders.includes(provider)) {
    console.error(chalk.red(`Invalid provider: ${provider}`));
    console.log(chalk.dim(`Valid providers: ${validProviders.join(', ')}`));
    process.exit(1);
  }

  const secureStorage = new SecureStorage();
  await secureStorage.deleteApiKey(provider);
  console.log(chalk.green(`API key for ${chalk.bold(provider)} removed.`));
}
