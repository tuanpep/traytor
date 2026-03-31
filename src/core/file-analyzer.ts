import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import ignore, { type Ignore } from 'ignore';
import { getLogger } from '../utils/logger.js';
import type { SymbolReference } from '../models/symbol-reference.js';

// ─── Data Models ──────────────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'vue'
  | 'svelte';

const EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXTENSION_LANGUAGE_MAP));

export interface AnalyzedFile {
  path: string;
  relativePath: string;
  language: SupportedLanguage;
  size: number;
  lineCount: number;
  symbols: SymbolReference[];
  imports: string[];
  exports: string[];
}

export interface DirectoryNode {
  name: string;
  path: string;
  children: DirectoryNode[];
  files: string[];
}

export interface ImportMap {
  [filePath: string]: string[];
}

export interface ExportMap {
  [filePath: string]: string[];
}

export interface ProjectSummary {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, { files: number; lines: number }>;
}

export interface Codebase {
  rootPath: string;
  files: AnalyzedFile[];
  structure: DirectoryNode;
  imports: ImportMap;
  exports: ExportMap;
  summary: ProjectSummary;
}

// ─── Symbol Extraction Patterns ───────────────────────────────────────────────

const JS_TS_PATTERNS: {
  kind: SymbolReference['kind'];
  regex: RegExp;
}[] = [
  // Functions: function name(), const name = () =>, const name = function()
  { kind: 'function', regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g },
  { kind: 'function', regex: /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g },
  { kind: 'function', regex: /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*|[^=])=>/g },
  // Classes
  { kind: 'class', regex: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g },
  // Interfaces
  { kind: 'interface', regex: /(?:export\s+)?interface\s+(\w+)/g },
  // Type aliases
  { kind: 'type', regex: /(?:export\s+)?type\s+(\w+)\s*(?:<|=\s)/g },
  // Enums
  { kind: 'enum', regex: /(?:export\s+)?enum\s+(\w+)/g },
];

const PYTHON_PATTERNS: {
  kind: SymbolReference['kind'];
  regex: RegExp;
}[] = [
  // Functions: def name(
  { kind: 'function', regex: /def\s+(\w+)\s*\(/g },
  // Classes: class Name:
  { kind: 'class', regex: /class\s+(\w+)/g },
];

// Import/export patterns
const JS_TS_IMPORT_REGEX = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
const JS_TS_EXPORT_REGEX =
  /export\s+(?:default\s+)?(?:\{[^}]*\}|\*\s+from\s+['"]([^'"]+)['"]|\w+(?:\s+as\s+\w+)?)\s*;?/g;
const PYTHON_IMPORT_REGEX = /(?:from\s+([\w.]+)\s+)?import\s+(?:\([\s\S]*?\)|[^;\n]+)/g;

// ─── FileAnalyzer ─────────────────────────────────────────────────────────────

