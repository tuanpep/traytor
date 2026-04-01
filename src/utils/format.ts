/**
 * Format a severity string into a consistent tag like [CRITICAL], [MAJOR], [MINOR].
 */
export function formatSeverity(severity: string): string {
  return `[${severity.toUpperCase()}]`;
}

/**
 * Format a file location as `file:line`.
 */
export function formatFileLocation(file: string, line?: number): string {
  return line != null ? `${file}:${line}` : file;
}

/**
 * Safely truncate a string to maxLength, appending "..." if truncated.
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}
