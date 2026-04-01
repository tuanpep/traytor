import { formatSeverity, formatFileLocation } from './format.js';

/**
 * Build a comment block for review/verification fix prompts.
 */
export function buildCommentBlock(
  index: number,
  severity: string,
  category: string,
  file: string | undefined,
  line: number | undefined,
  message: string,
  suggestion: string | undefined
): string {
  let block = `[${index}] ${formatSeverity(severity)} [${category.toUpperCase()}] `;
  if (file) {
    block += formatFileLocation(file, line) + '\n';
  }
  block += `   ${message}\n`;
  if (suggestion) {
    block += `   Suggested fix: ${suggestion}\n`;
  }
  return block;
}

/**
 * Build a numbered instructions list.
 */
export function buildInstructionsList(instructions: string[]): string {
  return instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join('\n');
}

/**
 * Build a context block with working directory and optional extra fields.
 */
export function buildContextBlock(workingDir: string, extra?: Record<string, string>): string {
  let block = `Working directory: ${workingDir}\n`;
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      block += `${key}: ${value}\n`;
    }
  }
  return block;
}
