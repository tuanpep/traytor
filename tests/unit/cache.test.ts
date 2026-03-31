import { describe, it, expect, beforeEach } from 'vitest';
import { Cache } from '../../src/ui/tui/cache.js';

describe('Cache', () => {
  let cache: Cache<string>;

  beforeEach(() => {
    cache = new Cache<string>({ defaultTtlMs: 1000, maxEntries: 10 });
  });

  it('stores and retrieves values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('expires entries after TTL', async () => {
    cache.set('short-lived', 'data', 50);
    expect(cache.get('short-lived')).toBe('data');
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('short-lived')).toBeUndefined();
  });

  it('supports custom TTL per entry', () => {
    cache.set('default-ttl', 'a');
    cache.set('custom-ttl', 'b', 100_000);
    expect(cache.get('default-ttl')).toBe('a');
    expect(cache.get('custom-ttl')).toBe('b');
  });

  it('deletes entries', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('clears all entries', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('invalidates by tag', () => {
    cache.set('k1', 'v1', undefined, ['tag-a']);
    cache.set('k2', 'v2', undefined, ['tag-b']);
    cache.set('k3', 'v3', undefined, ['tag-a']);
    const count = cache.invalidateByTag('tag-a');
    expect(count).toBe(2);
    expect(cache.get('k1')).toBeUndefined();
    expect(cache.get('k2')).toBe('v2');
    expect(cache.get('k3')).toBeUndefined();
  });

  it('invalidates by prefix', () => {
    cache.set('file:src/a.ts:123', 'data1');
    cache.set('file:src/b.ts:456', 'data2');
    cache.set('project:root', 'data3');
    const count = cache.invalidateByPrefix('file:src/a');
    expect(count).toBe(1);
    expect(cache.get('file:src/a.ts:123')).toBeUndefined();
    expect(cache.get('file:src/b.ts:456')).toBe('data2');
  });

  it('invalidates by pattern', () => {
    cache.set('llm:abc:model', 'data1');
    cache.set('llm:def:model', 'data2');
    cache.set('file:abc:model', 'data3');
    const count = cache.invalidateByPattern(/^llm:/);
    expect(count).toBe(2);
    expect(cache.get('file:abc:model')).toBe('data3');
  });

  it('has() checks existence', () => {
    expect(cache.has('x')).toBe(false);
    cache.set('x', 'y');
    expect(cache.has('x')).toBe(true);
  });

  it('cleanup removes expired entries', async () => {
    cache.set('expired', 'data', 10);
    cache.set('valid', 'data', 100_000);
    await new Promise((r) => setTimeout(r, 20));
    const removed = cache.cleanup();
    expect(removed).toBe(1);
    expect(cache.size).toBe(1);
  });

  it('returns keys', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.keys()).toEqual(['a', 'b']);
  });
});
