import path from 'node:path';
import { ConfigLoader } from '../config/loader.js';
import { TaskRepository } from '../data/repositories/task.repository.js';
import { TaskService } from '../services/task.service.js';
import { PlanGenerator } from '../services/plan-generator.js';
import { PhaseGenerator } from '../services/phase-generator.js';
import { ReviewGenerator } from '../services/review-generator.js';
import { AgentService } from '../services/agent-service.js';
import { EpicService } from '../services/epic.service.js';
import { EpicGenerator } from '../services/epic-generator.js';
import { TemplateEngine } from '../services/template-engine.js';
import { GitService } from '../services/git-service.js';
import { WorkflowEngine } from '../services/workflow-engine.js';
import { LLMService } from '../integrations/llm/llm-service.js';
import { MCPClient } from '../integrations/mcp/mcp-client.js';
import { Verifier } from '../core/verifier.js';
import type { Config } from '../config/schema.js';

export interface AppContext {
  taskService: TaskService;
  configLoader: ConfigLoader;
  config: Config;
  llmService: LLMService;
  mcpClient: MCPClient;
  planGenerator: PlanGenerator;
  phaseGenerator: PhaseGenerator;
  reviewGenerator: ReviewGenerator;
  templateEngine: TemplateEngine;
  agentService: AgentService;
  verifier: Verifier;
  epicService: EpicService;
  epicGenerator: EpicGenerator;
  gitService: GitService;
  workflowEngine: WorkflowEngine;
}

export async function bootstrap(workingDir = process.cwd()): Promise<AppContext> {
  const configLoader = new ConfigLoader();
  const config = await configLoader.load({ cwd: workingDir });

  const taskRepository = new TaskRepository(config.dataDir);
  const llmService = new LLMService(config);
  const mcpClient = new MCPClient();

  // Resolve custom template directory from config or project .traytor/templates
  const customTemplateDir =
    config.templates.customDir ?? path.join(workingDir, '.traytor', 'templates');

  const templateEngine = new TemplateEngine(customTemplateDir);
  const planGenerator = new PlanGenerator(llmService, templateEngine, workingDir);
  const phaseGenerator = new PhaseGenerator(llmService, templateEngine, workingDir);
  const reviewGenerator = new ReviewGenerator(llmService, workingDir);
  const agentService = new AgentService(config);
  const verifier = new Verifier(llmService, workingDir);
  const epicService = new EpicService(taskRepository);
  const epicGenerator = new EpicGenerator(llmService, templateEngine, workingDir);
  const gitService = new GitService(workingDir);
  const workflowEngine = new WorkflowEngine({ dataDir: config.dataDir, gitService });
  await workflowEngine.initialize();

  const taskService = new TaskService(taskRepository, planGenerator);
  taskService.setPhaseGenerator(phaseGenerator);

  return {
    taskService,
    configLoader,
    config,
    llmService,
    mcpClient,
    planGenerator,
    phaseGenerator,
    reviewGenerator,
    templateEngine,
    agentService,
    verifier,
    epicService,
    epicGenerator,
    gitService,
    workflowEngine,
  };
}
