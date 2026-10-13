import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';

/*
 * Each language with the name it calls itself, as the selector renders it.
 * Asserting on that is what proves the seeded preference was actually picked
 * up: without it, a page that quietly stayed in English would satisfy the
 * "no raw keys" check just as well as a correctly translated one, which is
 * exactly how this loop came to be passing five times over in one language.
 */
const LANGUAGES: Array<[code: string, nativeName: string]> = [
  ['en', 'English'],
  ['hi', 'हिन्दी'],
  ['mr', 'मराठी'],
  ['bn', 'বাংলা'],
  ['pa', 'ਪੰਜਾਬੀ'],
];
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

  for (const [lang, nativeName] of LANGUAGES) {
    for (const route of ROUTES) {
      test(`I18N: Route ${route} renders cleanly in ${lang} without raw translation keys`, async ({ page }) => {
        /*
         * `CapacitorStorage.IFH_APP_LANGUAGE`, not `IFH_LANG`.
         *
         * The app reads its language through `@capacitor/preferences`, which
         * on the web keeps every value in `localStorage` behind a
         * `CapacitorStorage.` prefix, under the key `TranslationService`
         * declares. Seeding `IFH_LANG` set something nothing reads, so all
         * five passes of this loop rendered the page in English and the four
         * non-English ones asserted nothing about their own language.
         */
        await page.addInitScript((l) => {
          localStorage.setItem('CapacitorStorage.IFH_APP_LANGUAGE', l);
        }, lang);

        await page.goto(route);
        await expect(page.locator('h1, .page-title, .title').first()).toBeVisible();
        await expect(page.locator('.lang-trigger-btn .lang-name').first()).toHaveText(nativeName);

        // Ensure no raw keys like 'compare.', 'privacySanitizer.', etc. are visible
        const pageText = await page.locator('main').innerText();
        expect(pageText).not.toMatch(/\b(compare|privacySanitizer|headerFooter|repair|extractor)\.[a-zA-Z0-9_]+\b/);
      });
    }
  }

  /*
   * The language control is a button and a dropdown, not a <select>. So
   * `page.locator('.language-selector select, select.lang-select, ...')`
   * matched nothing, `if (await langSelect.isVisible())` was false, and this
   * test -- the only one that checks a language switch actually repaints the
   * UI -- did nothing at all. `selectOption` would have thrown on the real
   * control anyway.
   */
  async function switchLanguageTo(page: import('@playwright/test').Page, nativeName: string) {
    await page.locator('.lang-trigger-btn').first().click();
    await page.locator('.lang-option-item').filter({ hasText: nativeName }).first().click();
  }

  test('I18N: Switching language dynamically updates UI labels', async ({ page }) => {
    await page.goto('/features/pdf-compare');

    const heading = page.locator('h1').first();
    await expect(heading).toContainText(/compare/i);

    await switchLanguageTo(page, 'हिन्दी');
    await expect(heading).toContainText(/तुलना/);

    await switchLanguageTo(page, 'English');
    await expect(heading).toContainText(/compare/i);
  });
});
