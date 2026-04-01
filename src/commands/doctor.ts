import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getConfigDir, getDataDir, getEncryptedKeysDir } from '../utils/platform.js';
import type { Config } from '../config/schema.js';

export interface DoctorOptions {
  verbose?: boolean;
}

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  detail?: string;
}

/**
 * Run health checks on the Traytor installation and configuration.
 */
export async function runDoctorCommand(
  config: Config,
  options: DoctorOptions = {}
): Promise<void> {
  const checks: CheckResult[] = [];

  // 1. Config directory exists
  const configDir = getConfigDir();
  if (fs.existsSync(configDir)) {
    checks.push({ name: 'Config directory', status: 'pass', message: `Found at ${configDir}` });
  } else {
    checks.push({ name: 'Config directory', status: 'fail', message: `Not found at ${configDir}`, detail: 'Run `traytor setup` to create it' });
  }

  // 2. Data directory exists
  const dataDir = getDataDir();
  if (fs.existsSync(dataDir)) {
    checks.push({ name: 'Data directory', status: 'pass', message: `Found at ${dataDir}` });
  } else {
    checks.push({ name: 'Data directory', status: 'fail', message: `Not found at ${dataDir}`, detail: 'Run `traytor setup` to create it' });
  }

  // 3. Config file exists and is valid
  const userConfigPath = path.join(configDir, 'config.yaml');
  if (fs.existsSync(userConfigPath)) {
    try {
      const content = fs.readFileSync(userConfigPath, 'utf-8');
      if (content.trim().length > 0) {
        checks.push({ name: 'User config', status: 'pass', message: `Found at ${userConfigPath}` });
      } else {
        checks.push({ name: 'User config', status: 'warn', message: `Empty file at ${userConfigPath}` });
      }
    } catch {
      checks.push({ name: 'User config', status: 'fail', message: `Cannot read ${userConfigPath}` });
    }
  } else {
    checks.push({ name: 'User config', status: 'warn', message: 'No user config file found', detail: 'Run `traytor setup` to create one' });
  }

  // 4. API key presence
  const provider = config.provider;
  const hasKey = provider === 'anthropic'
    ? !!config.anthropic.apiKey || !!process.env.ANTHROPIC_API_KEY
    : provider === 'openai'
      ? !!config.openai.apiKey || !!process.env.OPENAI_API_KEY
      : !!config.openaiCompatible?.apiKey;

  if (hasKey) {
    checks.push({ name: 'API key', status: 'pass', message: `${provider} API key configured` });
  } else {
    checks.push({ name: 'API key', status: 'fail', message: `No ${provider} API key found`, detail: `Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} env var or run \`traytor config set-key ${provider} <key>\`` });
  }

  // 5. Provider configuration
  const providerModel = provider === 'anthropic'
    ? config.anthropic.model
    : provider === 'openai'
      ? config.openai.model
      : config.openaiCompatible?.model;
  checks.push({
    name: 'Provider',
    status: 'pass',
    message: `Using ${provider}`,
    detail: options.verbose ? `Model: ${providerModel ?? 'default'}` : undefined,
  });

  // 6. Agent configuration
  if (config.agents.length > 0) {
    const agentNames = config.agents.map((a) => a.name).join(', ');
    const defaultAgent = config.defaultAgent ?? config.agents[0]?.name;
    checks.push({
      name: 'Agents',
      status: 'pass',
      message: `${config.agents.length} configured: ${agentNames}`,
      detail: `Default: ${defaultAgent}`,
    });
  } else {
    checks.push({
      name: 'Agents',
      status: 'warn',
      message: 'No agents configured',
      detail: 'Add agents with `traytor agent add` or run `traytor setup`',
    });
  }

  // 7. Project config
  const projectConfigPath = path.join(process.cwd(), '.traytor', 'config.yaml');
  if (fs.existsSync(projectConfigPath)) {
    checks.push({ name: 'Project config', status: 'pass', message: `Found at ${projectConfigPath}` });
  } else {
    checks.push({ name: 'Project config', status: 'warn', message: 'No project config found', detail: 'Create one with `traytor setup --project`' });
  }

  // 8. Git repository
  try {
    const gitDir = path.join(process.cwd(), '.git');
    if (fs.existsSync(gitDir)) {
      checks.push({ name: 'Git repository', status: 'pass', message: 'Detected in current directory' });
    } else {
      checks.push({ name: 'Git repository', status: 'warn', message: 'No .git directory found', detail: 'Some features (git diff, auto-commit) require a git repository' });
    }
  } catch {
    checks.push({ name: 'Git repository', status: 'warn', message: 'Could not check for .git directory' });
  }

  // 9. Task storage
  const tasksDir = path.join(dataDir, 'tasks');
  if (fs.existsSync(tasksDir)) {
    try {
      const files = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.json'));
      checks.push({ name: 'Task storage', status: 'pass', message: `${files.length} tasks stored` });
    } catch {
      checks.push({ name: 'Task storage', status: 'warn', message: 'Cannot read tasks directory' });
    }
  } else {
    checks.push({ name: 'Task storage', status: 'warn', message: 'No tasks directory yet' });
  }

  // 10. Encrypted keys directory
  const keysDir = getEncryptedKeysDir();
  if (fs.existsSync(keysDir)) {
    checks.push({ name: 'Key storage', status: 'pass', message: `Found at ${keysDir}` });
  } else {
    checks.push({ name: 'Key storage', status: 'warn', message: `Not found at ${keysDir}` });
  }

  // Display results
  console.log('');
  console.log(chalk.bold.cyan('  Traytor Health Check'));
  console.log('');

  const passed = checks.filter((c) => c.status === 'pass').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const failed = checks.filter((c) => c.status === 'fail').length;

  for (const check of checks) {
    const icon = check.status === 'pass' ? chalk.green('✓') : check.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✗');
    console.log(`  ${icon} ${chalk.bold(check.name)}: ${check.message}`);
    if (check.detail && options.verbose) {
      console.log(chalk.dim(`      ${check.detail}`));
    }
  }

  console.log('');
  const summary = `${chalk.green(`${passed} passed`)}, ${chalk.yellow(`${warned} warnings`)}, ${chalk.red(`${failed} failed`)}`;
  console.log(`  Result: ${summary}`);

  if (failed > 0) {
    console.log('');
    console.log(chalk.dim('  Run `traytor setup` to fix configuration issues.'));
  }

  console.log('');
}
