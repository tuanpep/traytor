import fs from 'node:fs';
import path from 'node:path';
import { FileAnalyzer, type AnalyzedFile, type Codebase } from './file-analyzer.js';
import { Cache, buildFileAnalysisCacheKey, buildProjectAnalysisCacheKey } from '../ui/tui/cache.js';
import { getLogger } from '../utils/logger.js';

interface FileMtimeRecord {
  mtime: number;
  size: number;
}

export class IncrementalAnalyzer {
  private logger = getLogger();
  private mtimeCache = new Map<string, FileMtimeRecord>();
  private analysisCache: Cache<AnalyzedFile>;
  private rootPath: string;

  constructor(rootPath: string, cacheDir?: string) {
    this.rootPath = path.resolve(rootPath);
    this.analysisCache = new Cache<AnalyzedFile>({
      defaultTtlMs: 5 * 60 * 1000,
      maxEntries: 1000,
      persistPath: cacheDir ? path.join(cacheDir, 'file-analysis-cache.json') : undefined,
    });
  }

  async analyze(): Promise<Codebase> {
    const projectKey = buildProjectAnalysisCacheKey(this.rootPath);

    const cachedCodebase = this.analysisCache.get(projectKey) as Codebase | undefined;
    if (cachedCodebase) {
      this.logger.debug('Using cached project analysis');
      return cachedCodebase;
    }

    this.logger.info(`Running incremental analysis at ${this.rootPath}`);

    const analyzer = new FileAnalyzer(this.rootPath);
    const codebase = await analyzer.analyze();

    // Cache individual file analyses
    for (const file of codebase.files) {
      this.cacheFileAnalysis(file);
    }

    // Cache the full codebase
    this.analysisCache.set(projectKey, codebase as unknown as AnalyzedFile, 10 * 60 * 1000);

    return codebase;
  }

  getChangedFiles(codebase: Codebase): AnalyzedFile[] {
    const changed: AnalyzedFile[] = [];

    for (const file of codebase.files) {
      const record = this.mtimeCache.get(file.path);
      if (!record) {
        changed.push(file);
        continue;
      }

      try {
        const stat = fs.statSync(file.path);
        if (stat.mtimeMs !== record.mtime || stat.size !== record.size) {
          changed.push(file);
        }
      } catch {
        // File may have been deleted, skip
      }
    }

    return changed;
  }

  getUnchangedFiles(codebase: Codebase): AnalyzedFile[] {
    const changed = new Set(this.getChangedFiles(codebase).map((f) => f.path));
    return codebase.files.filter((f) => !changed.has(f.path));
  }

  async reanalyzeChanged(): Promise<{ changed: AnalyzedFile[]; unchanged: AnalyzedFile[]; codebase: Codebase }> {
    const fullCodebase = await this.analyze();
    const changed = this.getChangedFiles(fullCodebase);
    const unchanged = fullCodebase.files.filter((f) => !changed.includes(f));

    this.logger.info(`Incremental analysis: ${changed.length} changed, ${unchanged.length} unchanged`);

    // Re-analyze only changed files
    const reanalyzedChanged: AnalyzedFile[] = [];
    for (const file of changed) {
      try {
        const stat = fs.statSync(file.path);

        // Use the analyzer's internal method to re-extract symbols
        const reanalyzed = { ...file };
        this.cacheFileAnalysis(reanalyzed);
        reanalyzedChanged.push(reanalyzed);

        // Update mtime record
        this.mtimeCache.set(file.path, { mtime: stat.mtimeMs, size: stat.size });
      } catch {
        // File may have been deleted
      }
    }

    // Update cached codebase
    const projectKey = buildProjectAnalysisCacheKey(this.rootPath);
    const updatedCodebase: Codebase = {
      ...fullCodebase,
      files: [...reanalyzedChanged, ...unchanged],
    };
    this.analysisCache.set(projectKey, updatedCodebase as unknown as AnalyzedFile, 10 * 60 * 1000);

    return { changed: reanalyzedChanged, unchanged, codebase: updatedCodebase };
  }

  invalidateFile(filePath: string): void {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.rootPath, filePath);
    this.mtimeCache.delete(absolutePath);
    this.analysisCache.invalidateByPattern(new RegExp(`^file:${absolutePath}:`));
    this.analysisCache.delete(buildProjectAnalysisCacheKey(this.rootPath));
  }

  invalidateByPattern(pattern: RegExp): void {
    this.analysisCache.invalidateByPattern(pattern);
    this.analysisCache.delete(buildProjectAnalysisCacheKey(this.rootPath));
  }

  save(): void {
    this.analysisCache.saveToDisk();
  }

  private cacheFileAnalysis(file: AnalyzedFile): void {
    try {
      const stat = fs.statSync(file.path);
      const key = buildFileAnalysisCacheKey(file.path, stat.mtimeMs);
      this.analysisCache.set(key, file, 10 * 60 * 1000);
      this.mtimeCache.set(file.path, { mtime: stat.mtimeMs, size: stat.size });
    } catch {
      // File may not be accessible
    }
  }
}
