// `npm run test:web`: the built web view in Chromium, GitHub answered from tests/web/recording.ts.
// Every test records a video into test-results/; CI keeps it (.github/workflows/ci.yml).
//
// Screenshots (`toHaveScreenshot`) are compared only where the baselines were made: in the
// Playwright container, the same Linux, Chromium and fonts as CI. `npm run test:screenshots` runs
// the tests there and sets SCREENSHOTS=1; anywhere else the comparisons are skipped, and the
// behaviour checks still run.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/web',
  testMatch: '*.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  ignoreSnapshots: !process.env.SCREENSHOTS,
  // One baseline per screenshot, not per platform: there is only one platform that makes them.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' } },
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    video: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite build web && npx vite preview web --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
