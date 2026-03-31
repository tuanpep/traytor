import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Task, TaskStatus, TaskType } from '../../models/task.js';
import type { Verification } from '../../models/verification.js';
import type { TaskService } from '../../services/task.service.js';
import { buildDashboard, renderDashboard } from './dashboard.js';
import {
  tasksToListItems,
  filterTasks,
  renderTaskList,
  renderHighlightedTaskList,
  promptTaskSearch,
  promptTaskSelection,
  type TaskListFilter,
} from './task-list.js';
import { renderPlanViewer, promptPlanStepNavigation, type PlanViewerState } from './plan-viewer.js';
import { renderVerificationViewer, promptVerificationAction } from './verification-viewer.js';

export type TUIView = 'dashboard' | 'tasks' | 'plan' | 'verification';

export interface TUINavigation {
  view: TUIView;
  taskId?: string;
}

/**
 * Run the interactive TUI loop.
 */
export async function runTUI(taskService: TaskService): Promise<void> {
  let currentView: TUIView = 'dashboard';
  let currentTask: Task | null = null;
  let planState: PlanViewerState = { currentStep: 0, showCode: false };
  let taskFilter: TaskListFilter = {};

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const tasks = await taskService.listTasks();

    switch (currentView) {
      case 'dashboard': {
        const data = buildDashboard(tasks);
        process.stdout.write(renderDashboard(data) + '\n');

        const { action } = await inquirer.prompt([
          {
            type: 'select',
            name: 'action',
            message: 'Navigate:',
            choices: [
              { name: 'Task List', value: 'tasks' },
              { name: 'Refresh Dashboard', value: 'dashboard' },
              { name: 'Quit', value: 'quit' },
            ],
          },
        ]);

        if (action === 'quit') return;
        if (action !== 'dashboard') currentView = action as TUIView;
        break;
      }

      case 'tasks': {
        const listItems = tasksToListItems(tasks);
        const filtered = filterTasks(listItems, taskFilter);

        if (taskFilter.search) {
          process.stdout.write(renderHighlightedTaskList(filtered, taskFilter.search) + '\n');
        } else {
          process.stdout.write(renderTaskList(filtered) + '\n');
        }

        const { action } = await inquirer.prompt([
          {
            type: 'select',
            name: 'action',
            message: 'Tasks:',
            choices: [
              ...(tasks.length > 0 ? [{ name: 'Select task...', value: 'select' }] : []),
              { name: 'Search tasks...', value: 'search' },
              { name: 'Filter by status...', value: 'filter-status' },
              { name: 'Filter by type...', value: 'filter-type' },
              { name: 'Clear filters', value: 'clear-filters' },
              { name: 'Back to Dashboard', value: 'back' },
              { name: 'Quit', value: 'quit' },
            ],
          },
        ]);

        switch (action) {
          case 'quit':
            return;
          case 'back':
            currentView = 'dashboard';
            break;
          case 'select': {
            const selected = await promptTaskSelection(tasks);
            if (selected) {
              currentTask = selected;
              if (selected.plan) {
                planState = { currentStep: 0, showCode: false };
                currentView = 'plan';
              } else {
                process.stdout.write('\n' + chalk.yellow('This task has no plan yet.') + '\n');
                process.stdout.write(chalk.dim(`  Query: ${selected.query}`) + '\n');
                process.stdout.write(chalk.dim(`  Status: ${selected.status}`) + '\n\n');
              }
            }
            break;
          }
          case 'search': {
            const result = await promptTaskSearch();
            if (result.action === 'search') {
              taskFilter = { ...taskFilter, search: result.query };
            } else if (result.action === 'cancel') {
              delete taskFilter.search;
            }
            break;
          }
          case 'filter-status': {
            const { status } = await inquirer.prompt([
              {
                type: 'select',
                name: 'status',
                message: 'Filter by status:',
                choices: [
                  { name: 'All statuses', value: 'all' },
                  { name: chalk.green('Completed'), value: 'completed' },
                  { name: chalk.yellow('In Progress'), value: 'in_progress' },
                  { name: chalk.gray('Pending'), value: 'pending' },
                  { name: chalk.red('Failed'), value: 'failed' },
                ],
              },
            ]);
            taskFilter = {
              ...taskFilter,
              status: status === 'all' ? undefined : (status as TaskStatus),
            };
            break;
          }
          case 'filter-type': {
            const { type } = await inquirer.prompt([
              {
                type: 'select',
                name: 'type',
                message: 'Filter by type:',
                choices: [
                  { name: 'All types', value: 'all' },
                  { name: 'Plan', value: 'plan' },
                  { name: 'Phases', value: 'phases' },
                  { name: 'Review', value: 'review' },
                  { name: 'Epic', value: 'epic' },
                ],
              },
            ]);
            taskFilter = { ...taskFilter, type: type === 'all' ? undefined : (type as TaskType) };
            break;
          }
          case 'clear-filters':
            taskFilter = {};
            break;
        }
        break;
      }

      case 'plan': {
        if (!currentTask?.plan) {
          currentView = 'dashboard';
          break;
        }

        process.stdout.write(renderPlanViewer(currentTask.plan, planState) + '\n');

        const result = await promptPlanStepNavigation(currentTask.plan, planState.currentStep);

        switch (result.action) {
          case 'back':
            currentView = 'tasks';
            break;
          case 'next':
            planState.currentStep = Math.min(
              planState.currentStep + 1,
              currentTask.plan.steps.length - 1
            );
            break;
          case 'prev':
            planState.currentStep = Math.max(planState.currentStep - 1, 0);
            break;
          case 'goto':
            if (result.step !== undefined) {
              planState.currentStep = result.step;
            }
            break;
          case 'toggle-code':
            planState.showCode = !planState.showCode;
            break;
        }
        break;
      }

      case 'verification': {
        if (!currentTask) {
          currentView = 'dashboard';
          break;
        }

        // Get the last verification from phases or from the task
        let verification: Verification | null = null;

        if (currentTask.phases) {
          const verifiedPhase = [...currentTask.phases].reverse().find((p) => p.verification);
          if (verifiedPhase?.verification) {
            verification = {
              id: verifiedPhase.verification.id,
              taskId: currentTask.id,
              timestamp: verifiedPhase.verification.timestamp,
              comments: verifiedPhase.verification.comments,
              summary: verifiedPhase.verification.summary,
            };
          }
        }

        if (!verification) {
          process.stdout.write(chalk.yellow('\n  No verification results for this task.\n'));
          process.stdout.write(chalk.dim('  Run "traytor verify <task-id>" to generate one.\n\n'));
          const { action } = await inquirer.prompt([
            {
              type: 'select',
              name: 'action',
              message: 'Actions:',
              choices: [{ name: 'Back', value: 'back' }],
            },
          ]);
          if (action === 'back') currentView = 'tasks';
          break;
        }

        process.stdout.write(renderVerificationViewer(verification) + '\n');

        const result = await promptVerificationAction(verification.comments);
        if (result.action === 'back') {
          currentView = 'tasks';
        }
        break;
      }
    }
  }
}
