import type { Config } from '../config/schema.js';

export function runConfigCommand(config: Config): void {
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}
