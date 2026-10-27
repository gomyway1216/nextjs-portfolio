import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  expect: { timeout: 15000 },
  testDir: 'tests/ogiri',
  testMatch: '*.spec.ts',
  timeout: 240000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.OGIRI_TEST_URL || 'http://localhost:3100',
    trace: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 20000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://localhost:3100/games/ogiri',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: { OGIRI_EMULATOR: '1', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' },
  },
});
