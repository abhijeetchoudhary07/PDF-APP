import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * Captures the phone screenshots for the Play Store listing.
 *
 * Deliberately a test rather than a script. A screenshot script drifts from
 * the app the moment a selector changes and produces a listing image of a
 * broken page without anyone noticing; a test fails instead. Each capture
 * below waits for the content it is there to show, so a blank or half-rendered
 * screen cannot be published.
 *
 * Run only against the mobile project — Play wants phone screenshots:
 *
 *   npx playwright test e2e/release/store-screenshots.spec.ts --project=mobile-chrome
 *
 * Output lands in `docs/screenshots/`, which is the folder PLAY_STORE.md points
 * the uploader at.
 */

const OUT = path.resolve(__dirname, '../../docs/screenshots');

/** Play rejects screenshots below 320px on the short edge. Pixel 5 is 393x851. */
const MIN_EDGE = 320;

interface Shot {
  /** File name, numbered so the Console upload order matches the story. */
  readonly name: string;
  readonly route: string;
  /** Something that proves the page actually rendered before we capture it. */
  readonly ready: string;
}

const SHOTS: readonly Shot[] = [
  { name: '01-home', route: '/home', ready: 'app-header' },
  { name: '02-photo-tools', route: '/features/photo', ready: 'app-file-dropzone, main' },
  { name: '03-pdf-studio', route: '/features/pdf', ready: 'main' },
  { name: '04-organize-pages', route: '/features/pdf/organize', ready: 'app-file-dropzone, main' },
  { name: '05-document-scanner', route: '/features/document-scanner', ready: 'main' },
  { name: '06-ocr', route: '/features/pdf-ocr', ready: 'main' },
  { name: '07-presets', route: '/features/presets', ready: 'main' },
  { name: '08-premium', route: '/features/premium', ready: 'main' },
];

async function settle(page: Page, ready: string): Promise<void> {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 30000 });
  // Let lazy icons and fonts paint. Not a fixed wait on a race — the network
  // being idle is the actual condition for "nothing else is going to appear".
  await page.waitForLoadState('networkidle');
}

test.describe('Release — Play Store screenshots @release @screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const shot of SHOTS) {
    test(`SHOT-${shot.name}`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'mobile-chrome',
        'Store screenshots are phone screenshots; run with --project=mobile-chrome.',
      );

      await page.goto(shot.route);
      await expect(page).toHaveURL(new RegExp(shot.route.replace(/\//g, '\\/')));
      await settle(page, shot.ready);

      const size = page.viewportSize();
      expect(size, 'no viewport').not.toBeNull();
      expect(Math.min(size!.width, size!.height)).toBeGreaterThanOrEqual(MIN_EDGE);

      await page.screenshot({ path: path.join(OUT, `${shot.name}.png`), fullPage: false });
    });
  }
});
