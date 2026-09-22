import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Smart PDF OCR — Language Selection @ocr', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-ocr');
  });

  test('OCR-024 to OCR-028: Language options (English, Hindi, Marathi, Bengali, Punjabi) are selectable', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/scanned.pdf'));

    const langSelect = page.locator('select, #languageSelect, .lang-select, ion-select');
    await expect(langSelect).toBeVisible({ timeout: 10000 });

    // Test English selection
    await langSelect.selectOption('eng').catch(() => langSelect.selectOption({ label: 'English' }));
    
    // Test Hindi selection
    await langSelect.selectOption('hin').catch(() => langSelect.selectOption({ label: 'Hindi' }));
    
    // Test Marathi selection
    await langSelect.selectOption('mar').catch(() => langSelect.selectOption({ label: 'Marathi' }));
    
    // Test Bengali selection
    await langSelect.selectOption('ben').catch(() => langSelect.selectOption({ label: 'Bengali' }));
    
    // Test Punjabi selection
    await langSelect.selectOption('pan').catch(() => langSelect.selectOption({ label: 'Punjabi' }));
  });

  test('OCR-029 & OCR-034: Change language before processing and verify multi-language support', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/scanned.pdf'));

    const langSelect = page.locator('select, #languageSelect, .lang-select, ion-select');
    await expect(langSelect).toBeVisible({ timeout: 10000 });

    // Select Hindi
    await langSelect.selectOption('hin').catch(() => langSelect.selectOption({ label: 'Hindi' }));
    await expect(langSelect).toHaveValue(/hin/);

    // Switch to Bengali
    await langSelect.selectOption('ben').catch(() => langSelect.selectOption({ label: 'Bengali' }));
    await expect(langSelect).toHaveValue(/ben/);
  });
});
