import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export interface LoggerConfig {
  level: LogLevel;
  timestamp: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  timestamp: true,
};

export class Logger {
  private config: LoggerConfig;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.config.level];
  }

  private formatTimestamp(): string {
    return chalk.dim(new Date().toISOString());
  }

  private formatMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];
    if (this.config.timestamp) {
      parts.push(this.formatTimestamp());
    }
    parts.push(message);
    return parts.join(' ');
  }

  debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('debug')) return;
    console.debug(chalk.gray('DEBUG'), this.formatMessage('debug', message), ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('info')) return;
    console.info(chalk.blue('INFO'), this.formatMessage('info', message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('warn')) return;
    console.warn(chalk.yellow('WARN'), this.formatMessage('warn', message), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('error')) return;
    console.error(chalk.red('ERROR'), this.formatMessage('error', message), ...args);
  }

  success(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('info')) return;
    console.info(chalk.green('OK'), this.formatMessage('info', message), ...args);
  }
}

let globalLogger: Logger | undefined;

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

export function initLogger(config?: Partial<LoggerConfig>): Logger {
  globalLogger = new Logger(config);
  return globalLogger;
}
