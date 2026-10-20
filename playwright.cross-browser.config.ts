import { defineConfig, devices } from '@playwright/test';

import base from './playwright.config';

// The e2e suite in Safari's and Firefox's engines, for the nightly run (.github/workflows/cross-browser-nightly.yml).
// Everything is playwright.config.ts's (the production server, retries, workers, timeouts); only the browsers differ.
// One engine at a time: `npx playwright test -c playwright.cross-browser.config.ts --project=webkit` (or firefox),
// after `npm run build`. A spec that sets its own viewport, touch screen or device keeps it; the project gives only
// the engine and the desktop defaults under it. The engine is named outright (`browserName`): a device a spec takes
// (`devices['iPhone 13']`) brings its own default engine, which would otherwise win.
export default defineConfig({
  ...base,
  // On CI an HTML report as well, uploaded with the traces when a run fails.
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : base.reporter,
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'], browserName: 'webkit' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], browserName: 'firefox' } },
  ],
});
