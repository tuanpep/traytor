import { getLogger } from '../../utils/logger.js';
import { LLMProviderError } from '../../utils/errors.js';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

function isRetryableError(error: unknown, retryableStatuses: number[]): boolean {
  if (error instanceof LLMProviderError) {
    const status = error.details?.status as number | undefined;
    if (status !== undefined) {
      return retryableStatuses.includes(status);
    }
    const retryable = error.details?.retryable as boolean | undefined;
    if (retryable !== undefined) {
      return retryable;
    }
  }
  return false;
}

function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = baseDelayMs * Math.pow(2, attempt);
  // Add jitter (0-25% of delay)
  const jitter = delay * Math.random() * 0.25;
  return Math.min(delay + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an async function with retry logic for transient LLM API failures.
 * Retries on 429 (rate limit) and 5xx (server error) status codes
 * with exponential backoff and jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const logger = getLogger();
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries || !isRetryableError(error, opts.retryableStatuses)) {
        throw error;
      }

      const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      const status = error instanceof LLMProviderError ? (error.details?.status as number | undefined) : undefined;

      logger.warn(
        `LLM API request failed (attempt ${attempt + 1}/${opts.maxRetries + 1}, status: ${status ?? 'unknown'}). Retrying in ${Math.round(delay)}ms...`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}
