import chalk from 'chalk';
import fs from 'node:fs';
import { MermaidService } from '../services/mermaid-service.js';

export interface MermaidContext {
  mermaidService: MermaidService;
}

export async function runMermaidShow(ctx: MermaidContext, mermaidCode: string): Promise<void> {
  const validation = ctx.mermaidService.validateMermaid(mermaidCode);

  if (!validation.valid) {
    console.log(chalk.red(`Invalid Mermaid code: ${validation.error}`));
    return;
  }

  console.log(chalk.bold.cyan('Mermaid Diagram Preview\n'));

  const lines = mermaidCode.split('\n');
  for (const line of lines) {
    const formatted = formatMermaidLine(line);
    console.log(formatted);
  }

  console.log('');
  console.log(chalk.dim('Live preview:'), ctx.mermaidService.getMermaidLiveUrl(mermaidCode));
}

export async function runMermaidExport(
  ctx: MermaidContext,
  mermaidCode: string,
  outputPath: string,
  options?: { format?: 'png' | 'svg'; theme?: string }
): Promise<void> {
  const validation = ctx.mermaidService.validateMermaid(mermaidCode);

  if (!validation.valid) {
    console.log(chalk.red(`Invalid Mermaid code: ${validation.error}`));
    return;
  }

  console.log(chalk.bold(`Exporting to ${options?.format ?? 'png'}...`));

  try {
    if (options?.format === 'svg') {
      await ctx.mermaidService.exportToSvg(mermaidCode, outputPath);
    } else {
      await ctx.mermaidService.exportToPng(mermaidCode, outputPath, {
        theme: options?.theme as 'default' | 'dark' | 'forest' | 'neutral' | undefined,
      });
    }

    console.log(chalk.green(`✓ Exported to ${outputPath}`));
  } catch (error) {
    console.error(
      chalk.red(`Export failed: ${error instanceof Error ? error.message : String(error)}`)
    );
    console.log(chalk.dim('\nTip: Install Mermaid CLI for exports:'));
    console.log(chalk.dim('  npm install -g @mermaid-js/mermaid-cli'));
  }
}

export async function runMermaidUrl(ctx: MermaidContext, mermaidCode: string): Promise<void> {
  const validation = ctx.mermaidService.validateMermaid(mermaidCode);

  if (!validation.valid) {
    console.log(chalk.red(`Invalid Mermaid code: ${validation.error}`));
    return;
  }

  const liveUrl = ctx.mermaidService.getMermaidLiveUrl(mermaidCode);
  const imageUrl = ctx.mermaidService.getMermaidUrl(mermaidCode);

  console.log(chalk.bold.cyan('Mermaid URLs\n'));
  console.log('Live Editor:', chalk.blue(liveUrl));
  console.log('Image URL:', chalk.blue(imageUrl));
}

export async function runMermaidGenerate(
  ctx: MermaidContext,
  steps: { title: string; description?: string }[],
  outputPath?: string
): Promise<void> {
  if (steps.length === 0) {
    console.log(chalk.yellow('No steps provided to generate diagram from.'));
    return;
  }

  const mermaidCode = ctx.mermaidService.generateDiagramFromPlan({ steps });

  console.log(chalk.bold.cyan('Generated Mermaid Diagram\n'));
  console.log(mermaidCode);
  console.log('');

  const liveUrl = ctx.mermaidService.getMermaidLiveUrl(mermaidCode);
  console.log(chalk.dim('Preview:'), chalk.blue(liveUrl));

  if (outputPath) {
    fs.writeFileSync(outputPath, mermaidCode, 'utf-8');
    console.log(chalk.green(`\n✓ Saved to ${outputPath}`));
  }
}

export async function runMermaidValidate(ctx: MermaidContext, mermaidCode: string): Promise<void> {
  const validation = ctx.mermaidService.validateMermaid(mermaidCode);

  if (validation.valid) {
    console.log(chalk.green('✓ Valid Mermaid code'));
  } else {
    console.log(chalk.red(`✗ Invalid: ${validation.error}`));
    process.exit(1);
  }
}

function formatMermaidLine(line: string): string {
  const trimmed = line.trim();

  if (trimmed.startsWith('graph') || trimmed.startsWith('flowchart')) {
    return chalk.bold.cyan(trimmed);
  }

  if (
    trimmed.startsWith('sequenceDiagram') ||
    trimmed.startsWith('classDiagram') ||
    trimmed.startsWith('stateDiagram') ||
    trimmed.startsWith('pie')
  ) {
    return chalk.bold.magenta(trimmed);
  }

  if (trimmed.startsWith('-->') || trimmed.startsWith('-->') || trimmed.startsWith('-.')) {
    return chalk.yellow(trimmed);
  }

  if (
    trimmed.startsWith('participant') ||
    trimmed.startsWith('class') ||
    trimmed.startsWith('note')
  ) {
    return chalk.green(trimmed);
  }

  if (trimmed.match(/^\d+\)/)) {
    return chalk.cyan(trimmed);
  }

  return chalk.dim(trimmed);
}
