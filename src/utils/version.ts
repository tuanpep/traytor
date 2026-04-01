import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveVersion(): string {
  // Strategy 1: Try build-injected version (read from package.json near dist/)
  try {
    const distPackageJson = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'package.json',
    );
    if (fs.existsSync(distPackageJson)) {
      const pkg = JSON.parse(fs.readFileSync(distPackageJson, 'utf-8'));
      if (pkg.version) return pkg.version;
    }
  } catch {}

  // Strategy 2: Try process.cwd() based resolution (development)
  try {
    const cwdPackageJson = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(cwdPackageJson)) {
      const pkg = JSON.parse(fs.readFileSync(cwdPackageJson, 'utf-8'));
      if (pkg.version) return pkg.version;
    }
  } catch {}

  // Fallback
  return '1.0.0';
}
