import { defineConfig, devices } from '@playwright/test';

/** E2E contra API real + seed de desarrollo. Ejecutar con `pnpm test:e2e` (carga ../../.env). */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/preparar-datos.ts',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'es-CO',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @zulu/api dev',
      cwd: '../..',
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
