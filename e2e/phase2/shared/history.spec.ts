import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('Phase 2 Shared — History Tracking & Privacy @phase2 @history', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('HIS-020: PDF Compare logs history event without raw document content', async ({ page }) => {
    await page.goto('/features/pdf-compare');
    const origPath = getPhase2FixturePath('identical-original.pdf');
    const modPath = getPhase2FixturePath('identical-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);
    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);

    // Check history storage
    const historyJson = await page.evaluate(() => localStorage.getItem('IFH_HISTORY_V2'));
    expect(historyJson).toBeTruthy();
    const items = JSON.parse(historyJson!);
    const compareItem = items.find((it: any) => it.operation?.includes('Compare'));
    expect(compareItem).toBeTruthy();
    expect(compareItem).not.toHaveProperty('dataUrl');
    expect(compareItem).not.toHaveProperty('base64');
    expect(compareItem).not.toHaveProperty('content');
  });

  test('HIS-021: Privacy Sanitizer logs history event upon successful sanitization', async ({ page }) => {
    await page.goto('/features/pdf-privacy-sanitizer');
    const cleanPath = getPhase2FixturePath('privacy-clean.pdf');
    await uploadFileToDropzone(page, cleanPath);
    await waitForProcessingToFinish(page);

    const sanitizeBtn = page.locator('app-button button:has-text("Sanitize"), app-button button:has-text("संवेदनशील डेटा हटाएं")').first();
    await sanitizeBtn.click();
    await waitForProcessingToFinish(page);

    const historyJson = await page.evaluate(() => localStorage.getItem('IFH_HISTORY_V2'));
    const items = JSON.parse(historyJson || '[]');
    const privItem = items.find((it: any) => it.operation?.includes('Sanitize') || it.operation?.includes('Privacy'));
    expect(privItem).toBeTruthy();
  });
});
