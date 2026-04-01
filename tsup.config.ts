import { defineConfig } from 'tsup';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  entry: { index: 'src/bin/traytor.ts' },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  dts: false,
  outDir: 'dist',
  esbuildOptions(options) {
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
    options.define = {
      'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
    };
  },
  async onSuccess() {
    const templatesSrc = path.join(__dirname, 'src', 'templates');
    const templatesDest = path.join(__dirname, 'dist', 'templates');

    if (!fs.existsSync(templatesDest)) {
      fs.mkdirSync(templatesDest, { recursive: true });
    }

    const files = fs.readdirSync(templatesSrc);
    for (const file of files) {
      if (file.endsWith('.hbs')) {
        fs.copyFileSync(path.join(templatesSrc, file), path.join(templatesDest, file));
      }
    }
    console.log('✓ Templates copied to dist/templates');
  },
});
