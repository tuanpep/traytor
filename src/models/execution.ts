export interface Execution {
  id: string;
  agentId: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startedAt?: string;
  completedAt?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  history: ExecutionHistoryEntry[];
}

export interface ExecutionHistoryEntry {
  timestamp: string;
  action: string;
  details?: string;
}

export function createExecutionId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `exec_${now}_${random}`;
}
