import { defineConfig, devices } from '@playwright/test'

import { API_PORT, OUTBOX_FILE, WEB_PORT } from './e2e/config.ts'

const python = process.platform === 'win32' ? '.venv\\Scripts\\python' : '.venv/bin/python'

// Browser tests: a real browser uses the real web app, API and PostgreSQL.
// Run them with `npm run test:e2e`. Playwright starts both servers by itself.
export default defineConfig({
  testDir: './e2e',
  // One test at a time: they share one database and one demo account.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // On a failure, keep a step-by-step recording: npx playwright show-report
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `${python} -m scripts.run_e2e_server`,
      cwd: '../api',
      env: { E2E_PORT: String(API_PORT), E2E_OUTBOX: OUTBOX_FILE },
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
})
