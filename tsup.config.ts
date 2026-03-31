import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/bin/traytor.ts' },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  dts: false,
  outDir: 'dist',
});
