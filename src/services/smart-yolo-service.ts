import chalk from 'chalk';
import { getLogger } from '../utils/logger.js';
import type { Task } from '../models/task.js';
import type { Epic, Ticket, Spec } from '../models/epic.js';
import type { AgentService } from './agent-service.js';
import type { Verifier } from '../core/verifier.js';
import type { EpicService } from './epic.service.js';
import type { PlanGenerator } from './plan-generator.js';

export interface SmartYOLOOptions {
  tickets?: string[];
  skipPlanning?: boolean;
  skipVerification?: boolean;
  agent?: string;
  maxParallel?: number;
  dryRun?: boolean;
}

export interface SmartYOLOResult {
  epicId: string;
  totalTickets: number;
  completedTickets: number;
  failedTickets: number;
  executions: ExecutionResult[];
}

export interface ExecutionResult {
  ticketId: string;
  ticketTitle: string;
  success: boolean;
  planGenerated: boolean;
  executionResult?: {
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  verificationResult?: {
    approved: boolean;
    commentsCount: number;
  };
  error?: string;
}

export class SmartYOLOService {
  private logger = getLogger();

  constructor(
    private readonly epicService: EpicService,
    private readonly agentService: AgentService,
    private readonly verifier: Verifier,
    private readonly planGenerator: PlanGenerator,
    private readonly workingDir: string
  ) {}

  async executeEpic(taskId: string, options: SmartYOLOOptions = {}): Promise<SmartYOLOResult> {
    this.logger.info(`Starting Smart YOLO execution for epic: ${taskId}`);

    const task = await this.epicService['taskRepository'].findById(taskId);
    if (!task || !task.epic) {
      throw new Error(`Epic "${taskId}" not found`);
    }

    const epic = task.epic;
    const ticketsToExecute = this.selectTickets(epic, options.tickets);

    console.log(chalk.bold('\n🚀 Smart YOLO Execution for Epic\n'));
    console.log(chalk.dim(`Epic: ${task.query}`));
    console.log(chalk.dim(`Tickets: ${ticketsToExecute.length}/${epic.tickets.length}`));
    if (options.maxParallel && options.maxParallel > 1) {
      console.log(chalk.dim(`Parallel execution: up to ${options.maxParallel} tickets`));
    }
    console.log('');

    const results: ExecutionResult[] = [];
    let completedTickets = 0;
    let failedTickets = 0;

    if (options.maxParallel && options.maxParallel > 1) {
      const parallelResults = await this.executeTicketsParallel(
        task,
        epic,
        ticketsToExecute,
        options
      );
      results.push(...parallelResults);
      completedTickets = parallelResults.filter((r) => r.success).length;
      failedTickets = parallelResults.filter((r) => !r.success).length;
    } else {
      for (const ticket of ticketsToExecute) {
        const result = await this.executeTicket(task, epic, ticket, options);
        results.push(result);

        if (result.success) {
          completedTickets++;
          console.log(chalk.green(`\n✓ Ticket "${ticket.title}" completed`));
        } else {
          failedTickets++;
          console.log(chalk.red(`\n✗ Ticket "${ticket.title}" failed`));
          if (!options.dryRun) {
            console.log(chalk.yellow('Stopping Smart YOLO due to ticket failure.'));
            break;
          }
        }
      }
    }

    const summary: SmartYOLOResult = {
      epicId: taskId,
      totalTickets: epic.tickets.length,
      completedTickets,
      failedTickets,
      executions: results,
    };

    console.log(chalk.bold('\n📊 Smart YOLO Execution Summary\n'));
    console.log(`  Total tickets: ${epic.tickets.length}`);
    console.log(`  Executed: ${completedTickets + failedTickets}`);
    console.log(`  Completed: ${chalk.green(completedTickets.toString())}`);
    console.log(`  Failed: ${failedTickets > 0 ? chalk.red(failedTickets.toString()) : '0'}`);

    return summary;
  }

  private selectTickets(epic: Epic, ticketIds?: string[]): Ticket[] {
    let tickets = epic.tickets.filter((t) => t.status !== 'done');

    if (ticketIds && ticketIds.length > 0) {
      tickets = tickets.filter((t) => ticketIds.includes(t.id));
    }

    tickets.sort((a, b) => {
      const priorityOrder: Record<string, number> = { todo: 0, in_progress: 1 };
      return (priorityOrder[a.status] ?? 0) - (priorityOrder[b.status] ?? 0);
    });

    return tickets;
  }

  private async executeTicket(
    task: Task,
    epic: Epic,
    ticket: Ticket,
    options: SmartYOLOOptions
  ): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      success: false,
      planGenerated: false,
    };

