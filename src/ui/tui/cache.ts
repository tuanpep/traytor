import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../../utils/logger.js';

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  key: string;
  tags?: string[];
}

export interface CacheOptions {
  defaultTtlMs?: number;
  maxEntries?: number;
  persistPath?: string;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_ENTRIES = 500;

export class Cache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private readonly persistPath?: string;
  private logger = getLogger();

  constructor(options: CacheOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.persistPath = options.persistPath;

    if (this.persistPath) {
      this.loadFromDisk();
    }
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number, tags?: string[]): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
      createdAt: Date.now(),
      key,
      tags,
    };

    this.store.set(key, entry);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  invalidateByTag(tag: string): number {
    let count = 0;
    for (const [key, entry] of this.store) {
      if (entry.tags?.includes(tag)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateByPattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (pattern.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  cleanup(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  get size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return [...this.store.keys()];
  }

  private evictOldest(): void {
    let oldest: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldest = key;
      }
    }

    if (oldest) {
      this.store.delete(oldest);
    }
  }

  saveToDisk(): void {
    if (!this.persistPath) return;

    try {
      const dir = path.dirname(this.persistPath);
      fs.mkdirSync(dir, { recursive: true });

      const serializable = [...this.store.entries()].map(([key, entry]) => [
        key,
        { ...entry, value: entry.value },
      ]);

      fs.writeFileSync(this.persistPath, JSON.stringify(serializable), 'utf-8');
      this.logger.debug(`Cache saved to ${this.persistPath} (${serializable.length} entries)`);
    } catch (error) {
      this.logger.warn('Failed to save cache to disk:', error);
    }
  }

  private loadFromDisk(): void {
    if (!this.persistPath) return;

    try {
      if (!fs.existsSync(this.persistPath)) return;

      const raw = fs.readFileSync(this.persistPath, 'utf-8');
      const entries = JSON.parse(raw) as [string, CacheEntry<T>][];

      let loaded = 0;
      for (const [key, entry] of entries) {
        if (Date.now() > entry.expiresAt) continue;
        this.store.set(key, entry);
        loaded++;
      }

      this.logger.debug(`Cache loaded from ${this.persistPath} (${loaded} valid entries)`);
    } catch (error) {
      this.logger.warn('Failed to load cache from disk:', error);
    }
  }
}

// ─── File Analysis Cache ──────────────────────────────────────────────────

export interface FileAnalysisCacheKey {
  filePath: string;
  mtime: number;
}

export function buildFileAnalysisCacheKey(filePath: string, mtime: number): string {
  return `file:${filePath}:${mtime}`;
}

export function buildProjectAnalysisCacheKey(rootPath: string): string {
  return `project:${rootPath}`;
}

export function buildLLMResponseCacheKey(promptHash: string, model: string): string {
  return `llm:${promptHash}:${model}`;
}
