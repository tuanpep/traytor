export enum ErrorCode {
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  PLAN_GENERATION_FAILED = 'PLAN_GENERATION_FAILED',
  AGENT_EXECUTION_FAILED = 'AGENT_EXECUTION_FAILED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  CONFIG_INVALID = 'CONFIG_INVALID',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  LLM_API_ERROR = 'LLM_API_ERROR',
  TEMPLATE_ERROR = 'TEMPLATE_ERROR',
}

export class SDDError extends Error {
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
    this.name = 'SDDError';
    this.code = code;
    this.suggestion = suggestion;
    this.details = details;
  }

  toString(): string {
    let output = `${this.name} [${this.code}]: ${this.message}`;
    if (this.suggestion) {
      output += `\n  Suggestion: ${this.suggestion}`;
    }
    return output;
  }
}

export class TaskNotFoundError extends SDDError {
  constructor(taskId: string) {
    super(
      ErrorCode.TASK_NOT_FOUND,
      `Task "${taskId}" not found`,
      'Use `sdd history` to list all tasks',
      { taskId }
    );
    this.name = 'TaskNotFoundError';
  }
}

export class PlanGenerationError extends SDDError {
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

export class AgentExecutionError extends SDDError {
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

export class VerificationError extends SDDError {
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

export class LLMProviderError extends SDDError {
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