    try {
      console.log(chalk.cyan(`\n${'─'.repeat(50)}`));
      console.log(chalk.bold(`Ticket: ${ticket.title}`));
      console.log(chalk.cyan('─'.repeat(50)));

      if (options.dryRun) {
        console.log(chalk.yellow('DRY RUN - Would execute ticket'));
        result.success = true;
        return result;
      }

      const specContext = this.buildSpecContext(epic.specs, ticket.linkedSpecs);

      let plan;
      if (!options.skipPlanning) {
        console.log(chalk.dim('\n  Generating plan...'));
        const query = `Implement ticket: ${ticket.title}\n\n${ticket.description || ''}\n\n${specContext}`;
        plan = await this.planGenerator.generate(query);
        result.planGenerated = true;
        console.log(chalk.green('  Plan generated'));
      }

      console.log(chalk.dim('\n  Executing...'));
      const ticketTask: Task = {
        id: `ticket_${ticket.id}`,
        type: 'plan',
        query: `Ticket: ${ticket.title}`,
        status: 'in_progress',
        context: task.context,
        plan,
        executions: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const execResult = await this.agentService.execute(ticketTask, {
        cwd: this.workingDir,
        agentName: options.agent,
      });

      result.executionResult = {
        success: execResult.success,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        exitCode: execResult.exitCode ?? undefined,
      };

      if (!execResult.success) {
        result.error = execResult.stderr || 'Agent execution failed';
        return result;
      }

      if (!options.skipVerification && plan) {
        console.log(chalk.dim('\n  Verifying...'));
        const verification = await this.verifier.verify(ticketTask, { mode: 'fresh' });
        result.verificationResult = {
          approved: !verification.comments.some(
            (c) => c.category === 'critical' || c.category === 'major'
          ),
          commentsCount: verification.comments.length,
        };

        if (result.verificationResult.approved) {
          console.log(chalk.green('  Verification passed'));
        } else {
          console.log(
            chalk.yellow(`  Verification found ${result.verificationResult.commentsCount} issues`)
          );
        }
      }

      await this.epicService.updateTicketStatus(task.id, ticket.id, 'done');
      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ticket "${ticket.title}" failed: ${result.error}`);
    }

    return result;
  }

  private async executeTicketsParallel(
    task: Task,
    epic: Epic,
    tickets: Ticket[],
    options: SmartYOLOOptions
  ): Promise<ExecutionResult[]> {
    const maxParallel = options.maxParallel ?? 2;
    const results: ExecutionResult[] = [];

    console.log(chalk.bold(`\n⚡ Parallel execution: up to ${maxParallel} tickets at a time\n`));

    for (let i = 0; i < tickets.length; i += maxParallel) {
      const batch = tickets.slice(i, i + maxParallel);
      const batchNum = Math.floor(i / maxParallel) + 1;
      const totalBatches = Math.ceil(tickets.length / maxParallel);

      console.log(chalk.cyan(`\nBatch ${batchNum}/${totalBatches}:\n`));

      const batchResults = await Promise.all(
        batch.map((ticket) => this.executeTicket(task, epic, ticket, options))
      );

      results.push(...batchResults);

      const batchSuccess = batchResults.filter((r) => r.success).length;
      const batchFailed = batchResults.filter((r) => !r.success).length;

      console.log(
        chalk.dim(
          `Batch ${batchNum}: ${chalk.green(batchSuccess)} success, ${batchFailed > 0 ? chalk.red(batchFailed.toString()) : '0'} failed`
        )
      );
    }

    return results;
  }

  private buildSpecContext(specs: Spec[], ticketSpecIds: string[]): string {
    const relevantSpecs = specs.filter((s) => ticketSpecIds.includes(s.id));
    if (relevantSpecs.length === 0) {
      return '';
    }

    let context = '## Relevant Specifications\n\n';
    for (const spec of relevantSpecs) {
      context += `### ${spec.title}\n${spec.content}\n\n`;
    }
    return context;
  }

  async analyzeAndSuggest(epic: Epic): Promise<string[]> {
    const suggestions: string[] = [];

    const pendingTickets = epic.tickets.filter((t) => t.status === 'todo');
    const inProgressTickets = epic.tickets.filter((t) => t.status === 'in_progress');

    if (pendingTickets.length > 5) {
      suggestions.push(
        `Consider breaking down ${pendingTickets.length} pending tickets into smaller chunks`
      );
    }

    const ticketsWithNoSpecs = epic.tickets.filter((t) => t.linkedSpecs.length === 0);
    if (ticketsWithNoSpecs.length > 0) {
      suggestions.push(
        `${ticketsWithNoSpecs.length} tickets have no linked specs - consider adding specifications`
      );
    }

    const ticketsWithConflicts = this.detectDependencyConflicts(epic.tickets);
    if (ticketsWithConflicts.length > 0) {
      suggestions.push(
        `Dependency conflicts detected: ${ticketsWithConflicts.map((t) => t.title).join(', ')}`
      );
    }

    if (inProgressTickets.length > 3) {
      suggestions.push(
        `Consider completing some in-progress tickets before starting new ones (${inProgressTickets.length} in progress)`
      );
    }

    return suggestions;
  }

  private detectDependencyConflicts(tickets: Ticket[]): Ticket[] {
    return tickets.filter((t) => t.status === 'todo' && t.linkedSpecs.length === 0);
  }
}
