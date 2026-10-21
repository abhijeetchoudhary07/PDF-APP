import { test, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { getPhase2FixturePath, uploadFileToDropzone } from '../common/phase2-helpers';

/**
 * Captures the *result* screens of the Part G tools in dark mode at phone
 * width. These are the screens with the status chips, per-page cards and diff
 * tokens -- the parts that a visibility assertion passes and a human eye does
 * not. Screenshots only; the assertions live in g5-g10-mobile-audit.spec.ts.
 */
test.describe('G5-G10 dark-mode result screens @darkshots', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => setupCapacitorMocks(page));

  async function prepare(page: Page, url: string): Promise<void> {
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    const skip = page.getByRole('button', { name: /^skip$/i }).first();
    if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
    const theme = process.env['SHOT_THEME'] === 'light' ? 'light' : 'dark';
    await page.evaluate(t => {
      document.documentElement.setAttribute('data-theme', t);
      document.body.classList.toggle('theme-dark', t === 'dark');
      document.body.classList.toggle('theme-light', t === 'light');
    }, theme);
    await page.waitForTimeout(600);
  }

  test('repair recovery report', async ({ page }) => {
    await prepare(page, '/features/pdf-repair');
    await uploadFileToDropzone(page, getPhase2FixturePath('repair-healthy.pdf'));
    await page.locator('[data-testid="start-recovery"]').click();
    await page.locator('.recovery-report-section').waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/mobile/${process.env['SHOT_THEME'] === 'light' ? 'light' : 'dark'}-g10-repair-report.png`, fullPage: true });
  });

  test('repair encrypted triage', async ({ page }) => {
    await prepare(page, '/features/pdf-repair');
    await uploadFileToDropzone(page, getPhase2FixturePath('repair-encrypted.pdf'));
    await page.locator('[data-testid="triage-encrypted-banner"]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/mobile/${process.env['SHOT_THEME'] === 'light' ? 'light' : 'dark'}-g10-repair-triage.png`, fullPage: true });
  });

  test('compare word-level diff', async ({ page }) => {
    await prepare(page, '/features/pdf-compare');
    await page.locator('.dropzone-card').nth(0).locator('input[type="file"]')
      .setInputFiles(getPhase2FixturePath('text-changed-original.pdf'));
    await page.locator('.dropzone-card').nth(1).locator('input[type="file"]')
      .setInputFiles(getPhase2FixturePath('text-changed-modified.pdf'));
    await page.getByRole('button', { name: /compare documents|तुलना/i }).first().click();
    await page.locator('.summary-metrics-grid').waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/mobile/${process.env['SHOT_THEME'] === 'light' ? 'light' : 'dark'}-g8-compare-report.png`, fullPage: true });
  });

  test('flatten selective report', async ({ page }) => {
    await prepare(page, '/features/pdf/flatten');
    await uploadFileToDropzone(page, getPhase2FixturePath('privacy-forms.pdf'));
    const formsOnly = page.getByRole('radio', { name: /forms only/i }).or(page.locator('input[value="forms"]'));
    await formsOnly.waitFor({ timeout: 20000 });
    await formsOnly.click();
    await page.getByRole('button', { name: /flatten pdf now/i }).click();
    await page.locator('.comparison-metrics-card').waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/mobile/${process.env['SHOT_THEME'] === 'light' ? 'light' : 'dark'}-g7-flatten-report.png`, fullPage: true });
  });

  test('archival readiness report', async ({ page }) => {
    await prepare(page, '/features/pdf/archival');
    await uploadFileToDropzone(page, getPhase2FixturePath('hf-multipage-portrait.pdf'));
    await page.locator('.report-box').waitFor({ timeout: 25000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/mobile/${process.env['SHOT_THEME'] === 'light' ? 'light' : 'dark'}-g6-archival-readiness.png`, fullPage: true });
  });
});
