import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.int.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: { NODE_ENV: 'test', AUTH_RATE_LIMIT: '10000' },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
