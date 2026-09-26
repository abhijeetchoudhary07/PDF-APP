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
  /*
   * Web-first assertions retry until this deadline. The default 5s was enough
   * for a quiet machine but not for a `toHaveValue` racing a component that is
   * still wiring itself up behind three other workers' PDF renders.
   */
  expect: { timeout: 10000 },
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
    /*
     * 20s, not 10s.
     *
     * These pages render PDFs with pdf.js on the main thread, and the suite
     * runs them four at a time. A click that waits on a page still rasterising
     * its images is slow, not broken -- EXT-022 and HF-010 each failed roughly
     * one full run in three on a click or a fill that then passed every time
     * when the same specs were run serially. Nothing is weakened by waiting
     * longer: an action that succeeds in twelve seconds is still a pass, and a
     * genuinely broken locator still fails, just later.
     */
    actionTimeout: 20000,
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
