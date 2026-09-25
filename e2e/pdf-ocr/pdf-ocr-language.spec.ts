import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

/*
 * These tests used to drive a `<select>` dropdown that the page has never had.
 * The primary language is a grid of toggle pills, one per supported language,
 * each carrying `data-testid="ocr-lang-<code>"` and reflecting its state in
 * `aria-pressed` -- so the selection is asserted the way a screen reader would
 * read it rather than by looking for a CSS class.
 *
 * The pills live in the `configure` step, which the page reaches on its own
 * once a chosen PDF has been inspected, so each test waits for them instead of
 * assuming they are on screen the moment the file is attached.
 */

const LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'hin', name: 'Hindi' },
  { code: 'mar', name: 'Marathi' },
  { code: 'ben', name: 'Bengali' },
  { code: 'pan', name: 'Punjabi' },
];

async function openConfigureStep(page: import('@playwright/test').Page) {
  await page.locator('input[type="file"]').setInputFiles(getTestDataPath('pdf/scanned.pdf'));

  /*
   * Choosing a file does not land on the language pills. The page first
   * inspects the PDF and reports whether it already holds selectable text,
   * because running OCR over a digital document is slow and worse than simply
   * reading it -- only then does "Configure OCR" move on to the settings.
   */
  const configure = page.getByRole('button', { name: /configure ocr/i });
  await expect(configure).toBeVisible({ timeout: 30000 });

  /*
   * Detection finishing is not the same as the page having settled: the
   * related-tools strip below renders in the same tick and reflows the column,
   * so a click fired the instant the button appears can miss it. Bringing it
   * into view and letting the layout come to rest first makes this reliable --
   * without it the click silently does nothing and the failure shows up much
   * later as "no language pills".
   */
  await configure.scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  await configure.click();

  await expect(page.getByTestId('ocr-lang-eng')).toBeVisible({ timeout: 15000 });
}

test.describe('Smart PDF OCR — Language Selection @ocr', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-ocr');
  });

  test('OCR-024 to OCR-028: every supported language can be selected', async ({ page }) => {
    await openConfigureStep(page);

    for (const lang of LANGUAGES) {
      const pill = page.getByTestId(`ocr-lang-${lang.code}`);
      await expect(pill, `${lang.name} pill is offered`).toBeVisible();

      await pill.click();
      await expect(pill, `${lang.name} is selected after clicking it`).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
  });

  test('OCR-029 & OCR-034: changing language deselects the previous one', async ({ page }) => {
    await openConfigureStep(page);

    const english = page.getByTestId('ocr-lang-eng');
    const hindi = page.getByTestId('ocr-lang-hin');
    const bengali = page.getByTestId('ocr-lang-ben');

    // English is the default the page opens with.
    await expect(english).toHaveAttribute('aria-pressed', 'true');

    await hindi.click();
    await expect(hindi).toHaveAttribute('aria-pressed', 'true');
    await expect(english, 'only one primary language at a time').toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await bengali.click();
    await expect(bengali).toHaveAttribute('aria-pressed', 'true');
    await expect(hindi).toHaveAttribute('aria-pressed', 'false');
  });

  test('OCR-035: a second language can be added, and cannot repeat the first', async ({ page }) => {
    await openConfigureStep(page);

    await page.getByTestId('ocr-lang-hin').click();

    const secondary = page.locator('select.form-select').first();
    await expect(secondary).toBeVisible();

    // The primary cannot also be the secondary, so its option is disabled.
    await expect(secondary.locator('option[value="hin"]')).toBeDisabled();

    await secondary.selectOption('ben');
    await expect(secondary).toHaveValue('ben');
  });
});
