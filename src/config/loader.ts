import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, type Config } from './schema.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { TraytorError, ErrorCode } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { SecureStorage } from '../utils/secure-storage.js';

const USER_CONFIG_DIR = '.traytor';
const USER_CONFIG_FILE = 'config.yaml';
const USER_AGENTS_FILE = 'agents.json';
const PROJECT_CONFIG_DIR = '.traytor';
const PROJECT_CONFIG_FILE = 'config.yaml';

function getUserConfigPath(): string {
  return join(os.homedir(), USER_CONFIG_DIR, USER_CONFIG_FILE);
}

function getProjectConfigPath(cwd?: string): string {
  const base = cwd || process.cwd();
  return join(base, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
}

async function readYamlFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return parseYaml(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function applyEnvOverrides(config: Config): Config {
  const result = { ...config };

  if (process.env.TRAYTOR_PROVIDER) {
    result.provider = process.env.TRAYTOR_PROVIDER as Config['provider'];
  }

  if (process.env.ANTHROPIC_API_KEY) {
    result.anthropic = { ...result.anthropic, apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.TRAYTOR_ANTHROPIC_MODEL) {
    result.anthropic = { ...result.anthropic, model: process.env.TRAYTOR_ANTHROPIC_MODEL };
  }
  if (process.env.TRAYTOR_ANTHROPIC_MAX_TOKENS) {
    result.anthropic = {
      ...result.anthropic,
      maxTokens: parseInt(process.env.TRAYTOR_ANTHROPIC_MAX_TOKENS, 10),
    };
  }
  if (process.env.TRAYTOR_ANTHROPIC_TEMPERATURE) {
    result.anthropic = {
      ...result.anthropic,
      temperature: parseFloat(process.env.TRAYTOR_ANTHROPIC_TEMPERATURE),
    };
  }
  if (process.env.TRAYTOR_ANTHROPIC_BASE_URL) {
    result.anthropic = { ...result.anthropic, baseURL: process.env.TRAYTOR_ANTHROPIC_BASE_URL };
  }

  if (process.env.OPENAI_API_KEY) {
    result.openai = { ...result.openai, apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.TRAYTOR_OPENAI_MODEL) {
    result.openai = { ...result.openai, model: process.env.TRAYTOR_OPENAI_MODEL };
  }
  if (process.env.TRAYTOR_OPENAI_MAX_TOKENS) {
    result.openai = {
      ...result.openai,
      maxTokens: parseInt(process.env.TRAYTOR_OPENAI_MAX_TOKENS, 10),
    };
  }
  if (process.env.TRAYTOR_OPENAI_TEMPERATURE) {
    result.openai = {
      ...result.openai,
      temperature: parseFloat(process.env.TRAYTOR_OPENAI_TEMPERATURE),
    };
  }
  if (process.env.OPENAI_BASE_URL) {
    result.openai = { ...result.openai, baseURL: process.env.OPENAI_BASE_URL };
  }

  if (
    process.env.TRAYTOR_COMPATIBLE_API_KEY ||
    process.env.TRAYTOR_COMPATIBLE_MODEL ||
    process.env.TRAYTOR_COMPATIBLE_BASE_URL
  ) {
    const existing = result.openaiCompatible || {
      model: '',
      baseURL: '',
      maxTokens: 4096,
      temperature: 0,
    };
    result.openaiCompatible = { ...existing };
    if (process.env.TRAYTOR_COMPATIBLE_API_KEY) {
      result.openaiCompatible.apiKey = process.env.TRAYTOR_COMPATIBLE_API_KEY;
    }
    if (process.env.TRAYTOR_COMPATIBLE_MODEL) {
      result.openaiCompatible.model = process.env.TRAYTOR_COMPATIBLE_MODEL;
    }
    if (process.env.TRAYTOR_COMPATIBLE_BASE_URL) {
      result.openaiCompatible.baseURL = process.env.TRAYTOR_COMPATIBLE_BASE_URL;
    }
  }

  if (process.env.TRAYTOR_DEFAULT_AGENT) {
    result.defaultAgent = process.env.TRAYTOR_DEFAULT_AGENT;
  }

  if (process.env.TRAYTOR_LOG_LEVEL) {
    result.logLevel = process.env.TRAYTOR_LOG_LEVEL as Config['logLevel'];
  }

  if (process.env.TRAYTOR_DATA_DIR) {
    result.dataDir = process.env.TRAYTOR_DATA_DIR;
  }

  return result;
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function applySecureStorageOverrides(config: Config): Promise<Config> {
  const result = { ...config };
  const logger = getLogger();

  if (!config.security.useKeychain) {
    return result;
  }

  try {
    const secureStorage = new SecureStorage();

    if (!result.anthropic.apiKey) {
      const key = await secureStorage.getApiKey('anthropic');
      if (key) {
        result.anthropic = { ...result.anthropic, apiKey: key };
        logger.debug('Anthropic API key retrieved from secure storage');
      }
    }

    if (!result.openai.apiKey) {
      const key = await secureStorage.getApiKey('openai');
      if (key) {
        result.openai = { ...result.openai, apiKey: key };
        logger.debug('OpenAI API key retrieved from secure storage');
      }
    }
  } catch (error) {
    logger.warn(
      `Secure storage unavailable, using config/env only: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return result;
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

export interface ConfigLoaderOptions {
  cwd?: string;
  skipUserConfig?: boolean;
  skipProjectConfig?: boolean;
  skipEnvOverrides?: boolean;
}

export class ConfigLoader {
  private config: Config | null = null;

  async load(options?: ConfigLoaderOptions): Promise<Config> {
    const logger = getLogger();
    const opts = {
      cwd: process.cwd(),
      skipUserConfig: false,
      skipProjectConfig: false,
      skipEnvOverrides: false,
      ...options,
    };

    logger.debug('Loading configuration...');

    let merged = { ...DEFAULT_CONFIG };
    logger.debug('Applied default configuration');

    if (!opts.skipUserConfig) {
      const userConfigPath = getUserConfigPath();
      const userConfig = await readYamlFile(userConfigPath);
      if (userConfig) {
        merged = deepMerge(
          merged as unknown as Record<string, unknown>,
          userConfig
        ) as unknown as Config;
        logger.debug(`Loaded user config from ${userConfigPath}`);
      }

      // Load agents.json from user config dir
      const userAgentsPath = join(os.homedir(), USER_CONFIG_DIR, USER_AGENTS_FILE);
      if (existsSync(userAgentsPath)) {
        const userAgents = await readJsonFile(userAgentsPath);
        if (userAgents) {
          if (userAgents.agents) {
            merged.agents = userAgents.agents as Config['agents'];
            logger.debug(`Loaded user agents from ${userAgentsPath}`);
          }
          if (userAgents.defaultAgent) {
            merged.defaultAgent = userAgents.defaultAgent as string;
          }
        }
      }
    }

    if (!opts.skipProjectConfig) {
      const projectConfigPath = getProjectConfigPath(opts.cwd);
      const projectConfig = await readYamlFile(projectConfigPath);
      if (projectConfig) {
        merged = deepMerge(
          merged as unknown as Record<string, unknown>,
          projectConfig
        ) as unknown as Config;
        logger.debug(`Loaded project config from ${projectConfigPath}`);
      }
    }

    if (!opts.skipEnvOverrides) {
      merged = applyEnvOverrides(merged);
      logger.debug('Applied environment variable overrides');
    }

    merged = await applySecureStorageOverrides(merged);

    // Expand tilde in dataDir
    if (merged.dataDir && merged.dataDir.startsWith('~')) {
      merged.dataDir = merged.dataDir.replace(/^~/, os.homedir());
    }

    const parsed = ConfigSchema.safeParse(merged);
    if (!parsed.success) {
      const errors = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new TraytorError(
        ErrorCode.CONFIG_INVALID,
        'Configuration validation failed',
        'Check your config files for invalid values',
        { errors }
      );
    }

    this.config = parsed.data;
    logger.debug('Configuration loaded and validated successfully');
    return this.config;
  }

  getConfig(): Config {
    if (!this.config) {
      throw new TraytorError(
        ErrorCode.CONFIG_INVALID,
        'Configuration not loaded. Call load() first.',
        'Ensure ConfigLoader.load() is called before accessing config'
      );
    }
    return this.config;
  }
}
