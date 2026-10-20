import { defineConfig } from '@playwright/test';

// Smoke tests against the production build: `npm run build` first, then
// `npx playwright test` (the webServer block runs `npm run start`).
// Assertions must not depend on Firestore data — CI runs with
// placeholder Firebase credentials and every page falls back gracefully.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  // On CI, `list` as well: every test's time in the job's log.
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
