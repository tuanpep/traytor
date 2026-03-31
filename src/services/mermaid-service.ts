import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getLogger } from '../utils/logger.js';

export interface MermaidOptions {
  theme?: 'default' | 'dark' | 'forest' | 'neutral';
  backgroundColor?: string;
  width?: number;
  height?: number;
}

export class MermaidService {
  private logger = getLogger();
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'traytor-mermaid');
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  generateDiagramFromPlan(plan: {
    title?: string;
    steps: { title: string; description?: string }[];
  }): string {
    const lines: string[] = ['graph TD'];

    const stepId = 'A';
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const currentId = String.fromCharCode(65 + i);
      const sanitizedTitle = this.sanitizeNodeLabel(step.title);

      if (i === 0) {
        lines.push(`    ${stepId}((Start))`);
        lines.push(`    ${stepId} --> ${currentId}[${sanitizedTitle}]`);
      } else {
        const prevId = String.fromCharCode(65 + i - 1);
        lines.push(`    ${prevId} --> ${currentId}[${sanitizedTitle}]`);
      }

      if (step.description) {
        const sanitizedDesc = this.sanitizeNodeLabel(step.description.substring(0, 100));
        lines.push(`    ${currentId} -.-> ${currentId}_desc[${sanitizedDesc}]`);
      }
    }

    const lastId = String.fromCharCode(65 + plan.steps.length - 1);
    lines.push(`    ${lastId} --> Z((Done))`);

    return lines.join('\n');
  }

  generateFlowchart(steps: { name: string; dependsOn?: string[] }[]): string {
    const lines: string[] = ['graph LR'];
    const nodeIds = new Map<string, string>();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const id = String.fromCharCode(65 + i);
      nodeIds.set(step.name, id);
      lines.push(`    ${id}[${this.sanitizeNodeLabel(step.name)}]`);
    }

    for (const step of steps) {
      const stepId = nodeIds.get(step.name)!;
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          const depId = nodeIds.get(dep);
          if (depId) {
            lines.push(`    ${depId} --> ${stepId}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  generateSequenceDiagram(
    participants: string[],
    interactions: {
      from: string;
      to: string;
      message: string;
    }[]
  ): string {
    const lines: string[] = ['sequenceDiagram'];

    for (const participant of participants) {
      lines.push(`    ${this.sanitizeParticipant(participant)}`);
    }

    for (const interaction of interactions) {
      const from = this.sanitizeParticipant(interaction.from);
      const to = this.sanitizeParticipant(interaction.to);
      lines.push(`    ${from}->>+${to}: ${interaction.message}`);
      lines.push(`    ${to}-->>-${from}: OK`);
    }

    return lines.join('\n');
  }

  generateClassDiagram(
    classes: {
      name: string;
      properties: string[];
      methods: string[];
    }[]
  ): string {
    const lines: string[] = ['classDiagram'];

    for (const cls of classes) {
      lines.push(`    class ${cls.name} {`);
      for (const prop of cls.properties) {
        lines.push(`        ${prop}`);
      }
      for (const method of cls.methods) {
        lines.push(`        ${method}()`);
      }
      lines.push(`    }`);
    }

    return lines.join('\n');
  }

  private sanitizeNodeLabel(label: string): string {
    return label
      .replace(/"/g, "'")
      .replace(/\n/g, ' ')
      .replace(/<[^>]*>/g, '')
      .substring(0, 50);
  }

  private sanitizeParticipant(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  async exportToPng(
    mermaidCode: string,
    outputPath: string,
    options?: MermaidOptions
  ): Promise<void> {
    try {
      const { execSync } = await import('child_process');

      const configFile = path.join(this.tempDir, `config_${Date.now()}.json`);
      const config = {
        theme: options?.theme ?? 'default',
        backgroundColor: options?.backgroundColor ?? '#ffffff',
        width: options?.width ?? 800,
        height: options?.height ?? 600,
      };
      fs.writeFileSync(configFile, JSON.stringify(config));

      const inputFile = path.join(this.tempDir, `input_${Date.now()}.mmd`);
      fs.writeFileSync(inputFile, mermaidCode);

      const command = `npx --yes @mermaid-js/mermaid-cli mmdc -i "${inputFile}" -o "${outputPath}" -b "${config.backgroundColor}" -w ${config.width} -H ${config.height} 2>/dev/null || echo "Mermaid CLI not available"`;

      try {
        execSync(command, { stdio: 'pipe' });
        this.logger.info(`Exported mermaid to ${outputPath}`);
      } catch {
        this.logger.warn(
          'Mermaid CLI not available. Install with: npm install -g @mermaid-js/mermaid-cli'
        );
      }

      try {
        fs.unlinkSync(configFile);
        fs.unlinkSync(inputFile);
      } catch {
        // Ignore cleanup errors
      }
    } catch (error) {
      this.logger.error(`Failed to export mermaid: ${error}`);
      throw error;
    }
  }

  async exportToSvg(
    mermaidCode: string,
    outputPath: string,
    _options?: MermaidOptions
  ): Promise<void> {
    void _options;
    try {
      const { execSync } = await import('child_process');

      const inputFile = path.join(this.tempDir, `input_${Date.now()}.mmd`);
      fs.writeFileSync(inputFile, mermaidCode);

      const command = `npx --yes @mermaid-js/mermaid-cli mmdc -i "${inputFile}" -o "${outputPath}" -b transparent -o svg 2>/dev/null || echo "Mermaid CLI not available"`;

      try {
        execSync(command, { stdio: 'pipe' });
        this.logger.info(`Exported mermaid to ${outputPath}`);
      } catch {
        this.logger.warn(
          'Mermaid CLI not available. Install with: npm install -g @mermaid-js/mermaid-cli'
        );
      }

      try {
        fs.unlinkSync(inputFile);
      } catch {
        // Ignore cleanup errors
      }
    } catch (error) {
      this.logger.error(`Failed to export mermaid: ${error}`);
      throw error;
    }
  }

  validateMermaid(code: string): { valid: boolean; error?: string } {
    try {
      if (!code.trim()) {
        return { valid: false, error: 'Empty mermaid code' };
      }

      const validDiagrams = [
        'graph',
        'flowchart',
        'pie',
        'sequenceDiagram',
        'classDiagram',
        'stateDiagram',
        'erDiagram',
        'gantt',
        'gitGraph',
        'requirementDiagram',
      ];

      const firstWord = code.trim().split(/\s/)[0];
      if (!validDiagrams.some((d) => firstWord.startsWith(d))) {
        return { valid: false, error: `Unknown diagram type: ${firstWord}` };
      }

      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      if (openBraces !== closeBraces) {
        return { valid: false, error: 'Mismatched braces' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  getMermaidUrl(code: string): string {
    const encoded = encodeURIComponent(code);
    return `https://mermaid.ink/svg/${encoded}`;
  }

  getMermaidLiveUrl(code: string): string {
    const encoded = encodeURIComponent(code);
    return `https://mermaid.live/edit#eyJjb2RlIjoi${encoded}`;
  }
}

export const mermaidService = new MermaidService();
