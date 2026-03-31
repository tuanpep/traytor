import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileStorage } from '../src/data/storage/file-storage.js';

interface TestRecord {
  id: string;
  name: string;
  value: number;
}

describe('FileStorage', () => {
  const tmpDirs: string[] = [];
  let storage: FileStorage<TestRecord>;

  beforeEach(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'traytor-storage-'));
    tmpDirs.push(dir);
    storage = new FileStorage<TestRecord>(dir);
  });

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  describe('save and load', () => {
    it('saves and loads a record', async () => {
      const record: TestRecord = { id: 'test_1', name: 'hello', value: 42 };
      await storage.save(record.id, record);
      const loaded = await storage.load(record.id);
      expect(loaded).toEqual(record);
    });

    it('returns null for non-existent record', async () => {
      const loaded = await storage.load('nonexistent');
      expect(loaded).toBeNull();
    });

    it('overwrites existing record', async () => {
      const record: TestRecord = { id: 'test_1', name: 'first', value: 1 };
      await storage.save(record.id, record);

      const updated: TestRecord = { id: 'test_1', name: 'second', value: 2 };
      await storage.save(updated.id, updated);

      const loaded = await storage.load(record.id);
      expect(loaded).toEqual(updated);
    });

    it('creates directory if it does not exist', async () => {
      const nestedDir = path.join(tmpDirs[0], 'nested', 'deep');
      const nestedStorage = new FileStorage<TestRecord>(nestedDir);
      const record: TestRecord = { id: 'test_nested', name: 'nested', value: 99 };
      await nestedStorage.save(record.id, record);

      const loaded = await nestedStorage.load(record.id);
      expect(loaded).toEqual(record);
    });
  });

  describe('delete', () => {
    it('deletes an existing record and returns true', async () => {
      const record: TestRecord = { id: 'test_del', name: 'delete-me', value: 1 };
      await storage.save(record.id, record);

      const result = await storage.delete(record.id);
      expect(result).toBe(true);

      const loaded = await storage.load(record.id);
      expect(loaded).toBeNull();
    });

    it('returns false for non-existent record', async () => {
      const result = await storage.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('returns true for existing record', async () => {
      const record: TestRecord = { id: 'test_exists', name: 'exists', value: 1 };
      await storage.save(record.id, record);

      const result = await storage.exists(record.id);
      expect(result).toBe(true);
    });

    it('returns false for non-existent record', async () => {
      const result = await storage.exists('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    it('returns empty array when no records exist', async () => {
      const records = await storage.list();
      expect(records).toEqual([]);
    });

    it('returns empty array when directory does not exist', async () => {
      const nonExistentStorage = new FileStorage<TestRecord>('/tmp/nonexistent_dir_xyz');
      const records = await nonExistentStorage.list();
      expect(records).toEqual([]);
    });

    it('lists all saved records', async () => {
      const records: TestRecord[] = [
        { id: 'test_a', name: 'alpha', value: 1 },
        { id: 'test_b', name: 'beta', value: 2 },
        { id: 'test_c', name: 'gamma', value: 3 },
      ];

      for (const record of records) {
        await storage.save(record.id, record);
      }

      const loaded = await storage.list();
      expect(loaded).toHaveLength(3);
      expect(loaded).toEqual(expect.arrayContaining(records));
    });

    it('ignores non-JSON files in the directory', async () => {
      await storage.save('test_valid', { id: 'test_valid', name: 'valid', value: 1 });

      // Create a non-JSON file in the same directory
      await fs.writeFile(path.join(tmpDirs[0], 'readme.txt'), 'not json', 'utf8');

      const loaded = await storage.list();
      expect(loaded).toHaveLength(1);
    });
  });

  describe('safe filename conversion', () => {
    it('handles IDs with special characters', async () => {
      const record: TestRecord = { id: 'task/with/slashes', name: 'slashes', value: 1 };
      await storage.save(record.id, record);

      const loaded = await storage.load(record.id);
      expect(loaded).toEqual(record);
    });

    it('handles IDs with spaces', async () => {
      const record: TestRecord = { id: 'task with spaces', name: 'spaces', value: 2 };
      await storage.save(record.id, record);

      const loaded = await storage.load(record.id);
      expect(loaded).toEqual(record);
    });
  });
});
