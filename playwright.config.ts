// ---------------------------------------------------------------------------
// playwright.config.ts - end-to-end browser tests (e2e/).
//
// Serves the production build via `vite preview` so tests run against what
// ships, not the dev overlay. CI runs headless; locally the trace + video
// capture on failure keeps UX regressions debuggable.
// ---------------------------------------------------------------------------

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Serve the production bundle; rebuild first so tests never see stale dist.
    command: 'npm run build && vite preview --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
