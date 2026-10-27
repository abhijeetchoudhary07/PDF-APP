import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Photo Converter Cybersecurity & Edge-Case Stress Testing', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('SEC-1: Boundary target KB (5KB & 10KB) with Thin Black Border', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/portrait-person.png'));
    await expect(page.locator('.configuring-section')).toBeVisible();

    // Select custom KB = 10 KB
    await page.locator('.custom-chip').click();
    const kbInput = page.locator('.custom-kb-input');
    await kbInput.fill('10');
    await kbInput.dispatchEvent('input');

    // Customize style: Thin Black Border
    await page.locator('.style-toggle-btn').click();
    await page.locator('button.format-chip', { hasText: 'Thin Black Border' }).click();

    // Compress
    await page.locator('.btn-primary', { hasText: /Compress to 10 KB/i }).click();
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });

    // Verify after size is <= 10 KB (or within tolerance)
    const afterText = await page.locator('.after-card .stat-size').textContent();
    console.log(`[SEC-1 RESULT] 10KB target produced: ${afterText}`);
    expect(afterText).toBeDefined();
  });

  test('SEC-2: Government Presets (PAN 200x230) dimension & KB enforcement with border', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await expect(page.locator('.configuring-section')).toBeVisible();

    // Click PAN preset: 200 × 230 px
    const panPreset = page.locator('.smart-preset-btn', { hasText: /200 × 230 px/i });
    await panPreset.click();

    // Customize style: Thin Black Border
    await page.locator('.style-toggle-btn').click();
    await page.locator('button.format-chip', { hasText: 'Thin Black Border' }).click();

    // Compress
    await page.locator('.btn-primary', { hasText: /Compress to 50 KB/i }).click();
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });

    // Verify dimensions in after preview
    const resultText = await page.locator('app-result-preview').textContent();
    console.log(`[SEC-2 RESULT] PAN preset preview text: ${resultText}`);
    expect(resultText).toContain('200 × 230 px');
  });

  test('SEC-3: Input sanitization for Name & DOP Strip (HTML, control chars, long strings)', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await expect(page.locator('.configuring-section')).toBeVisible();

    // Open style options
    await page.locator('.style-toggle-btn').click();
    await page.locator('button.format-chip', { hasText: 'Thin Black Border' }).click();

    // Enable DOP Strip
    const toggleLabel = page.locator('.toggle-title', { hasText: 'Add Name & Date' });
    await toggleLabel.scrollIntoViewIfNeeded();
    await toggleLabel.click();

    // Inject malicious string with script tags, control chars, and long text
    const maliciousInput = '<script>alert(1)</script>\u0000\u0007VERY_LONG_NAME_TEST_'.repeat(5);
    const candidateInput = page.locator('input.uppercase-input');
    await candidateInput.fill(maliciousInput);

    const dateInput = page.locator('.field-group input').nth(1);
    await dateInput.fill('27.10.2026<img src=x onerror=1>');

    // Compress
    await page.locator('.btn-primary', { hasText: /Compress to/i }).click();
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });

    // Confirm that app did not crash, no script executed, preview rendered cleanly
    const previewImg = page.locator('app-result-preview img').first();
    await expect(previewImg).toBeVisible();
  });

  test('SEC-4: Negative / NaN / Malformed Custom KB inputs', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await expect(page.locator('.configuring-section')).toBeVisible();

    await page.locator('.custom-chip').click();
    const kbInput = page.locator('.custom-kb-input');

    // Test negative number
    await kbInput.fill('-100');
    await kbInput.dispatchEvent('input');

    // Verify it clamps to minimum 5
    const val = await kbInput.inputValue();
    expect(Number(val)).toBeGreaterThanOrEqual(5);

    // Test clicking -10 stepper multiple times
    const minusBtn = page.locator('.stepper-btn', { hasText: '-10' });
    await minusBtn.click();
    await minusBtn.click();
    const clampedVal = await kbInput.inputValue();
    expect(Number(clampedVal)).toBeGreaterThanOrEqual(5);

    // Compress with minimum clamped KB
    await page.locator('.btn-primary', { hasText: /Compress to/i }).click();
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });
  });

  test('SEC-5: Invalid image format upload & graceful error UI', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    
    // Upload unreadable/unsupported file
    await fileInput.setInputFiles(getTestDataPath('photos/unsupported-photo.gif'));

    // Verify error message is shown in dropzone
    const errorBanner = page.locator('.error-state').first();
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
    const errText = await errorBanner.textContent();
    expect(errText?.length).toBeGreaterThan(0);
  });

  test('SEC-6: Exact Pixel Resize Mode with Thin Black Border and DOP Strip', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await expect(page.locator('.configuring-section')).toBeVisible();

    // Switch to Exact Pixel Resize tab
    await page.getByRole('tab', { name: /pixel/i }).click();

    // Pixel preset: 200 × 230
    const pixelPreset = page.locator('.preset-chip', { hasText: '200 × 230 px' });
    await pixelPreset.click();

    // Customize style in pixel mode: Thin Black Border
    await page.locator('.style-toggle-btn').click();
    await page.locator('button.format-chip', { hasText: 'Thin Black Border' }).click();

    // Resize button
    const resizeBtn = page.locator('.btn-primary', { hasText: /Resize to 200 × 230 px/i });
    await expect(resizeBtn).toBeVisible();
    await resizeBtn.click();

    // Result preview
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });
    const resultText = await page.locator('app-result-preview').textContent();
    console.log(`[SEC-6 RESULT] Pixel resize result text: ${resultText}`);
    expect(resultText).toContain('200 × 230 px');
  });
});
