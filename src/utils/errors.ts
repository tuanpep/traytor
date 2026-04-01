export enum ErrorCode {
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  PLAN_GENERATION_FAILED = 'PLAN_GENERATION_FAILED',
  AGENT_EXECUTION_FAILED = 'AGENT_EXECUTION_FAILED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  CONFIG_INVALID = 'CONFIG_INVALID',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  LLM_API_ERROR = 'LLM_API_ERROR',
  TEMPLATE_ERROR = 'TEMPLATE_ERROR',
  PHASE_NOT_FOUND = 'PHASE_NOT_FOUND',
  PHASE_GENERATION_FAILED = 'PHASE_GENERATION_FAILED',
  EPIC_NOT_FOUND = 'EPIC_NOT_FOUND',
  SPEC_NOT_FOUND = 'SPEC_NOT_FOUND',
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
  EPIC_GENERATION_FAILED = 'EPIC_GENERATION_FAILED',
  GIT_ERROR = 'GIT_ERROR',
  WORKFLOW_ERROR = 'WORKFLOW_ERROR',
  WORKFLOW_NOT_FOUND = 'WORKFLOW_NOT_FOUND',
  WORKFLOW_STATE_ERROR = 'WORKFLOW_STATE_ERROR',
  REVIEW_FAILED = 'REVIEW_FAILED',
}

export class TraytorError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly suggestion: string;

  constructor(
    code: ErrorCode,
    message: string,
    suggestion: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TraytorError';
    this.code = code;
    this.suggestion = suggestion;
    this.details = details;
  }

  override toString(): string {
    let output = `${this.name} [${this.code}]: ${this.message}`;
    if (this.suggestion) {
      output += `\n  Suggestion: ${this.suggestion}`;
    }
    return output;
  }
}

export class TaskNotFoundError extends TraytorError {
  constructor(taskId: string) {
    super(
      ErrorCode.TASK_NOT_FOUND,
      `Task "${taskId}" not found`,
      'Use `traytor history` to list all tasks',
      { taskId }
    );
    this.name = 'TaskNotFoundError';
  }
}

export class PlanGenerationError extends TraytorError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.PLAN_GENERATION_FAILED,
      `Plan generation failed: ${reason}`,
      'Check your LLM API key and try again',
      details
    );
    this.name = 'PlanGenerationError';
  }
}

export class AgentExecutionError extends TraytorError {
  constructor(agent: string, reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.AGENT_EXECUTION_FAILED,
      `Agent "${agent}" execution failed: ${reason}`,
      'Ensure the agent is installed and configured',
      details
    );
    this.name = 'AgentExecutionError';
  }
}

export class VerificationError extends TraytorError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.VERIFICATION_FAILED,
      `Verification failed: ${reason}`,
      'Review the code changes and try re-verifying',
      details
    );
    this.name = 'VerificationError';
  }
}

export class ReviewError extends TraytorError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.REVIEW_FAILED,
      `Review failed: ${reason}`,
      'Check your configuration and try again',
      details
    );
    this.name = 'ReviewError';
  }
}

export class PhaseNotFoundError extends TraytorError {
  constructor(phaseId: string, taskId: string) {
    super(
      ErrorCode.PHASE_NOT_FOUND,
      `Phase "${phaseId}" not found in task "${taskId}"`,
      'Use `traytor history` to list all tasks and check phase numbers',
      { phaseId, taskId }
    );
    this.name = 'PhaseNotFoundError';
  }
}

export class PhaseGenerationError extends TraytorError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.PHASE_GENERATION_FAILED,
      `Phase generation failed: ${reason}`,
      'Check your LLM API key and try again',
      details
    );
    this.name = 'PhaseGenerationError';
  }
}

export class EpicNotFoundError extends TraytorError {
  constructor(epicId: string) {
    super(
      ErrorCode.EPIC_NOT_FOUND,
      `Epic "${epicId}" not found`,
      'Use `traytor history` to list all tasks or `traytor epic list` to list epics',
      { epicId }
    );
    this.name = 'EpicNotFoundError';
  }
}

export class SpecNotFoundError extends TraytorError {
  constructor(specId: string, epicId: string) {
    super(
      ErrorCode.SPEC_NOT_FOUND,
      `Spec "${specId}" not found in epic "${epicId}"`,
      'Use `traytor epic spec list <task-id>` to list all specs in the epic',
      { specId, epicId }
    );
    this.name = 'SpecNotFoundError';
  }
}

export class TicketNotFoundError extends TraytorError {
  constructor(ticketId: string, epicId: string) {
    super(
      ErrorCode.TICKET_NOT_FOUND,
      `Ticket "${ticketId}" not found in epic "${epicId}"`,
      'Use `traytor epic ticket list <task-id>` to list all tickets in the epic',
      { ticketId, epicId }
    );
    this.name = 'TicketNotFoundError';
  }
}

export class EpicGenerationError extends TraytorError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.EPIC_GENERATION_FAILED,
      `Epic generation failed: ${reason}`,
      'Check your LLM API key and try again',
      details
    );
    this.name = 'EpicGenerationError';
  }
}

export class LLMProviderError extends TraytorError {
  constructor(provider: string, reason: string, details?: Record<string, unknown>) {
    const isAuthError =
      reason.toLowerCase().includes('authentication') ||
      reason.toLowerCase().includes('api key') ||
      reason.toLowerCase().includes('unauthorized');

    super(
      ErrorCode.LLM_API_ERROR,
      `LLM provider "${provider}" error: ${reason}`,
      isAuthError
        ? `Set your ${provider} API key via the ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : `${provider.toUpperCase()}_API_KEY`} environment variable or in your config file`
        : 'Check your API key, network connection, and try again',
      details
    );
    this.name = 'LLMProviderError';
  }
}

export class GitError extends TraytorError {
  constructor(reason: string, detail?: string) {
    super(
      ErrorCode.GIT_ERROR,
      `Git error: ${reason}`,
      'Ensure you are in a git repository and git is installed',
      detail ? { detail } : undefined
    );
    this.name = 'GitError';
  }
}

export class WorkflowError extends TraytorError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.WORKFLOW_ERROR,
      `Workflow error: ${reason}`,
      'Check the workflow definition and try again',
      details
    );
    this.name = 'WorkflowError';
  }
}

export class WorkflowNotFoundError extends TraytorError {
  constructor(workflowName: string) {
    super(
      ErrorCode.WORKFLOW_NOT_FOUND,
      `Workflow "${workflowName}" not found`,
      'Use `traytor workflow list` to see available workflows',
      { workflowName }
    );
    this.name = 'WorkflowNotFoundError';
  }
}

export class WorkflowStateError extends TraytorError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.WORKFLOW_STATE_ERROR,
      `Workflow state error: ${reason}`,
      'Check the workflow state and try again',
      details
    );
    this.name = 'WorkflowStateError';
  }
}

export class ConfigError extends TraytorError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.CONFIG_INVALID,
      `Configuration error: ${reason}`,
      'Check your config file at ~/.traytor/config.yaml or .traytor/config.yaml',
      details
    );
    this.name = 'ConfigError';
  }
}

export class FileNotFoundError extends TraytorError {
  constructor(filePath: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.FILE_NOT_FOUND,
      `File not found: ${filePath}`,
      'Check that the file exists and the path is correct',
      { filePath, ...details }
    );
    this.name = 'FileNotFoundError';
  }
}

export class TemplateError extends TraytorError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.TEMPLATE_ERROR,
      `Template error: ${reason}`,
      'Check your template syntax and variables',
      details
    );
    this.name = 'TemplateError';
  }
}
