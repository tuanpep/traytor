import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';
import { AgentExecutionError } from '../utils/errors.js';
import { TemplateEngine } from './template-engine.js';
import type { Plan } from '../models/plan.js';
import type { Task } from '../models/task.js';
import type { Config, AgentConfig, MCPServerConfig } from '../config/schema.js';
import type { MCPClient } from '../integrations/mcp/mcp-client.js';
import type { MCPTool } from '../integrations/mcp/types.js';

// ─── Agent Execution Options ────────────────────────────────────────────────

export interface AgentExecutionOptions {
  /** Working directory for the agent process */
  cwd?: string;
  /** Timeout in milliseconds (default: from config or 300000) */
  timeout?: number;
  /** Extra environment variables to pass to the agent */
  extraEnv?: Record<string, string>;
  /** Specific agent name to use (overrides defaultAgent config) */
  agentName?: string;
  /** Custom template name to use for rendering the prompt */
  templateName?: string;
  /** Skip loading MCP tools for this execution */
  skipMCPLoading?: boolean;
}

export interface AgentExecutionResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

// ─── Default Agent Config ───────────────────────────────────────────────────

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: 'claude-code',
  command: 'claude',
  args: ['--dangerously-skip-permissions'],
  shell: 'bash',
  env: {},
  timeout: 300_000,
};

// ─── AgentService ───────────────────────────────────────────────────────────

export class AgentService {
  private logger = getLogger();
  private templateEngine: TemplateEngine;
  private mcpClient?: MCPClient;
  private mcpToolsCache: Map<string, MCPTool[]> = new Map();

  constructor(
    private readonly config: Config,
    mcpClient?: MCPClient
  ) {
    this.templateEngine = new TemplateEngine();
    this.mcpClient = mcpClient;
  }

  setMCPClient(mcpClient: MCPClient): void {
    this.mcpClient = mcpClient;
  }

