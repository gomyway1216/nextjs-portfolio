import { defineConfig } from '@playwright/test';

// Online Blokus on the real page, against the Firebase emulators and a production build. Not part of CI: it needs the
// backend repo. To run: see the note at the top of blokus-online.spec.ts.
const PORT = 3112;

const engines = ['chromium', 'webkit', 'firefox'] as const;

export default defineConfig({
  testDir: '.',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  // One at a time: each test is already two to four players, and the functions emulator starts a worker per request.
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: engines.flatMap((browserName) => [
    { name: `${browserName}-desktop`, use: { browserName, viewport: { width: 1280, height: 800 } } },
    {
      name: `${browserName}-phone`,
      // Firefox has no isMobile in Playwright; hasTouch is what these tests play by.
      use: { browserName, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: browserName !== 'firefox' },
    },
  ]),
  webServer: {
    command: `npx next start -p ${PORT}`,
    cwd: '../..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