export class FileAnalyzer {
  private logger = getLogger();
  private gitignore: Ignore;
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    this.gitignore = ignore();
    this.loadGitignore();
  }

  private loadGitignore(): void {
    const gitignorePath = path.join(this.rootPath, '.gitignore');
    try {
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        this.gitignore.add(content);
        this.logger.debug(`Loaded .gitignore with ${content.split('\n').length} lines`);
      }
    } catch (error) {
      this.logger.warn('Failed to load .gitignore:', error);
    }
  }

  async analyze(): Promise<Codebase> {
    this.logger.info(`Analyzing codebase at ${this.rootPath}`);

    const filePaths = await this.scanFiles();
    const files = this.analyzeFiles(filePaths);
    const structure = this.buildDirectoryTree(files);
    const imports = this.buildImportMap(files);
    const exports = this.buildExportMap(files);
    const summary = this.buildSummary(files);

    return {
      rootPath: this.rootPath,
      files,
      structure,
      imports,
      exports,
      summary,
    };
  }

  private async scanFiles(): Promise<string[]> {
    // Common directories to always ignore
    const defaultIgnores = ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage'];

    const patterns = Array.from(SUPPORTED_EXTENSIONS).map(
      (ext) => `**/*${ext}`
    );

    const allFiles = await glob(patterns, {
      cwd: this.rootPath,
      absolute: true,
      ignore: defaultIgnores.map((dir) => `**/${dir}/**`),
      dot: false,
    });

    // Filter using .gitignore rules
    const filtered = allFiles.filter((filePath) => {
      const relativePath = path.relative(this.rootPath, filePath);
      return !this.gitignore.ignores(relativePath);
    });

    this.logger.debug(`Found ${allFiles.length} files, ${filtered.length} after .gitignore filtering`);
    return filtered;
  }

  private analyzeFiles(filePaths: string[]): AnalyzedFile[] {
    return filePaths.map((filePath) => this.analyzeFile(filePath)).filter((f): f is AnalyzedFile => f !== null);
  }

  private analyzeFile(filePath: string): AnalyzedFile | null {
    try {
      const ext = path.extname(filePath);
      const language = EXTENSION_LANGUAGE_MAP[ext];
      if (!language) return null;

      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(this.rootPath, filePath);
      const stat = fs.statSync(filePath);
      const lineCount = content.split('\n').length;

      const symbols = this.extractSymbols(content, language, relativePath);
      const imports = this.extractImports(content, language);
      const exports_ = this.extractExports(content, language);

      return {
        path: filePath,
        relativePath,
        language,
        size: stat.size,
        lineCount,
        symbols,
        imports,
        exports: exports_,
      };
    } catch (error) {
      this.logger.warn(`Failed to analyze file ${filePath}:`, error);
      return null;
    }
  }

  private extractSymbols(content: string, language: SupportedLanguage, relativePath: string): SymbolReference[] {
    const symbols: SymbolReference[] = [];
    const lines = content.split('\n');
    const patterns = language === 'python' ? PYTHON_PATTERNS : JS_TS_PATTERNS;

    for (const { kind, regex } of patterns) {
      const regexCopy = new RegExp(regex.source, regex.flags);
      let match: RegExpExecArray | null;

      while ((match = regexCopy.exec(content)) !== null) {
        const name = match[1];
        if (!name) continue;

        // Find the line number
        const position = match.index;
        let currentPos = 0;
        let lineNum = 1;
        for (const line of lines) {
          currentPos += line.length + 1; // +1 for newline
          if (currentPos > position) break;
          lineNum++;
        }

        // Avoid duplicates
        if (!symbols.some((s) => s.name === name && s.kind === kind)) {
          symbols.push({
            name,
            kind,
            filePath: relativePath,
            line: lineNum,
          });
        }
      }
    }

    return symbols;
  }

  private extractImports(content: string, language: SupportedLanguage): string[] {
    const imports: string[] = [];

    if (language === 'python') {
      let match: RegExpExecArray | null;
      const regex = new RegExp(PYTHON_IMPORT_REGEX.source, PYTHON_IMPORT_REGEX.flags);
      while ((match = regex.exec(content)) !== null) {
        const module = match[1] || match[0].replace(/^(?:from\s+)?import\s+/, '').trim();
        imports.push(module);
      }
    } else {
      let match: RegExpExecArray | null;
      const regex = new RegExp(JS_TS_IMPORT_REGEX.source, JS_TS_IMPORT_REGEX.flags);
      while ((match = regex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  private extractExports(content: string, language: SupportedLanguage): string[] {
    const exports_: string[] = [];

    if (language === 'python') {
      // Python uses __all__ for explicit exports
      const allMatch = content.match(/^__all__\s*=\s*\[([^\]]*)\]/m);
      if (allMatch) {
        allMatch[1].split(',').forEach((name) => {
          const trimmed = name.trim().replace(/['"]/g, '');
          if (trimmed) exports_.push(trimmed);
        });
      }
    } else {
      let match: RegExpExecArray | null;
      const regex = new RegExp(JS_TS_EXPORT_REGEX.source, JS_TS_EXPORT_REGEX.flags);
      while ((match = regex.exec(content)) !== null) {
        if (match[1]) {
          // export * from '...'
          exports_.push(`*:${match[1]}`);
        }
        // Named/default exports are captured in the symbols
      }
    }

    return exports_;
  }

  private buildDirectoryTree(files: AnalyzedFile[]): DirectoryNode {
    const root: DirectoryNode = {
      name: path.basename(this.rootPath),
      path: this.rootPath,
      children: [],
      files: [],
    };

    for (const file of files) {
      const parts = file.relativePath.split(path.sep);
      this.insertIntoTree(root, parts, file.relativePath);
    }

    // Sort: directories first, then files, both alphabetically
    this.sortTree(root);

    return root;
  }

  private insertIntoTree(node: DirectoryNode, parts: string[], filePath: string): void {
    if (parts.length === 1) {
      node.files.push(filePath);
      return;
    }

    const [head, ...rest] = parts;
    let child = node.children.find((c) => c.name === head);

    if (!child) {
      child = {
        name: head,
        path: path.join(node.path, head),
        children: [],
        files: [],
      };
      node.children.push(child);
    }

    this.insertIntoTree(child, rest, filePath);
  }

  private sortTree(node: DirectoryNode): void {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.files.sort();
    for (const child of node.children) {
      this.sortTree(child);
    }
  }

  private buildImportMap(files: AnalyzedFile[]): ImportMap {
    const map: ImportMap = {};
    for (const file of files) {
      if (file.imports.length > 0) {
        map[file.relativePath] = file.imports;
      }
    }
    return map;
  }

  private buildExportMap(files: AnalyzedFile[]): ExportMap {
    const map: ExportMap = {};
    for (const file of files) {
      if (file.exports.length > 0) {
        map[file.relativePath] = file.exports;
      }
    }
    return map;
  }

  private buildSummary(files: AnalyzedFile[]): ProjectSummary {
    const languages: Record<string, { files: number; lines: number }> = {};
    let totalLines = 0;

    for (const file of files) {
      const lang = file.language;
      if (!languages[lang]) {
        languages[lang] = { files: 0, lines: 0 };
      }
      languages[lang].files++;
      languages[lang].lines += file.lineCount;
      totalLines += file.lineCount;
    }

    return {
      totalFiles: files.length,
      totalLines,
      languages,
    };
  }

  // ─── Relevance Scoring ────────────────────────────────────────────────────

  findRelevantFiles(codebase: Codebase, query: string, topN = 10): AnalyzedFile[] {
    const keywords = query
      .toLowerCase()
      .split(/[\s,;.!?]+/)
      .filter((k) => k.length > 2); // Skip short words

    const scored = codebase.files.map((file) => {
      let score = 0;
      const fileName = path.basename(file.relativePath).toLowerCase();
      const fileExt = path.extname(file.relativePath).toLowerCase();
      const fileStem = path.basename(file.relativePath, fileExt).toLowerCase();

      for (const keyword of keywords) {
        // Filename match = 10 points
        if (fileName.includes(keyword)) {
          score += 10;
        }
        // Stem match (without extension) = 5 points
        if (fileStem === keyword) {
          score += 5;
        }
        // Symbol name match = 8 points
        for (const symbol of file.symbols) {
          if (symbol.name.toLowerCase() === keyword) {
            score += 8;
            break;
          }
        }
        // Content occurrence = 1 point each (counted once per keyword)
        try {
          const content = fs.readFileSync(file.path, 'utf-8').toLowerCase();
          const occurrences = content.split(keyword).length - 1;
          score += Math.min(occurrences, 5); // Cap at 5 per keyword to avoid noise
        } catch {
          // File may not be readable
        }
      }

      return { file, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map((s) => s.file);
  }
}