  async loadMCPTools(servers?: MCPServerConfig[]): Promise<Map<string, MCPTool[]>> {
    const serverConfigs = servers ?? this.config.mcp?.servers ?? [];

    if (!this.mcpClient || serverConfigs.length === 0) {
      return new Map();
    }

    this.logger.info(`Loading MCP tools from ${serverConfigs.length} servers`);

    for (const server of serverConfigs) {
      try {
        await this.mcpClient.connect(server);
        const tools = await this.mcpClient.listTools(server);
        this.mcpToolsCache.set(server.name, tools);
        this.logger.debug(`Loaded ${tools.length} tools from MCP server "${server.name}"`);
      } catch (error) {
        this.logger.warn(
          `Failed to load MCP tools from "${server.name}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return this.mcpToolsCache;
  }

  getMCPTools(): Map<string, MCPTool[]> {
    return this.mcpToolsCache;
  }

  formatMCPToolsForPrompt(): string {
    if (this.mcpToolsCache.size === 0) {
      return '';
    }

    const lines: string[] = ['## Available MCP Tools\n'];

    for (const [serverName, tools] of this.mcpToolsCache.entries()) {
      lines.push(`\n### ${serverName}\n`);
      for (const tool of tools) {
        lines.push(`- **${tool.name}**`);
        if (tool.description) {
          lines.push(`  ${tool.description}`);
        }
        if (
          tool.inputSchema &&
          typeof tool.inputSchema === 'object' &&
          'properties' in tool.inputSchema
        ) {
          const props =
            (
              tool.inputSchema as {
                properties?: Record<string, { description?: string; type?: string }>;
              }
            ).properties ?? {};
          const paramNames = Object.keys(props);
          if (paramNames.length > 0) {
            lines.push(`  Parameters: ${paramNames.join(', ')}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Execute a task by handing off to the configured agent.
   * Renders the plan into a prompt, sets environment variables, and spawns the process.
   */
  async execute(task: Task, options: AgentExecutionOptions = {}): Promise<AgentExecutionResult> {
    const agentConfig = this.resolveAgentConfig(options.agentName);
    const plan = task.plan;

    if (!plan) {
      throw new AgentExecutionError(agentConfig.name, `Task "${task.id}" has no plan to execute`, {
        taskId: task.id,
      });
    }

    // 1. Load MCP tools if not already loaded
    if (!options.skipMCPLoading && this.mcpToolsCache.size === 0) {
      await this.loadMCPTools();
    }

    // 2. Render the plan into an agent prompt
    let prompt = this.renderPlanPrompt(task, plan, options.templateName);

    // 3. Add MCP tools to the prompt if available
    const mcpToolsPrompt = this.formatMCPToolsForPrompt();
    if (mcpToolsPrompt) {
      prompt += '\n\n' + mcpToolsPrompt;
    }

    // 4. Create a temp file with the prompt
    const tmpFile = this.writeTempFile(prompt);

    // 5. Build environment variables (merge agent-specific env)
    const mergedExtraEnv = { ...agentConfig.env, ...options.extraEnv };
    const env = this.buildEnvVars(task, prompt, tmpFile, mergedExtraEnv);

    // 6. Spawn the agent process
    const timeout = options.timeout ?? agentConfig.timeout;
    const result = await this.spawnAgent(agentConfig, env, timeout, options.cwd);

    // 5. Schedule temp file cleanup (after 30 seconds)
    this.scheduleTempFileCleanup(tmpFile);

    return result;
  }

  /**
   * Render the plan into a structured prompt for the agent.
   * Supports custom template names.
   */
  renderPlanPrompt(task: Task, plan: Plan, templateName?: string): string {
    const steps = plan.steps.map((step) => ({
      title: step.title,
      description: step.description,
      files: step.files,
    }));

    const systemPrompt = `You are implementing the following plan. Follow each step carefully.

Task: ${task.query}

Steps:
${plan.steps.map((step, i) => `${i + 1}. ${step.title}\n   ${step.description}`).join('\n\n')}

${plan.rationale ? `Rationale: ${plan.rationale}` : ''}

Implement all steps completely. Do not skip any steps.`;

    let prompt: string;

    if (templateName) {
      // Use a custom template
      prompt = this.templateEngine.render(templateName, {
        query: task.query,
        planMarkdown: systemPrompt,
        taskId: task.id,
        timestamp: new Date().toISOString(),
        basePrompt: systemPrompt,
      });
    } else {
      // Use the default plan template
      prompt = this.templateEngine.renderPlanTemplate({
        query: task.query,
        projectDescription: `Implementation plan for: ${task.query}`,
        projectContext: {
          totalFiles: 0,
          totalLines: 0,
          languages: {},
        },
        relevantFiles: steps.flatMap((step) =>
          step.files.map((file) => ({
            relativePath: file,
            language: path.extname(file).slice(1) || 'unknown',
            symbols: [],
            content: '',
          }))
        ),
        agentsMd: null,
      });
    }

    // Combine system prompt with the rendered template
    return `${systemPrompt}\n\n---\n\n${prompt}`;
  }

  /**
   * Resolve the agent configuration from config or use defaults.
   * Supports looking up by name (from --agent flag or defaultAgent config).
   */
  resolveAgentConfig(agentName?: string): AgentConfig {
    const name = agentName ?? this.config.defaultAgent;

    if (name) {
      const found = this.config.agents.find((a) => a.name === name);
      if (found) {
        this.logger.debug(`Using agent "${name}" from config`);
        return found;
      }
      this.logger.warn(`Agent "${name}" not found in config, falling back to default`);
    }

    if (this.config.agents.length > 0) {
      // Use the first configured agent
      return this.config.agents[0];
    }
    return DEFAULT_AGENT_CONFIG;
  }

  /**
   * Write the prompt to a temporary file and return its path.
   */
  private writeTempFile(prompt: string): string {
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `traytor-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tmpPath, prompt, 'utf-8');
    this.logger.debug(`Prompt written to temp file: ${tmpPath}`);
    return tmpPath;
  }

  /**
   * Build environment variables for the agent process.
   */
  private buildEnvVars(
    task: Task,
    prompt: string,
    tmpFile: string,
    extraEnv?: Record<string, string>
  ): Record<string, string> {
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      TRAYTOR_PROMPT: prompt,
      TRAYTOR_PROMPT_TMP_FILE: tmpFile,
      TRAYTOR_TASK_ID: task.id,
      TRAYTOR_SYSTEM_PROMPT: `Implement the plan for task ${task.id}: ${task.query}`,
    };

    if (extraEnv) {
      Object.assign(env, extraEnv);
    }

    return env;
  }

  /**
   * Spawn the agent CLI process and capture output.
   * Supports bash and powershell shell modes.
   */
  private spawnAgent(
    agentConfig: AgentConfig,
    env: Record<string, string>,
    timeout: number,
    cwd?: string
  ): Promise<AgentExecutionResult> {
    return new Promise((resolve, reject) => {
      const prompt = env.TRAYTOR_PROMPT || '';
      const tmpFile = env.TRAYTOR_PROMPT_TMP_FILE || '';
      const agentName = agentConfig.name;

      // Build command based on agent type
      let fullCommand: string;
      let useStdin = false;

      if (agentName === 'claude' || agentName === 'cursor') {
        // Claude Code and cursor-agent: use temp file approach
        // claude -p "prompt" or read from file
        if (tmpFile) {
          fullCommand = `${agentConfig.command} ${agentConfig.args.join(' ')} -p "$(cat ${tmpFile})"`;
        } else {
          fullCommand = `${agentConfig.command} ${agentConfig.args.join(' ')} -p "${prompt.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
        }
      } else if (agentName === 'opencode') {
        // OpenCode: use --print with stdin
        fullCommand = `${agentConfig.command} ${agentConfig.args.join(' ')}`;
        useStdin = true;
      } else {
        // Default: use args as-is, stdin for prompt
        fullCommand = [agentConfig.command, ...agentConfig.args].join(' ');
        useStdin = true;
      }

      this.logger.info(`Spawning agent: ${fullCommand} (shell: ${agentConfig.shell})`);

      let child: ChildProcess;
      try {
        const spawnOptions: SpawnOptions = {
          env,
          cwd: cwd || process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        };

        if (agentConfig.shell === 'powershell') {
          spawnOptions.shell = 'powershell.exe';
        } else {
          spawnOptions.shell = true;
        }

        child = spawn(fullCommand, spawnOptions);

        if (useStdin && prompt) {
          child.stdin?.write(prompt);
          child.stdin?.end();
        }
      } catch (error) {
        reject(
          new AgentExecutionError(
            agentConfig.name,
            `Failed to spawn agent: ${error instanceof Error ? error.message : String(error)}`,
            { command: agentConfig.command }
          )
        );
        return;
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      const startTime = Date.now();

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        // Stream output to the user in real-time
        process.stdout.write(chunk);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
        process.stderr.write(chunk);
      });

      // Set up timeout
      const timer = setTimeout(() => {
        this.logger.warn(`Agent timed out after ${timeout}ms, killing process...`);
        child.kill('SIGKILL');
      }, timeout);

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(
          new AgentExecutionError(agentConfig.name, `Agent process error: ${error.message}`, {
            command: agentConfig.command,
          })
        );
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');

        this.logger.info(`Agent exited with code ${code} in ${durationMs}ms`);

        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr,
          durationMs,
        });
      });

      child.on('exit', () => {
        // 'close' is the primary event, this handles edge cases
      });
    });
  }

  /**
   * Schedule temp file cleanup after 30 seconds.
   */
  private scheduleTempFileCleanup(tmpFile: string): void {
    setTimeout(() => {
      try {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
          this.logger.debug(`Cleaned up temp file: ${tmpFile}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to clean up temp file ${tmpFile}:`, error);
      }
    }, 30_000);
  }
}
