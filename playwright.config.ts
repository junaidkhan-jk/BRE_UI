import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the Rule Studio (M5-09).
 *
 * The tests run against the production bundle served by `vite preview`, not the dev server. The
 * dev server transforms modules on the fly and never produces the bundle anyone actually ships —
 * and the one UI defect this project has had in production was a bundling defect: an ES-module
 * script that rendered a blank page over `file://`. A test suite that only ever exercised the dev
 * server would have been green throughout.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Capped, because the default is one worker per core and this suite is not CPU-bound — it is
  // memory-bound. Every page parses the two-megabyte Monaco bundle, so sixteen workers on a
  // sixteen-core machine ran the browser out of memory and failed a DIFFERENT test each run with
  // "Target page, context or browser has been closed". Rotating failures that pass on a rerun are
  // worse than a red suite: the rerun is read as proof there was nothing wrong.
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  // Zero, deliberately. A retry turns a real race into an intermittent pass, and this suite's job
  // is to catch exactly that class of defect — the blank-page-over-file:// bug it was written for
  // was a load-order race.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
