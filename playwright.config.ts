import { defineConfig, devices } from '@playwright/test';

/**
 * Two ways to run the suite.
 *
 * `E2E_TARGET=prod` builds once and serves `www/` statically; anything else
 * uses `ng serve`. The difference matters more than it looks: the dev server
 * compiles each lazy route on first request, so with the suite running in
 * parallel those compiles queue and tests fail on navigation timeouts that have
 * nothing to do with the app — the same tests pass one at a time. The prod
 * target removes that variable and tests the artefact that actually ships, so
 * it is the one CI should use.
 */
const USE_PROD_BUILD = process.env['E2E_TARGET'] === 'prod';

const PORT = USE_PROD_BUILD ? 4173 : 4200;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    /*
     * Generous against the dev server because a first visit to an
     * uncompiled lazy route legitimately takes tens of seconds on a loaded
     * machine. The prod target needs none of that slack.
     */
    navigationTimeout: USE_PROD_BUILD ? 15000 : 45000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    }
  ],
  webServer: {
    command: USE_PROD_BUILD ? 'npm run build && npm run serve:www' : 'npm start',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    // A cold production build is slower to start than a dev server.
    timeout: USE_PROD_BUILD ? 300000 : 120000,
  },
});
