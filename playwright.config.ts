import { defineConfig, devices } from '@playwright/test';
const externalBaseURL = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: { baseURL: externalBaseURL ?? 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: externalBaseURL
    ? undefined
    : [
        {
          command: 'npm run dev -w apps/api',
          url: 'http://localhost:3100/api/health',
          reuseExistingServer: true,
          timeout: 60000,
        },
        {
          command: 'npm run dev -w apps/web',
          url: 'http://localhost:4173',
          reuseExistingServer: true,
          timeout: 60000,
        },
      ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
