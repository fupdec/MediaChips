import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.MEDIA_CHIPS_E2E_PORT || 12321)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: baseURL,
    timeout: 180_000,
    // Tests must use the isolated profile created by e2e-server.mjs.
    reuseExistingServer: false,
  },
})
