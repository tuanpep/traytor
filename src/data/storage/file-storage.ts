import fs from 'node:fs/promises';
import path from 'node:path';

export class FileStorage<T> {
  constructor(private readonly baseDir: string) {}

  async save(id: string, value: T): Promise<void> {
    const filePath = this.filePath(id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  }

  async load(id: string): Promise<T | null> {
    const filePath = this.filePath(id);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.filePath(id);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    const filePath = this.filePath(id);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<T[]> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
      const values = await Promise.all(
        jsonFiles.map(async (entry) => {
          const fullPath = path.join(this.baseDir, entry.name);
          const raw = await fs.readFile(fullPath, 'utf8');
          return JSON.parse(raw) as T;
        })
      );
      return values;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private filePath(id: string): string {
    const safeName = toSafeFilename(id);
    return path.join(this.baseDir, `${safeName}.json`);
  }
}

function toSafeFilename(id: string): string {
  return id.replace(/[^a-zA-Z0-9_.-]/g, '_');
}
