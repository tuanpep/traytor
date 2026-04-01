import path from 'node:path';
import { ConfigError } from './errors.js';

/**
 * Validates that a value is a non-empty string, returning it or throwing ConfigError.
 */
export function validateNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ConfigError(`${fieldName} must be a non-empty string`);
  }
  return value;
}

/**
 * Validates a file path, rejecting dangerous patterns. Returns the normalized path.
 */
export function validateFilePath(filePath: string): string {
  if (typeof filePath !== 'string') {
    throw new ConfigError('File path must be a string');
  }
  if (filePath.includes('\0')) {
    throw new ConfigError('File path contains null bytes');
  }
  if (filePath.includes('..')) {
    throw new ConfigError('File path contains path traversal (..)');
  }
  return path.normalize(filePath);
}

/**
 * Validates that a task ID follows the expected pattern (e.g., task_ prefix).
 */
export function validateTaskId(taskId: string): boolean {
  return typeof taskId === 'string' && /^task_\w+$/.test(taskId);
}

/**
 * Ensures a value is one of the allowed enum members.
 */
export function validateEnumValue<T>(
  value: unknown,
  validValues: readonly T[],
  fieldName: string
): T {
  if (!validValues.includes(value as T)) {
    throw new ConfigError(
      `Invalid ${fieldName}: "${String(value)}". Must be one of: ${validValues.join(', ')}`
    );
  }
  return value as T;
}

/**
 * Strips dangerous characters from strings used in shell contexts.
 */
export function sanitizeForShell(input: string): string {
  return input
    .replace(/[\0\n\r]/g, '')
    .replace(/[`$\\!#&*|;<>?(){}[\]]/g, '')
    .trim();
}

/**
 * Ensures a numeric value is a positive integer.
 */
export function validatePositiveInteger(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new ConfigError(`${fieldName} must be a positive integer, got: ${String(value)}`);
  }
  return num;
}
