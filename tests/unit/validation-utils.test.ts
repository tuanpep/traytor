import { describe, expect, it } from 'vitest';

import {
  validateNonEmptyString,
  validateFilePath,
  validateTaskId,
  validateEnumValue,
  sanitizeForShell,
  validatePositiveInteger,
} from '../../src/utils/validation.js';
import { ConfigError } from '../../src/utils/errors.js';

describe('validateNonEmptyString', () => {
  it('returns the string if valid', () => {
    expect(validateNonEmptyString('hello', 'field')).toBe('hello');
  });

  it('throws ConfigError for empty string', () => {
    expect(() => validateNonEmptyString('', 'field')).toThrow(ConfigError);
  });

  it('throws ConfigError for non-string', () => {
    expect(() => validateNonEmptyString(42, 'field')).toThrow(ConfigError);
    expect(() => validateNonEmptyString(null, 'field')).toThrow(ConfigError);
    expect(() => validateNonEmptyString(undefined, 'field')).toThrow(ConfigError);
  });
});

describe('validateFilePath', () => {
  it('returns normalized path for valid input', () => {
    expect(validateFilePath('src/index.ts')).toBe('src/index.ts');
  });

  it('normalizes paths', () => {
    expect(validateFilePath('src/./index.ts')).toMatch(/src[/\\]index\.ts$/);
  });

  it('rejects null bytes', () => {
    expect(() => validateFilePath('src/index.ts\0evil')).toThrow(ConfigError);
  });

  it('rejects path traversal', () => {
    expect(() => validateFilePath('../etc/passwd')).toThrow(ConfigError);
  });

  it('rejects non-string', () => {
    expect(() => validateFilePath(123 as unknown as string)).toThrow(ConfigError);
  });
});

describe('validateTaskId', () => {
  it('returns true for valid task IDs', () => {
    expect(validateTaskId('task_abc123')).toBe(true);
    expect(validateTaskId('task_1')).toBe(true);
  });

  it('returns false for invalid task IDs', () => {
    expect(validateTaskId('')).toBe(false);
    expect(validateTaskId('abc_123')).toBe(false);
    expect(validateTaskId('task-123')).toBe(false);
  });
});

describe('validateEnumValue', () => {
  const modes = ['plan', 'exec', 'verify'] as const;

  it('returns the value if valid', () => {
    expect(validateEnumValue('plan', modes, 'mode')).toBe('plan');
  });

  it('throws ConfigError for invalid value', () => {
    expect(() => validateEnumValue('invalid', modes, 'mode')).toThrow(ConfigError);
  });
});

describe('sanitizeForShell', () => {
  it('removes null bytes and newlines', () => {
    expect(sanitizeForShell('hello\0world\n')).toBe('helloworld');
  });

  it('removes shell metacharacters', () => {
    expect(sanitizeForShell('test`echo pwn`')).toBe('testecho pwn');
  });

  it('trims whitespace', () => {
    expect(sanitizeForShell('  hello  ')).toBe('hello');
  });

  it('leaves safe strings unchanged', () => {
    expect(sanitizeForShell('hello-world_123')).toBe('hello-world_123');
  });
});

describe('validatePositiveInteger', () => {
  it('returns the number if valid', () => {
    expect(validatePositiveInteger(1, 'count')).toBe(1);
    expect(validatePositiveInteger('3', 'count')).toBe(3);
  });

  it('throws ConfigError for zero', () => {
    expect(() => validatePositiveInteger(0, 'count')).toThrow(ConfigError);
  });

  it('throws ConfigError for negative', () => {
    expect(() => validatePositiveInteger(-1, 'count')).toThrow(ConfigError);
  });

  it('throws ConfigError for non-integer', () => {
    expect(() => validatePositiveInteger(1.5, 'count')).toThrow(ConfigError);
  });
});
