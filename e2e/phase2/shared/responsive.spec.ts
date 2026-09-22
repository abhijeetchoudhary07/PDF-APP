import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';

const VIEWPORTS = [
  { name: 'Desktop', width: 1280, height: 800 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Mobile', width: 375, height: 667 }
];

const PHASE2_ROUTES = [
  '/features/pdf-compare',
  '/features/pdf-privacy-sanitizer',
  '/features/pdf-header-footer',
  '/features/pdf-repair',
  '/features/pdf-extractor'
];

test.describe('Phase 2 Shared — Responsive Viewports @phase2 @responsive', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const vp of VIEWPORTS) {
    for (const route of PHASE2_ROUTES) {
      test(`RESP: Route ${route} adapts cleanly at ${vp.name} (${vp.width}x${vp.height}) without horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route);

        await expect(page.locator('h1.page-title, h1').first()).toBeVisible();

        // Check horizontal scroll
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

        // Allow at most 5px difference for subtle browser scrollbars
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
      });
    }
  }
});
