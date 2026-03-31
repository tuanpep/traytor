import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
import type { EpicService } from '../services/epic.service.js';
import type { EpicGenerator, ElicitationState } from '../services/epic-generator.js';
import type { SpecType, TicketStatus } from '../models/epic.js';
import {
  formatEpic,
  formatSpec,
  formatSpecList,
  formatTicket,
  formatTicketList,
} from '../ui/cli/formatter.js';
import { getLogger } from '../utils/logger.js';
import {
  TaskNotFoundError,
  EpicNotFoundError,
} from '../utils/errors.js';

// ─── Epic Command (main entry) ────────────────────────────────────────────

export interface EpicCommandOptions {
  maxRounds?: number;
  auto?: boolean;
  output?: 'terminal' | 'markdown' | 'json';
  outputFile?: string;
}

/**
 * Start an epic with AI elicitation.
 */
export async function runEpicCommand(
  epicService: EpicService,
  epicGenerator: EpicGenerator,
  query: string,
  options: EpicCommandOptions = {}
): Promise<void> {
  const logger = getLogger();
  const maxRounds = options.maxRounds ?? 3;

  logger.info(`Starting epic creation for: "${query}"`);

  console.log('');
  console.log(chalk.bold.cyan('Starting Epic Mode'));
  console.log(chalk.dim(`Query: "${query}"`));
  console.log('');

  // 1. Create epic task
  const task = await epicService.createEpicTask(query, process.cwd());
  logger.debug(`Epic task created: ${task.id}`);

  // 2. Start elicitation
  const spinner = ora('Analyzing your request...').start();

  let state: ElicitationState;
  try {
    state = await epicGenerator.startElicitation(query, maxRounds);
    spinner.stop();
  } catch (error) {
    spinner.fail(chalk.red('Failed to start elicitation'));
    throw error;
  }

  // 3. Interactive elicitation loop
  if (!state.complete && !options.auto) {
    console.log(chalk.bold('\nI have a few questions to better understand your requirements:\n'));

    while (!state.complete) {
      const answers: string[] = [];

      for (const question of state.questions) {
        console.log(chalk.yellow(`  ${question.question}`));
        if (question.context) {
          console.log(chalk.dim(`    ${question.context}`));
        }

        const { answer } = await inquirer.prompt([
          {
            type: 'input',
            name: 'answer',
            message: '  Your answer:',
          },
        ]);
        answers.push(answer);
        console.log('');
      }

      const followUpSpinner = ora('Processing your answers...').start();
      try {
        state = await epicGenerator.continueElicitation(state, answers);
        followUpSpinner.stop();
      } catch (error) {
        followUpSpinner.fail(chalk.red('Failed to process answers'));
        throw error;
      }

      if (!state.complete && state.questions.length > 0) {
        console.log(chalk.bold('\nA few more questions:\n'));
      }
    }
  } else if (!state.complete && options.auto) {
    // Auto mode: skip remaining rounds
    const summary = await epicGenerator.generateElicitationSummary(state);
    state = { ...state, complete: true, summary };
  }

  // 4. Show elicitation summary
  if (state.summary) {
    console.log(chalk.bold.green('\nRequirements Summary:'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log(state.summary);
    console.log(chalk.dim('─'.repeat(50)));
    console.log('');
  }

  // 5. Generate specs
  const specSpinner = ora('Generating specification documents...').start();

  try {
    const elicitationResponses = state.responses.map((r) => r.answer);

    // Generate PRD spec
    const prdContent = await epicGenerator.generateSpec({
      query,
      specType: 'prd',
      elicitationResponses,
      existingSpecs: [],
    });

    await epicService.addSpec(task.id, {
      type: 'prd',
      title: `PRD: ${query}`,
      content: prdContent,
    });

    // Generate Tech Doc
    const techContent = await epicGenerator.generateSpec({
      query,
      specType: 'tech',
      elicitationResponses,
      existingSpecs: [{ type: 'prd', title: `PRD: ${query}`, summary: prdContent.slice(0, 200) }],
    });

    await epicService.addSpec(task.id, {
      type: 'tech',
      title: `Technical Design: ${query}`,
      content: techContent,
    });

    specSpinner.succeed(chalk.green('Specifications generated!'));
  } catch (error) {
    specSpinner.fail(chalk.red('Failed to generate specifications'));
    throw error;
  }

  // 6. Generate tickets
  const ticketSpinner = ora('Generating tickets from specifications...').start();

  try {
    const specs = await epicService.listSpecs(task.id);
    const tickets = await epicGenerator.generateTickets({
      query,
      specs: specs.map((s) => ({ id: s.id, type: s.type, title: s.title, content: s.content })),
      existingTickets: [],
    });

    for (const ticket of tickets) {
      await epicService.addTicket(task.id, ticket);
    }

    ticketSpinner.succeed(chalk.green(`Generated ${tickets.length} tickets!`));
  } catch (error) {
    ticketSpinner.fail(chalk.red('Failed to generate tickets'));
    throw error;
  }

  // 7. Generate workflow
  const workflowSpinner = ora('Generating workflow...').start();

  try {
    const allSpecs = await epicService.listSpecs(task.id);
    const allTickets = await epicService.listTickets(task.id);
    const workflow = await epicGenerator.generateWorkflow(query, allSpecs, allTickets);

    await epicService.setWorkflow(task.id, workflow);

    workflowSpinner.succeed(chalk.green(`Workflow "${workflow.name}" created with ${workflow.steps.length} steps!`));
  } catch (error) {
    workflowSpinner.fail(chalk.red('Failed to generate workflow'));
    throw error;
  }

  // 8. Output results
  const epic = await epicService.getEpic(task.id);

  const outputFormat = options.output ?? 'terminal';

  switch (outputFormat) {
    case 'markdown': {
      const markdown = formatEpicMarkdown(task.query, epic);
      if (options.outputFile) {
        const outputPath = path.resolve(options.outputFile);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, markdown, 'utf-8');
        console.log(chalk.green(`Epic exported to: ${outputPath}`));
      } else {
        process.stdout.write(markdown);
      }
      break;
    }

    case 'json': {
      const json = JSON.stringify(epic, null, 2);
      if (options.outputFile) {
        const outputPath = path.resolve(options.outputFile);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, json, 'utf-8');
        console.log(chalk.green(`Epic exported to: ${outputPath}`));
      } else {
        process.stdout.write(json);
      }
      break;
    }

    case 'terminal':
    default: {
      console.log('');
      console.log(formatEpic(epic));
    }
  }

  // Show usage hints
  console.log(chalk.dim(`\nTask ID: ${task.id}`));
  console.log(chalk.dim('\nManage this epic:'));
  console.log(chalk.dim(`  traytor epic spec list ${task.id}    # List all specs`));
  console.log(chalk.dim(`  traytor epic spec create ${task.id}  # Add a new spec`));
  console.log(chalk.dim(`  traytor epic ticket list ${task.id}  # List all tickets`));
  console.log(chalk.dim(`  traytor epic ticket status ${task.id} <ticket-id> <status>  # Update ticket status`));
}

