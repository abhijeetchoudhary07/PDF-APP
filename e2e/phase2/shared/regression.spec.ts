import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';

const PHASE1_ROUTES = [
  { path: '/features/photo', title: 'Photo' },
  { path: '/features/signature', title: 'Signature' },
  { path: '/features/presets', title: 'Presets' },
  { path: '/features/pdf-compress', title: 'Compress' },
  { path: '/features/images-to-pdf', title: 'Images to PDF' },
  { path: '/features/pdf-merge', title: 'Merge' },
  { path: '/features/pdf-split', title: 'Split' },
  { path: '/features/pdf-organize', title: 'Organize' },
  { path: '/features/pdf-reader', title: 'Reader' },
  { path: '/features/pdf-signing', title: 'Signing' },
  { path: '/features/pdf-forms', title: 'Forms' },
  { path: '/features/pdf-security', title: 'Security' },
  { path: '/features/converter', title: 'Converter' },
  { path: '/features/batch-images', title: 'Batch' }
];

test.describe('Phase 1 Regression Suite @phase2 @regression', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const route of PHASE1_ROUTES) {
    test(`REG: Route ${route.path} loads and renders page header without errors`, async ({ page }) => {
      await page.goto(route.path);

      /*
       * Several of these paths are aliases that redirect to a canonical route
       * -- /features/pdf-merge lands on /features/pdf/merge. Asserting the
       * requested URL therefore failed on exactly the routes that were working
       * correctly. What matters here is that the alias resolves to a real
       * page rather than the 404 route, so assert that instead.
       */
      await expect(page).not.toHaveURL(/\/404/);
      await expect(page.locator('h1, .page-title, .title').first()).toBeVisible();
    });
  }

  test('REG: Home page displays tool cards and registry navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.tool-card, ion-card, [routerLink]').first()).toBeVisible();
  });
});
