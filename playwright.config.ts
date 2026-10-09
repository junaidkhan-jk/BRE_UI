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
  forbidOnly: !!process.env.CI,
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
