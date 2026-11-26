// `npm run test:web`: the built web view in Chromium, GitHub answered from tests/web/recording.ts.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/web',
  testMatch: '*.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  // The sky is WebGL, and a machine without a GPU draws it in software: slowly.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173/', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite build web && npx vite preview web --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
