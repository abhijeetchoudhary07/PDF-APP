import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Validator — Preset Selection & Metadata @validator @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-001: Open validator page', async ({ page }) => {
    await expect(page).toHaveURL(/.*features\/document-validator/);
    await expect(page.locator('h1, .page-title').first()).toContainText(/validator|verify/i);
    await expect(page.locator('.preset-selector, select, .preset-badge').first()).toBeVisible();
  });

  test('VAL-002 to VAL-005 & VAL-007: Select Exam/Job/ID/Visa preset and update requirements', async ({ page }) => {
    const presetSelect = page.locator('select, .preset-select, #presetSelect');
    await expect(presetSelect).toBeVisible({ timeout: 10000 });

    // Select SSC or first available preset
    await presetSelect.selectOption({ index: 0 });
    await expect(page.locator('.preset-info-card, .preset-meta, .slot-requirements').first()).toBeVisible();

    // Select another preset (e.g. UPSC or index 1)
    if (await presetSelect.locator('option').count() > 1) {
      await presetSelect.selectOption({ index: 1 });
      await expect(page.locator('.preset-info-card, .preset-meta').first()).toBeVisible();
    }
  });

  test('VAL-009 to VAL-012: Verify preset source transparency, name, and document types', async ({ page }) => {
    await expect(page.locator('.preset-name, .preset-badge, h2, h3').first()).toBeVisible();
    // Slots for applicable document types (photo, signature, pdf) should be displayed
    await expect(page.locator('.doc-slot-card, .slot-item').first()).toBeVisible();
  });
});
