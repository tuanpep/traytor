import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TemplateCommandContext {
  projectConfigDir: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const BUILTIN_TEMPLATE_NAMES = ['plan', 'verification', 'review', 'user-query', 'phases'];

function getBuiltinTemplateDir(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(thisDir, '..', 'templates');
}

function getCustomTemplateDir(projectConfigDir: string): string {
  return path.join(projectConfigDir, 'templates');
}

function listBuiltinTemplates(): string[] {
  const dir = getBuiltinTemplateDir();
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.hbs'))
      .map((f) => f.replace('.hbs', ''));
  } catch {
    return [];
  }
}

function listCustomTemplates(projectConfigDir: string): string[] {
  const dir = getCustomTemplateDir(projectConfigDir);
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.hbs'))
      .map((f) => f.replace('.hbs', ''));
  } catch {
    return [];
  }
}

// ─── list ────────────────────────────────────────────────────────────────────

export async function runTemplateList(ctx: TemplateCommandContext): Promise<void> {
  const builtins = listBuiltinTemplates();
  const customs = listCustomTemplates(ctx.projectConfigDir);

  console.log(chalk.bold('Templates:'));
  console.log('');

  if (builtins.length > 0) {
    console.log(chalk.cyan('  Built-in:'));
    for (const name of builtins) {
      console.log(chalk.dim(`    ${name}`));
    }
    console.log('');
  }

  if (customs.length > 0) {
    console.log(chalk.cyan('  Custom:'));
    for (const name of customs) {
      const overrides = BUILTIN_TEMPLATE_NAMES.includes(name) ? chalk.yellow(' (overrides built-in)') : '';
      console.log(chalk.dim(`    ${name}${overrides}`));
    }
    console.log('');
  }

  if (builtins.length === 0 && customs.length === 0) {
    console.log(chalk.dim('  No templates found.'));
  }

  console.log(chalk.dim(`  Custom templates dir: ${getCustomTemplateDir(ctx.projectConfigDir)}`));
}

// ─── show ────────────────────────────────────────────────────────────────────

export async function runTemplateShow(ctx: TemplateCommandContext, name: string): Promise<void> {
  const customDir = getCustomTemplateDir(ctx.projectConfigDir);
  const builtinDir = getBuiltinTemplateDir();

  // Try custom first
  const customPath = path.join(customDir, `${name}.hbs`);
  const builtinPath = path.join(builtinDir, `${name}.hbs`);

  let templatePath: string | null = null;
  let source: string | null = null;

  if (fs.existsSync(customPath)) {
    templatePath = customPath;
    source = fs.readFileSync(customPath, 'utf-8');
  } else if (fs.existsSync(builtinPath)) {
    templatePath = builtinPath;
    source = fs.readFileSync(builtinPath, 'utf-8');
  }

  if (!source) {
    console.error(chalk.red(`Template "${name}" not found.`));
    process.exit(1);
  }

  const isCustom = templatePath === customPath;
  const sourceLabel = isCustom ? chalk.yellow('custom') : chalk.dim('built-in');

  console.log(chalk.bold(`Template: ${chalk.cyan(name)} (${sourceLabel})`));
  console.log(chalk.dim(`  Path: ${templatePath}`));
  console.log('');
  console.log(chalk.dim('---'));
  console.log(source);
  console.log(chalk.dim('---'));
}

// ─── create ─────────────────────────────────────────────────────────────────

export async function runTemplateCreate(
  ctx: TemplateCommandContext,
  name: string,
  content?: string
): Promise<void> {
  const logger = getLogger();
  const customDir = getCustomTemplateDir(ctx.projectConfigDir);

  // Ensure directory exists
  fs.mkdirSync(customDir, { recursive: true });

  const templatePath = path.join(customDir, `${name}.hbs`);

  if (fs.existsSync(templatePath)) {
    console.error(chalk.red(`Template "${name}" already exists at ${templatePath}`));
    console.log(chalk.dim(`Use \`traytor template edit ${name}\` to modify it.`));
    process.exit(1);
  }

  if (!content) {
    console.error(chalk.red('Template content is required. Use --content flag.'));
    process.exit(1);
  }

  fs.writeFileSync(templatePath, content, 'utf-8');
  logger.info(`Template "${name}" created at ${templatePath}`);

  const overrides = BUILTIN_TEMPLATE_NAMES.includes(name) ? chalk.yellow(' (overrides built-in)') : '';
  console.log(chalk.green(`Template "${chalk.bold(name)}" created successfully.${overrides}`));
  console.log(chalk.dim(`  Path: ${templatePath}`));
}

// ─── edit ────────────────────────────────────────────────────────────────────

export async function runTemplateEdit(
  ctx: TemplateCommandContext,
  name: string,
  content?: string
): Promise<void> {
  const logger = getLogger();
  const customDir = getCustomTemplateDir(ctx.projectConfigDir);
  const builtinDir = getBuiltinTemplateDir();

  // Look for existing template (custom or built-in)
  const customPath = path.join(customDir, `${name}.hbs`);
  const builtinPath = path.join(builtinDir, `${name}.hbs`);

  let templatePath = customPath;
  if (!fs.existsSync(templatePath)) {
    templatePath = builtinPath;
  }

  if (!fs.existsSync(templatePath)) {
    console.error(chalk.red(`Template "${name}" not found.`));
    console.log(chalk.dim('Use `traytor template create` to create a new template.'));
    process.exit(1);
  }

  // If editing a built-in, copy to custom first
  if (templatePath === builtinPath) {
    fs.mkdirSync(customDir, { recursive: true });
    const builtinContent = fs.readFileSync(builtinPath, 'utf-8');
    fs.writeFileSync(customPath, builtinContent, 'utf-8');
    logger.info(`Copied built-in template "${name}" to custom directory for editing`);
    templatePath = customPath;
    console.log(chalk.dim(`Copied built-in template to ${templatePath}`));
  }

  if (content) {
    fs.writeFileSync(templatePath, content, 'utf-8');
    logger.info(`Template "${name}" updated at ${templatePath}`);
    console.log(chalk.green(`Template "${chalk.bold(name)}" updated successfully.`));
    console.log(chalk.dim(`  Path: ${templatePath}`));
  } else {
    // Open in default editor
    const editor = process.env.EDITOR || process.env.VISUAL || 'vim';
    const { execSync } = await import('node:child_process');
    try {
      execSync(`${editor} "${templatePath}"`, { stdio: 'inherit' });
      console.log(chalk.green(`Template "${chalk.bold(name)}" saved.`));
    } catch {
      console.error(chalk.red(`Failed to open editor. Set EDITOR env var or use --content flag.`));
      console.log(chalk.dim(`Template path: ${templatePath}`));
    }
  }
}
