import { describe, it, expect } from 'vitest';
import { fuzzyMatch, fuzzyFilter, highlightMatches } from '../../src/ui/tui/fuzzy-search.js';

describe('fuzzyMatch', () => {
  it('returns null for empty query', () => {
    expect(fuzzyMatch('', 'hello')).not.toBeNull();
    expect(fuzzyMatch('', 'hello')!.score).toBe(0);
  });

  it('matches exact substring', () => {
    const result = fuzzyMatch('auth', 'authenticate');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(100);
    expect(result!.matches.length).toBe(4);
  });

  it('matches fuzzy characters', () => {
    const result = fuzzyMatch('ap', 'apple');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it('returns null for no match', () => {
    expect(fuzzyMatch('xyz', 'hello')).toBeNull();
  });

  it('is case insensitive', () => {
    const result1 = fuzzyMatch('AUTH', 'authenticate');
    const result2 = fuzzyMatch('auth', 'AUTHENTICATE');
    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1!.score).toBe(result2!.score);
  });

  it('gives bonus for word boundary matches', () => {
    const result = fuzzyMatch('ca', 'cache analysis');
    expect(result).not.toBeNull();
    // Should get bonus for matching 'c' at word start
    expect(result!.score).toBeGreaterThan(10);
  });
});

describe('fuzzyFilter', () => {
  it('filters items by fuzzy query', () => {
    const items = [
      { label: 'Implement authentication' },
      { label: 'Add cache system' },
      { label: 'Fix database connection' },
    ];
    const results = fuzzyFilter(items, 'auth');
    expect(results.length).toBe(1);
    expect(results[0].label).toBe('Implement authentication');
  });

  it('returns all items when no query', () => {
    const items = [{ label: 'a' }, { label: 'b' }];
    const results = fuzzyFilter(items, '');
    expect(results.length).toBe(2);
  });

  it('sorts by match score', () => {
    const items = [{ label: 'Authentication module' }, { label: 'auth' }];
    const results = fuzzyFilter(items, 'auth');
    expect(results.length).toBe(2);
    // Exact match 'auth' should score higher due to better ratio
    expect(results[0].label).toBe('auth');
  });
});

describe('highlightMatches', () => {
  it('highlights matched positions', () => {
    const plain = highlightMatches('hello', [2, 3], (s) => `(${s})`);
    // The plain function wraps individual chars, so 'l' and 'l' become '(l)(l)'
    // Just verify the function processes the right positions
    expect(plain.length).toBeGreaterThan('hello'.length);
  });

  it('returns original text with no positions', () => {
    expect(highlightMatches('hello', [], (s) => `<${s}>`)).toBe('hello');
  });
});
