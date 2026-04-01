/**
 * Return an empty array for nullish input.
 */
export function safeFilterArray<T>(arr: T[] | undefined | null): T[] {
  if (!arr) return [];
  return arr.filter((item): item is T => item != null);
}

/**
 * Get a string from an unknown value, returning defaultValue if not a string.
 */
export function safeGetString(value: unknown, defaultValue: string): string {
  return typeof value === 'string' ? value : defaultValue;
}
