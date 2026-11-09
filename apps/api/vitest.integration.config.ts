import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.int.spec.ts'], environment: 'node', fileParallelism: false },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
