import { defineConfig } from '@playwright/test';

// Smoke tests against the production build: `npm run build` first, then
// `npx playwright test` (the webServer block runs `npm run start`).
// Assertions must not depend on Firestore data — CI runs with
// placeholder Firebase credentials and every page falls back gracefully.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  // On CI the runner has 4 cores and Playwright's default is half of them. The suite (about 340 tests against one
  // production server) grew to 12-19 minutes of the job's 20 with 2 workers and was cut off at 20 on #941, so it runs
  // 4 at a time there. Locally the default stays.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
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