// ─── Spec Sub-commands ────────────────────────────────────────────────────

export async function runSpecListCommand(
  epicService: EpicService,
  taskId: string
): Promise<void> {
  try {
    const specs = await epicService.listSpecs(taskId);
    if (specs.length === 0) {
      console.log(chalk.dim('No specs found for this epic.'));
      return;
    }
    console.log(formatSpecList(specs));
  } catch (error) {
    if (error instanceof EpicNotFoundError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else {
      throw error;
    }
  }
}

export async function runSpecCreateCommand(
  epicService: EpicService,
  taskId: string,
  specType: SpecType,
  title?: string,
  content?: string
): Promise<void> {
  try {
    let finalTitle = title;
    let finalContent = content;

    // Prompt for missing fields
    if (!finalTitle) {
      const { t } = await inquirer.prompt([
        { type: 'input', name: 't', message: 'Spec title:' },
      ]);
      finalTitle = t;
    }

    if (!finalContent) {
      const { c } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'c',
          message: 'Spec content (opens editor):',
          default: `# ${finalTitle}\n\n`,
        },
      ]);
      finalContent = c;
    }

    const spec = await epicService.addSpec(taskId, {
      type: specType,
      title: finalTitle!,
      content: finalContent!,
    });

    console.log(chalk.green(`Spec created: ${spec.id}`));
    console.log(formatSpec(spec));
  } catch (error) {
    if (error instanceof EpicNotFoundError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else {
      throw error;
    }
  }
}

