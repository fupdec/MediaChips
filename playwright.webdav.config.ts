import {defineConfig, devices} from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'webdav-https.spec.ts', workers: 1, timeout: 120_000,
  use: {...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:18445', trace: 'retain-on-failure', actionTimeout: 15_000},
  webServer: {command: 'node scripts/webdav-fixture/server.mjs', url: 'http://127.0.0.1:18445',
    timeout: 180_000, reuseExistingServer: false},
})
