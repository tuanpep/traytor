import { ConfigLoader } from '../config/loader.js';
import { TaskRepository } from '../data/repositories/task.repository.js';
import { TaskService } from '../services/task.service.js';
import { PlanGenerator } from '../services/plan-generator.js';
import { AgentService } from '../services/agent-service.js';
import { TemplateEngine } from '../services/template-engine.js';
import { LLMService } from '../integrations/llm/llm-service.js';
import { Verifier } from '../core/verifier.js';
import type { Config } from '../config/schema.js';

export interface AppContext {
  taskService: TaskService;
  configLoader: ConfigLoader;
  config: Config;
  llmService: LLMService;
  planGenerator: PlanGenerator;
  templateEngine: TemplateEngine;
  agentService: AgentService;
  verifier: Verifier;
}

export async function bootstrap(workingDir = process.cwd()): Promise<AppContext> {
  const configLoader = new ConfigLoader();
  const config = await configLoader.load({ cwd: workingDir });

  const taskRepository = new TaskRepository(config.dataDir);
  const llmService = new LLMService(config);
  const templateEngine = new TemplateEngine();
  const planGenerator = new PlanGenerator(llmService, templateEngine, workingDir);
  const agentService = new AgentService(config);
  const verifier = new Verifier(llmService, workingDir);

  const taskService = new TaskService(taskRepository, planGenerator);

  return { taskService, configLoader, config, llmService, planGenerator, templateEngine, agentService, verifier };
}
