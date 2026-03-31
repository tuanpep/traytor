import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getLogger } from '../utils/logger.js';
import { FileAnalyzer, type Codebase } from './file-analyzer.js';
import type { Task } from '../models/task.js';

export interface ProjectContext {
  workingDirectory: string;
  summary: Codebase['summary'];
  agentsMd: string | null;
  projectConfig: Record<string, unknown> | null;
  packageJson: Record<string, unknown> | null;
}

export class ContextManager {
  private logger = getLogger();

  async gather(workingDirectory: string, _task?: Task): Promise<ProjectContext> {
    this.logger.info(`Gathering context from ${workingDirectory}`);

    const resolvedDir = path.resolve(workingDirectory);
    const analyzer = new FileAnalyzer(resolvedDir);
    const codebase = await analyzer.analyze();

    const agentsMd = this.findAgentsMd(resolvedDir);
    const projectConfig = this.loadProjectConfig(resolvedDir);
    const packageJson = this.loadPackageJson(resolvedDir);

    return {
      workingDirectory: resolvedDir,
      summary: codebase.summary,
      agentsMd,
      projectConfig,
      packageJson,
    };
  }

  async gatherWithCodebase(workingDirectory: string, task?: Task): Promise<ProjectContext & { codebase: Codebase }> {
    this.logger.info(`Gathering context with codebase from ${workingDirectory}`);

    const resolvedDir = path.resolve(workingDirectory);
    const analyzer = new FileAnalyzer(resolvedDir);
    const codebase = await analyzer.analyze();

    const agentsMd = this.findAgentsMd(resolvedDir);
    const projectConfig = this.loadProjectConfig(resolvedDir);
    const packageJson = this.loadPackageJson(resolvedDir);

    return {
      workingDirectory: resolvedDir,
      summary: codebase.summary,
      agentsMd,
      projectConfig,
      packageJson,
      codebase,
    };
  }

  findAgentsMd(startDir: string): string | null {
    let current = path.resolve(startDir);

    while (true) {
      const agentsPath = path.join(current, 'AGENTS.md');
      try {
        if (fs.existsSync(agentsPath)) {
          const content = fs.readFileSync(agentsPath, 'utf-8');
          this.logger.debug(`Found AGENTS.md at ${agentsPath}`);
          return content;
        }
      } catch {
        // Not readable, continue searching
      }

      const parent = path.dirname(current);
      // Reached filesystem root
      if (parent === current) {
        this.logger.debug('AGENTS.md not found in any parent directory');
        return null;
      }
      current = parent;
    }
  }

  loadProjectConfig(projectDir: string): Record<string, unknown> | null {
    const configPath = path.join(projectDir, '.sdd-tool', 'config.yaml');
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = parseYaml(content);
        this.logger.debug(`Loaded project config from ${configPath}`);
        return config as Record<string, unknown>;
      }
    } catch (error) {
      this.logger.warn(`Failed to load project config: ${error}`);
    }
    return null;
  }

  loadPackageJson(projectDir: string): Record<string, unknown> | null {
    const pkgPath = path.join(projectDir, 'package.json');
    try {
      if (fs.existsSync(pkgPath)) {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        this.logger.debug(`Loaded package.json from ${pkgPath}`);
        return pkg as Record<string, unknown>;
      }
    } catch (error) {
      this.logger.warn(`Failed to load package.json: ${error}`);
    }
    return null;
  }
}
