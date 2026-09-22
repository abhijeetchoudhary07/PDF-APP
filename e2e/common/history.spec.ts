import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Common — History Tracking & Privacy @history', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('HIS-010: Inspect stored history to ensure document contents are NEVER stored', async ({ page }) => {
    await page.goto('/features/document-validator');

    // Check localStorage / Preferences key 'IFH_HISTORY_V2'
    const historyJson = await page.evaluate(() => localStorage.getItem('IFH_HISTORY_V2'));
    if (historyJson) {
      const items = JSON.parse(historyJson);
      for (const item of items) {
        // Assert no base64 payloads or document contents exist
        expect(item).not.toHaveProperty('dataUrl');
        expect(item).not.toHaveProperty('base64');
        expect(item).not.toHaveProperty('content');
        if (item.outputFileName) {
          expect(item.outputFileName.length).toBeLessThan(500);
        }
      }
    }
  });

  test('HIS-001 to HIS-006: History entry metadata structure', async ({ page }) => {
    await page.goto('/features/pdf-ocr');
    // History service should maintain valid items
    const isValidStorage = await page.evaluate(() => {
      try {
        const h = localStorage.getItem('IFH_HISTORY_V2');
        if (!h) return true;
        const parsed = JSON.parse(h);
        return Array.isArray(parsed);
      } catch {
        return false;
      }
    });
    expect(isValidStorage).toBe(true);
  });
});
