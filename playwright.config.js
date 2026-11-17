import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', timeout: 30000, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:8082', headless: true, launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/e2e-server.mjs', url: 'http://127.0.0.1:8082', reuseExistingServer: false, env: { PORT: '8082', HOST: '127.0.0.1', DELIVERY_DRY_RUN: 'true' } },
  reporter: [['list'], ['html', { open: 'never' }]],
});
