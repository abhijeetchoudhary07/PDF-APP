import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';

const LANGUAGES = ['en', 'hi', 'mr', 'bn', 'pa'];
const ROUTES = [
  '/features/pdf-compare',
  '/features/pdf-privacy-sanitizer',
  '/features/pdf-header-footer',
  '/features/pdf-repair',
  '/features/pdf-extractor'
];

test.describe('Phase 2 Shared — Multi-Language / Internationalization @phase2 @i18n', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const lang of LANGUAGES) {
    for (const route of ROUTES) {
      test(`I18N: Route ${route} renders cleanly in ${lang} without raw translation keys`, async ({ page }) => {
        // Set language preference in localStorage
        await page.addInitScript((l) => {
          localStorage.setItem('IFH_LANG', l);
        }, lang);

        await page.goto(route);
        await expect(page.locator('h1, .page-title, .title').first()).toBeVisible();

        // Ensure no raw keys like 'compare.', 'privacySanitizer.', etc. are visible
        const pageText = await page.locator('main').innerText();
        expect(pageText).not.toMatch(/\b(compare|privacySanitizer|headerFooter|repair|extractor)\.[a-zA-Z0-9_]+\b/);
      });
    }
  }

  test('I18N: Switching language dynamically updates UI labels', async ({ page }) => {
    await page.goto('/features/pdf-compare');

    // Find language selector if present
    const langSelect = page.locator('.language-selector select, select.lang-select, [data-testid="lang-select"]');
    if (await langSelect.isVisible()) {
      await langSelect.selectOption('hi');
      // Verify Hindi heading
      await expect(page.locator('h1, .page-title').first()).toContainText(/पीडीएफ तुलना|तुलना/);

      await langSelect.selectOption('en');
      await expect(page.locator('h1, .page-title').first()).toContainText(/PDF Compare|Compare/i);
    }
  });
});
