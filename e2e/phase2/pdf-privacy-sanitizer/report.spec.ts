import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Privacy Sanitizer — Before vs After Audit Report @phase2 @privacy', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-privacy-sanitizer');
  });

  test('PRV-030: Before vs After audit report shows correct reduction', async ({ page }) => {
    const metaPath = getPhase2FixturePath('privacy-metadata.pdf');
    await uploadFileToDropzone(page, metaPath);
    await waitForProcessingToFinish(page);

    const sanitizeBtn = page.locator('app-button button:has-text("Sanitize"), app-button button:has-text("संवेदनशील डेटा हटाएं")').first();
    await sanitizeBtn.click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.sanitized-result-section')).toBeVisible({ timeout: 15000 });

    const beforeMetric = page.locator('.before-after-metrics .metric.before .value');
    const afterMetric = page.locator('.before-after-metrics .metric.after .value');

    const beforeVal = parseInt(await beforeMetric.innerText(), 10);
    const afterVal = parseInt(await afterMetric.innerText(), 10);

    expect(beforeVal).toBeGreaterThan(0);
    expect(afterVal).toBeLessThan(beforeVal);
    expect(afterVal).toBe(0);

    // Clean banner is visible
    await expect(page.locator('.clean-badge-banner')).toBeVisible();
  });
});
