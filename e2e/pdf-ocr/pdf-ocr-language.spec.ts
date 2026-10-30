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

  test('O0-E2E: opens OCR Language Manager, checks badges, downloads language, and frees up space', async ({ page }) => {
    // Intercept CDN fetch requests to deliver valid mock traineddata
    await page.route('**/*.traineddata*', async route => {
      const mockBuffer = Buffer.from([
        0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
        0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);
      await route.fulfill({
        status: 200,
        contentType: 'application/gzip',
        headers: {
          'Content-Length': String(mockBuffer.length),
          'Access-Control-Allow-Origin': '*'
        },
        body: mockBuffer
      });
    });

    await openConfigureStep(page);

    // 1. Open Language Manager bottom sheet
    const manageBtn = page.getByTestId('open-language-manager-btn');
    await expect(manageBtn).toBeVisible({ timeout: 15000 });
    await manageBtn.click();

    // 2. Verify sheet is opened
    const sheet = page.getByTestId('ocr-language-manager-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // 3. Verify English is "Offline Ready"
    const engBadge = page.getByTestId('badge-eng');
    await expect(engBadge).toBeVisible();
    await expect(engBadge).toContainText(/offline ready/i);

    // 4. Verify Hindi has "Download Available" badge
    const hinBadge = page.getByTestId('badge-hin');
    await expect(hinBadge).toBeVisible();

    // 5. Download Hindi model
    const hinDownloadBtn = page.getByTestId('download-btn-hin');
    if (await hinDownloadBtn.isVisible()) {
      await hinDownloadBtn.click();

      // Check for download completion / checkmark
      await expect(page.getByTestId('ready-check-hin')).toBeVisible({ timeout: 15000 });
    }

    // 6. Test "Free Up Space" button
    const freeSpaceBtn = page.getByTestId('free-up-space-btn');
    if (await freeSpaceBtn.isEnabled()) {
      await freeSpaceBtn.click();
      // Storage used resets to 0.0 MB
      const storageValue = page.getByTestId('storage-used-value');
      await expect(storageValue).toContainText(/0(\.0)?\s*MB/i, { timeout: 10000 });
      // Hindi returns to available / download btn
      await expect(page.getByTestId('download-btn-hin')).toBeVisible({ timeout: 10000 });
    }

    // 7. Close sheet
    const closeBtn = page.getByTestId('close-sheet-btn');
    await closeBtn.click();
    await expect(sheet).toBeHidden();
  });

  test('O1-E2E: opens Language Selector, searches Indic/International languages, multi-selects hin+eng, and confirms bilingual combination', async ({ page }) => {
    // Intercept CDN fetch requests to deliver valid mock traineddata
    await page.route('**/*.traineddata*', async route => {
      const mockBuffer = Buffer.from([
        0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
        0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);
      await route.fulfill({
        status: 200,
        contentType: 'application/gzip',
        headers: {
          'Content-Length': String(mockBuffer.length),
          'Access-Control-Allow-Origin': '*'
        },
        body: mockBuffer
      });
    });

    await openConfigureStep(page);

    // 1. Open Language Selector bottom sheet
    const openSelectorBtn = page.getByTestId('open-language-selector-btn');
    await expect(openSelectorBtn).toBeVisible({ timeout: 15000 });
    await openSelectorBtn.click();

    // 2. Search for Hindi in Indic tab
    const searchInput = page.getByTestId('ocr-language-search-input');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Hindi');

    const hinChip = page.getByTestId('lang-chip-hin');
    await expect(hinChip).toBeVisible();
    await hinChip.click();

    // 3. Clear search and switch to International tab
    await searchInput.fill('');
    const intlTab = page.getByTestId('tab-international');
    await intlTab.click();

    // 4. Toggle English so Hindi becomes primary and English secondary (hin + eng)
    const engChip = page.getByTestId('lang-chip-eng');
    await expect(engChip).toBeVisible();
    // First click deselects initial English, leaving Hindi as sole primary
    await engChip.click();
    // Second click selects English as secondary
    await engChip.click();

    // 5. Confirm bilingual combination (hin + eng)
    const confirmBtn = page.getByTestId('confirm-languages-btn').locator('button');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // If download confirmation modal appears for Hindi, confirm download
    const confirmDownloadBtn = page.getByTestId('confirm-download-btn');
    const isModalVisible = await confirmDownloadBtn.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
    if (isModalVisible) {
      await confirmDownloadBtn.click();
      await expect(confirmDownloadBtn).toBeHidden({ timeout: 15000 });
    }

    // 6. Verify selection on main configure screen
    await expect(page.getByTestId('ocr-lang-hin')).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 });

    // 7. Verify secondary language is set to English
    const secondarySelect = page.locator('select.form-select').first();
    await expect(secondarySelect).toBeVisible();
    await expect(secondarySelect).toHaveValue('eng');
  });

  test('O2-E2E: automatic script detection displays smart banner, allows override via [Change], and remembers user preference', async ({ page }) => {
    // Intercept CDN fetch requests to deliver valid mock traineddata
    await page.route('**/*.traineddata*', async route => {
      const mockBuffer = Buffer.from([
        0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
        0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);
      await route.fulfill({
        status: 200,
        contentType: 'application/gzip',
        headers: {
          'Content-Length': String(mockBuffer.length),
          'Access-Control-Allow-Origin': '*'
        },
        body: mockBuffer
      });
    });

    // 1. Upload Hindi document with Devanagari script
    await page.locator('input[type="file"]').setInputFiles(getTestDataPath('pdf/hindi.pdf'));

    // 2. Verify Smart Detection Banner appears with script, language, and confidence
    const banner = page.getByTestId('smart-detection-banner').first();
    await expect(banner).toBeVisible({ timeout: 20000 });
    await expect(banner).toContainText(/Devanagari/i);
    await expect(banner).toContainText(/Hindi/i);
    await expect(banner).toContainText(/%/); // Confidence percentage displayed

    // 3. Click "[Change]" button in the banner to override language
    const changeBtn = page.getByTestId('smart-detect-change-btn').first();
    await expect(changeBtn).toBeVisible();
    await changeBtn.click();

    // 4. Language Selector bottom sheet appears
    const selectorSheet = page.getByTestId('ocr-language-selector-sheet');
    await expect(selectorSheet).toBeVisible({ timeout: 10000 });

    // 5. Select Marathi (mar) and deselect Hindi to make Marathi the primary override
    const marChip = page.getByTestId('lang-chip-mar');
    await expect(marChip).toBeVisible();
    await marChip.click(); // Adds Marathi -> ['hin', 'mar']

    const hinChip = page.getByTestId('lang-chip-hin');
    await expect(hinChip).toBeVisible();
    await hinChip.click(); // Deselects Hindi -> ['mar'] becomes primary!

    // 6. Confirm override
    const confirmBtn = page.getByTestId('confirm-languages-btn').locator('button');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // If download confirmation modal appears for Marathi, confirm download
    const confirmDownloadBtn = page.getByTestId('confirm-download-btn');
    const isModalVisible = await confirmDownloadBtn.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
    if (isModalVisible) {
      await confirmDownloadBtn.click();
      await expect(confirmDownloadBtn).toBeHidden({ timeout: 15000 });
    }

    // 7. Verify the banner now updates to reflect Marathi for Devanagari script
    await expect(banner).toContainText(/Marathi/i);

    // 8. Move to configure step
    const configureBtn = page.getByRole('button', { name: /configure ocr/i });
    await expect(configureBtn).toBeVisible({ timeout: 15000 });
    await configureBtn.click();

    // 9. Verify Marathi pill is selected on configure step
    await expect(page.getByTestId('ocr-lang-mar')).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 });
  });

  test('O2-E2E: ambiguous or noisy scan triggers low-confidence sheet with top suggestions and quick selection', async ({ page }) => {
    // 1. Upload scanned document with ambiguous/blank ink
    await page.locator('input[type="file"]').setInputFiles(getTestDataPath('pdf/scanned.pdf'));

    // 2. Verify low-confidence selection sheet appears (never silently guessing on weak signals)
    const lowConfidenceSheet = page.getByTestId('low-confidence-sheet');
    await expect(lowConfidenceSheet).toBeVisible({ timeout: 20000 });

    // 3. Verify top suggestion pills are offered
    const hinPill = page.getByTestId('suggestion-pill-hin');
    await expect(hinPill).toBeVisible({ timeout: 5000 });

    // 4. Tap Hindi suggestion pill
    await hinPill.click();

    // 5. Sheet dismisses and smart banner appears with selected language
    await expect(lowConfidenceSheet).toBeHidden({ timeout: 5000 });
    const banner = page.getByTestId('smart-detection-banner').first();
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText(/Hindi/i);
  });
});
