import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * Every tool the dashboard, drawer and footer point at, walked end to end.
 *
 * The assertion that matters is the console one: a route that loads but throws
 * on the way in still looks fine in a screenshot.
 */
const CORE_FEATURES = [
  { name: 'Photo Resizer', route: '/features/photo' },
  { name: 'Signature Pad', route: '/features/signature' },
  { name: 'PDF Tools Hub', route: '/features/pdf' },
  { name: 'PDF Merge', route: '/features/pdf/merge' },
  { name: 'PDF Split', route: '/features/pdf/split' },
  { name: 'PDF Compress', route: '/features/pdf-compress' },
  { name: 'PDF Extract', route: '/features/pdf/extract' },
  { name: 'PDF OCR', route: '/features/pdf-ocr' },
  { name: 'History', route: '/features/history' },
  { name: 'Settings', route: '/features/settings' },
  { name: 'Presets', route: '/features/presets' },
  { name: 'Premium', route: '/features/premium' }
];

/**
 * Noise this app produces by design when the optional account backend is not
 * reachable. Everything else is a real failure.
 */
function isExpectedNoise(text: string): boolean {
  return /ERR_CONNECTION_REFUSED|Failed to load resource|net::ERR|RevenueCat|Could not reach/i.test(text);
}

test.describe('Release — Feature navigation @release @navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const feature of CORE_FEATURES) {
    test(`FEAT: ${feature.name} loads cleanly at ${feature.route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isExpectedNoise(msg.text())) errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(feature.route);

      await expect(page.locator('h1, .page-title, .title').first()).toBeVisible();
      // A page that fell through to the wildcard would land here instead.
      await expect(page).not.toHaveURL(/\/404$/);
      expect(errors, `console errors on ${feature.route}`).toEqual([]);
    });
  }

  /*
   * A missing dictionary entry renders the raw key ("settings.general.title")
   * straight into the page, which is invisible to a route-loads assertion but
   * very visible to a user. One test per route: walking all of them in a single
   * test outruns the default timeout on a cold dev server.
   */
  for (const feature of CORE_FEATURES) {
    test(`FEAT-NOKEYS: ${feature.name} renders no raw translation key`, async ({ page }) => {
      await page.goto(feature.route);
      await expect(page.locator('h1, .page-title, .title').first()).toBeVisible();

      const keys = await page.evaluate(() => {
        const text = (document.querySelector('app-root') as HTMLElement)?.innerText ?? '';
        const matches = text.match(
          /\b(common|settings|header|footer|home|tools|ocr|validator|scanner|qrBarcode|pdfIntelligence|headerFooter|photoPage|search|onboarding)\.[A-Za-z][A-Za-z0-9.]*/g
        );
        return [...new Set(matches ?? [])];
      });

      expect(keys, `raw translation keys on ${feature.route}`).toEqual([]);
    });
  }

  test('FEAT-BACK: the browser back button returns to the previous tool', async ({ page }) => {
    await page.goto('/features/photo');
    await expect(page).toHaveURL(/\/features\/photo$/);

    await page.goto('/features/signature');
    await expect(page).toHaveURL(/\/features\/signature$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/features\/photo$/);
    await expect(page.locator('h1, .page-title, .title').first()).toBeVisible();
  });

  test('FEAT-HEADER-BACK: the in-app back button returns to the previous tool', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/features/photo');
    await page.goto('/features/settings');

    await page.getByRole('button', { name: 'Go back' }).click();

    await expect(page).toHaveURL(/\/features\/photo$/);
  });

  test('FEAT-FOOTER: every footer link resolves to a real route', async ({ page }) => {
    // Twenty navigations against a cold dev server needs more than the default.
    test.setTimeout(180_000);

    await page.goto('/home');
    await expect(page.locator('app-footer')).toBeVisible();

    const hrefs = await page
      .locator('app-footer a[href^="/"]')
      .evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!))]);

    expect(hrefs.length).toBeGreaterThan(10);

    for (const href of hrefs) {
      await page.goto(href);
      await expect(page, `${href} should not fall through to 404`).not.toHaveURL(/\/404$/);
    }
  });
});
