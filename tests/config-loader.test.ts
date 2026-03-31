import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigLoader } from '../src/config/loader.js';

describe('ConfigLoader', () => {
  const createdPaths: string[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const filePath of createdPaths.splice(0)) {
      await fs.rm(filePath, { recursive: true, force: true });
    }
  });

  it('applies env over project over user over defaults', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'traytor-test-'));
    createdPaths.push(root);

    const userHome = path.join(root, 'home');
    const projectDir = path.join(root, 'project');
    await fs.mkdir(path.join(userHome, '.sdd-tool'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.sdd-tool'), { recursive: true });

    await fs.writeFile(
      path.join(userHome, '.sdd-tool', 'config.yaml'),
      'dataDir: /user-data\nanthropic:\n  model: user-model\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(projectDir, '.sdd-tool', 'config.yaml'),
      'dataDir: /project-data\n',
      'utf8'
    );

    vi.spyOn(os, 'homedir').mockReturnValue(userHome);
    vi.stubEnv('SDD_DATA_DIR', '/env-data');
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-key');

    const loader = new ConfigLoader();
    const config = await loader.load({ cwd: projectDir });

    expect(config.dataDir).toBe('/env-data');
    expect(config.anthropic.model).toBe('user-model');
    expect(config.anthropic.apiKey).toBe('env-key');
  });
});
