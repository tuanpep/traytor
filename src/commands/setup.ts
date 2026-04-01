import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import chalk from 'chalk';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import inquirer from 'inquirer';
import { SecureStorage } from '../utils/secure-storage.js';
import {
  isKeychainAvailable,
  getConfigDir,
  getDataDir,
  getEncryptedKeysDir,
} from '../utils/platform.js';

type Provider = 'anthropic' | 'openai' | 'openai-compatible';

interface SetupAnswers {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  defaultAgent?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  setupProject: boolean;
  agentCommand?: string;
  agentArgs?: string;
}

const PROVIDER_CONFIG: Record<
  Provider,
  {
    label: string;
    models: { name: string; value: string }[];
    keyPrompt: string;
    needsBaseUrl: boolean;
  }
> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    models: [
      { name: 'claude-sonnet-4-20250514 (Recommended)', value: 'claude-sonnet-4-20250514' },
      { name: 'claude-opus-4-20250514', value: 'claude-opus-4-20250514' },
      { name: 'claude-haiku-3-20250307', value: 'claude-haiku-3-20250307' },
    ],
    keyPrompt: 'Enter your Anthropic API key:',
    needsBaseUrl: false,
  },
  openai: {
    label: 'OpenAI (GPT)',
    models: [
      { name: 'gpt-4o (Recommended)', value: 'gpt-4o' },
      { name: 'gpt-4o-mini', value: 'gpt-4o-mini' },
      { name: 'gpt-4-turbo', value: 'gpt-4-turbo' },
    ],
    keyPrompt: 'Enter your OpenAI API key:',
    needsBaseUrl: false,
  },
  'openai-compatible': {
    label: 'OpenAI Compatible (Z.ai, Ollama, OpenRouter, etc.)',
    models: [],
    keyPrompt: 'Enter your API key:',
    needsBaseUrl: true,
  },
};