export async function runSpecEditCommand(
  epicService: EpicService,
  taskId: string,
  specId: string,
  updates: { title?: string; content?: string }
): Promise<void> {
  try {
    const spec = await epicService.updateSpec(taskId, specId, updates);
    console.log(chalk.green(`Spec updated: ${spec.id}`));
    console.log(formatSpec(spec));
  } catch (error) {
    if (error instanceof EpicNotFoundError || error instanceof TaskNotFoundError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else {
      throw error;
    }
  }
}

// ─── Ticket Sub-commands ──────────────────────────────────────────────────

export async function runTicketListCommand(
  epicService: EpicService,
  taskId: string
): Promise<void> {
  try {
    const tickets = await epicService.listTickets(taskId);
    if (tickets.length === 0) {
      console.log(chalk.dim('No tickets found for this epic.'));
      return;
    }
    console.log(formatTicketList(tickets));
  } catch (error) {
    if (error instanceof EpicNotFoundError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else {
      throw error;
    }
  }
}

export async function runTicketCreateCommand(
  epicService: EpicService,
  taskId: string,
  title?: string,
  description?: string
): Promise<void> {
  try {
    let finalTitle = title;
    let finalDescription = description;
    let acceptanceCriteria: string[] = [];

    if (!finalTitle) {
      const { t } = await inquirer.prompt([
        { type: 'input', name: 't', message: 'Ticket title:' },
      ]);
      finalTitle = t;
    }

    if (!finalDescription) {
      const { d } = await inquirer.prompt([
        { type: 'input', name: 'd', message: 'Ticket description:' },
      ]);
      finalDescription = d;
    }

    // Ask for acceptance criteria
    const { ac } = await inquirer.prompt([
      {
        type: 'input',
        name: 'ac',
        message: 'Acceptance criteria (comma-separated):',
      },
    ]);
    if (ac.trim()) {
      acceptanceCriteria = ac.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    const ticket = await epicService.addTicket(taskId, {
      title: finalTitle!,
      description: finalDescription ?? '',
      acceptanceCriteria,
    });

    console.log(chalk.green(`Ticket created: ${ticket.id}`));
    console.log(formatTicket(ticket));
  } catch (error) {
    if (error instanceof EpicNotFoundError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else {
      throw error;
    }
  }
}

export async function runTicketStatusCommand(
  epicService: EpicService,
  taskId: string,
  ticketId: string,
  status: string
): Promise<void> {
  const validStatuses: TicketStatus[] = ['todo', 'in_progress', 'done'];

  if (!validStatuses.includes(status as TicketStatus)) {
    console.error(chalk.red(`Invalid status: "${status}"`));
    console.error(chalk.dim(`Valid statuses: ${validStatuses.join(', ')}`));
    return;
  }

  try {
    const ticket = await epicService.updateTicketStatus(
      taskId,
      ticketId,
      status as TicketStatus
    );
    console.log(chalk.green(`Ticket ${ticketId} status updated to: ${status}`));
    console.log(formatTicket(ticket));
  } catch (error) {
    if (error instanceof EpicNotFoundError || error instanceof TaskNotFoundError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else {
      throw error;
    }
  }
}

export async function runTicketEditCommand(
  epicService: EpicService,
  taskId: string,
  ticketId: string,
  updates: { title?: string; description?: string; acceptanceCriteria?: string[] }
): Promise<void> {
  try {
    const ticket = await epicService.updateTicket(taskId, ticketId, updates);
    console.log(chalk.green(`Ticket updated: ${ticket.id}`));
    console.log(formatTicket(ticket));
  } catch (error) {
    if (error instanceof EpicNotFoundError || error instanceof TaskNotFoundError) {
      console.error(chalk.red(error.message));
      console.error(chalk.dim(`  ${error.suggestion}`));
    } else {
      throw error;
    }
  }
}

// ─── Markdown Output ──────────────────────────────────────────────────────

function formatEpicMarkdown(query: string, epic: import('../models/epic.js').Epic): string {
  const lines: string[] = [];

  lines.push(`# Epic: ${query}`);
  lines.push('');

  // Workflow
  if (epic.workflow) {
    lines.push('## Workflow');
    lines.push('');
    lines.push(`**${epic.workflow.name}**`);
    lines.push('');
    for (const step of epic.workflow.steps) {
      lines.push(`${step.order}. **${step.name}**: ${step.description}`);
    }
    lines.push('');
  }

  // Specs
  if (epic.specs.length > 0) {
    lines.push('## Specifications');
    lines.push('');
    for (const spec of epic.specs) {
      lines.push(`### [${spec.type.toUpperCase()}] ${spec.title}`);
      lines.push('');
      lines.push(spec.content);
      lines.push('');
    }
  }

  // Tickets
  if (epic.tickets.length > 0) {
    lines.push('## Tickets');
    lines.push('');
    for (const ticket of epic.tickets) {
      lines.push(`### ${ticket.title} [${ticket.status}]`);
      lines.push('');
      lines.push(ticket.description);
      lines.push('');
      if (ticket.acceptanceCriteria.length > 0) {
        lines.push('**Acceptance Criteria:**');
        for (const ac of ticket.acceptanceCriteria) {
          lines.push(`- ${ac}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