export async function runSetupCommand(options: {
  project?: boolean;
  provider?: string;
  apiKey?: string;
}): Promise<void> {
  const configDir = getConfigDir();
  const dataDir = getDataDir();
  const keysDir = getEncryptedKeysDir();
  const userConfigPath = path.join(configDir, 'config.yaml');
  const projectConfigDir = path.join(process.cwd(), '.traytor');
  const projectConfigPath = path.join(projectConfigDir, 'config.yaml');

  console.log('');
  console.log(chalk.bold.cyan('  Traytor Setup'));
  console.log(chalk.dim('  Configure your spec-driven development environment'));
  console.log('');

  // Step 1: Create directories
  console.log(chalk.bold('Step 1/4: Creating directories...'));
  const dirs = [
    configDir,
    dataDir,
    path.join(dataDir, 'tasks'),
    path.join(dataDir, 'workflows'),
    keysDir,
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      if (!isWindows()) {
        fs.chmodSync(dir, 0o700);
      }
      console.log(chalk.green(`  ✓ Created ${dir}`));
    } else {
      console.log(chalk.dim(`  ✓ Exists ${dir}`));
    }
  }
  console.log('');

  // Step 2: Interactive configuration (skip if non-interactive mode)
  let answers: SetupAnswers;

  if (options.provider && options.apiKey) {
    // Non-interactive mode
    answers = {
      provider: options.provider as Provider,
      apiKey: options.apiKey,
      model: options.provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
      logLevel: 'info',
      setupProject: options.project ?? false,
    };
  } else {
    // Interactive mode
    console.log(chalk.bold('Step 2/4: Configure LLM provider...'));
    console.log('');

    const providerAnswer = await inquirer.prompt({
      type: 'select',
      name: 'provider',
      message: 'Select your LLM provider:',
      choices: [
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI (GPT)', value: 'openai' },
        {
          name: 'OpenAI Compatible (Z.ai, Ollama, OpenRouter, etc.)',
          value: 'openai-compatible',
        },
      ],
      default: 'anthropic',
    });

    const provider = providerAnswer.provider as Provider;
    const config = PROVIDER_CONFIG[provider];

    const apiKeyAnswer = await inquirer.prompt({
      type: 'password',
      name: 'apiKey',
      message: config.keyPrompt,
      mask: '*',
      validate: (input: string) => input.trim().length > 0 || 'API key is required',
    });

    let model: string;
    let baseUrl: string | undefined;

    if (config.models.length > 0) {
      const modelAnswer = await inquirer.prompt({
        type: 'select',
        name: 'model',
        message: 'Select default model:',
        choices: config.models,
        default: config.models[0]!.value,
      });
      model = modelAnswer.model;
    } else {
      const modelAnswer = await inquirer.prompt({
        type: 'input',
        name: 'model',
        message: 'Enter model name:',
        validate: (input: string) => input.trim().length > 0 || 'Model name is required',
      });
      model = modelAnswer.model;
    }

    if (config.needsBaseUrl) {
      const baseUrlAnswer = await inquirer.prompt({
        type: 'input',
        name: 'baseUrl',
        message: 'Enter base URL:',
        validate: (input: string) => input.trim().length > 0 || 'Base URL is required',
      });
      baseUrl = baseUrlAnswer.baseUrl;
    }

    // Optional agent configuration
    const agentAnswer = await inquirer.prompt({
      type: 'confirm',
      name: 'configureAgent',
      message: 'Configure a default AI agent (e.g., Claude Code)?',
      default: true,
    });

    let defaultAgent: string | undefined;
    let agentCommand: string | undefined;
    let agentArgs: string | undefined;

    if (agentAnswer.configureAgent) {
      const nameAnswer = await inquirer.prompt({
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        default: 'claude-code',
      });
      const commandAnswer = await inquirer.prompt({
        type: 'input',
        name: 'command',
        message: 'Agent command:',
        default: 'claude',
      });
      const argsAnswer = await inquirer.prompt({
        type: 'input',
        name: 'args',
        message: 'Agent arguments (space-separated):',
        default: '--dangerously-skip-permissions',
      });
      defaultAgent = nameAnswer.name;
      agentCommand = commandAnswer.command;
      agentArgs = argsAnswer.args;
    }

    // Log level
    const logLevelAnswer = await inquirer.prompt({
      type: 'select',
      name: 'logLevel',
      message: 'Log level:',
      choices: [
        { name: 'info (Recommended)', value: 'info' },
        { name: 'debug', value: 'debug' },
        { name: 'warn', value: 'warn' },
        { name: 'error', value: 'error' },
        { name: 'silent', value: 'silent' },
      ],
      default: 'info',
    });

    // Project config
    let setupProject = options.project ?? false;
    if (!options.project) {
      const projectAnswer = await inquirer.prompt({
        type: 'confirm',
        name: 'setupProject',
        message: 'Create project config at .traytor/config.yaml?',
        default: true,
      });
      setupProject = projectAnswer.setupProject;
    }

    answers = {
      provider,
      apiKey: apiKeyAnswer.apiKey,
      model,
      baseUrl,
      logLevel: logLevelAnswer.logLevel,
      setupProject,
      defaultAgent,
      agentCommand,
      agentArgs,
    };
  }

  console.log('');

  // Step 3: Store API key and write config
  console.log(chalk.bold('Step 3/4: Saving configuration...'));

  const secureStorage = new SecureStorage();
  const keychainAvailable = isKeychainAvailable();

  if (!keychainAvailable) {
    console.log(chalk.yellow('  Note: System keychain unavailable. Using encrypted file storage.'));
  }

  await secureStorage.storeApiKey(answers.provider, answers.apiKey);
  console.log(
    chalk.green(`  ✓ ${PROVIDER_CONFIG[answers.provider].label} API key stored securely`)
  );

  // Build user config — only the selected provider
  const userConfig: Record<string, unknown> = {
    provider: answers.provider,
    logLevel: answers.logLevel,
  };

  const providerSection: Record<string, unknown> = { model: answers.model };
  if (answers.provider === 'openai-compatible' && answers.baseUrl) {
    providerSection.baseURL = answers.baseUrl;
  }

  if (answers.provider === 'openai-compatible') {
    userConfig.openaiCompatible = providerSection;
  } else {
    userConfig[answers.provider] = providerSection;
  }

  // Write user config (replace provider section entirely to avoid stale data)
  const existingUserConfig = readYamlFile(userConfigPath);
  const mergedUserConfig = deepMerge(existingUserConfig, userConfig);
  writeYamlFile(userConfigPath, mergedUserConfig);
  console.log(chalk.green(`  ✓ User config written to ${userConfigPath}`));

  // Write project config if requested
  if (answers.setupProject) {
    if (!fs.existsSync(projectConfigDir)) {
      fs.mkdirSync(projectConfigDir, { recursive: true });
    }

    const projectConfig: Record<string, unknown> = {
      provider: answers.provider,
    };

    const projProviderSection: Record<string, unknown> = { model: answers.model };
    if (answers.provider === 'openai-compatible' && answers.baseUrl) {
      projProviderSection.baseURL = answers.baseUrl;
    }

    if (answers.provider === 'openai-compatible') {
      projectConfig.openaiCompatible = projProviderSection;
    } else {
      projectConfig[answers.provider] = projProviderSection;
    }

    // Add agent if configured
    if (answers.defaultAgent && answers.agentCommand) {
      const agentArgs = answers.agentArgs ? answers.agentArgs.split(' ').filter(Boolean) : [];
      projectConfig.agents = [
        {
          name: answers.defaultAgent,
          command: answers.agentCommand,
          args: agentArgs,
          shell: 'bash',
          env: {},
          timeout: 300000,
        },
      ];
      projectConfig.defaultAgent = answers.defaultAgent;
    }

    writeYamlFile(projectConfigPath, projectConfig);
    console.log(chalk.green(`  ✓ Project config written to ${projectConfigPath}`));
  }

  console.log('');

  // Step 4: Summary
  console.log(chalk.bold('Step 4/4: Setup complete!'));
  console.log('');
  console.log(chalk.bold('  Configuration Summary:'));
  console.log(`    Provider:    ${chalk.cyan(PROVIDER_CONFIG[answers.provider].label)}`);
  console.log(`    Model:       ${chalk.cyan(answers.model)}`);
  if (answers.baseUrl) {
    console.log(`    Base URL:    ${chalk.cyan(answers.baseUrl)}`);
  }
  console.log(`    Log level:   ${chalk.cyan(answers.logLevel)}`);
  if (answers.defaultAgent) {
    console.log(`    Agent:       ${chalk.cyan(answers.defaultAgent)}`);
  }
  console.log(
    `    Key storage: ${chalk.cyan(keychainAvailable ? 'System keychain' : 'Encrypted file')}`
  );
  console.log('');
  console.log(chalk.bold('  Next steps:'));
  console.log(
    `    ${chalk.dim('$')} ${chalk.green('traytor doctor')}             ${chalk.dim('# Verify configuration')}`
  );
  console.log(
    `    ${chalk.dim('$')} ${chalk.green('traytor plan "Add feature"')} ${chalk.dim('# Generate your first plan')}`
  );
  console.log(
    `    ${chalk.dim('$')} ${chalk.green('traytor config switch')}      ${chalk.dim('# Change provider later')}`
  );
  console.log('');
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

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (
      baseVal &&
      overrideVal &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal) &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>
      );
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

function isWindows(): boolean {
  return os.platform() === 'win32';
}
