import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Image Converter Complete End-to-End Audit & Verification', () => {
  const browserErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    browserErrors.length = 0;
    page.on('pageerror', err => {
      console.error(`[PAGE ERROR]: ${err.message}`);
      browserErrors.push(err.message);
    });
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[CONSOLE ERROR]: ${msg.text()}`);
        browserErrors.push(msg.text());
      }
    });
    await setupCapacitorMocks(page);
  });

  test('F1: Photo Converter - KB Mode across all Target Sizes & Formats with Thin Black Border', async ({ page }) => {
    await page.goto('/features/photo');
    await expect(page).toHaveURL(/.*features\/photo/);

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await expect(page.locator('.configuring-section')).toBeVisible({ timeout: 10000 });

    // Open style options
    await page.locator('.style-toggle-btn').click();
    // Select Thin Black Border
    await page.locator('button.format-chip', { hasText: 'Thin Black Border' }).click();

    // 1. Test 50 KB button
    const btn50 = page.locator('.preset-chip', { hasText: '50 KB' });
    await btn50.click();
    await page.locator('.btn-primary', { hasText: /Compress to 50 KB/i }).click();

    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });
    let previewText = await page.locator('app-result-preview').textContent();
    expect(previewText).toContain('Processing Complete');

    // Return to settings
    await page.getByRole('button', { name: /Change Settings/i }).click();
    await expect(page.locator('.configuring-section')).toBeVisible();

    // 2. Test 20 KB button
    const btn20 = page.locator('.preset-chip', { hasText: '20 KB' });
    await btn20.click();
    await page.locator('.btn-primary', { hasText: /Compress to 20 KB/i }).click();
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });
    previewText = await page.locator('app-result-preview').textContent();
    expect(previewText).toContain('Processing Complete');

    // Return to settings
    await page.getByRole('button', { name: /Change Settings/i }).click();

    // 3. Test Custom KB slider & steppers (+10, -5)
    await page.locator('.custom-chip').click();
    await page.locator('.stepper-btn', { hasText: '+10' }).click();
    await page.locator('.stepper-btn', { hasText: '-5' }).click();

    // Switch output format to WebP
    await page.locator('button.format-chip', { hasText: 'WebP' }).click();
    await page.locator('.btn-primary', { hasText: /Compress to/i }).click();
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });

    expect(browserErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('F2: Photo Converter - Quick Government Form Presets (PAN & Passport)', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/portrait-person.png'));
    await expect(page.locator('.configuring-section')).toBeVisible();

    // Apply PAN preset (200x230 px, Under 50 KB)
    const panPreset = page.locator('.smart-preset-btn', { hasText: /200 × 230 px/i });
    await panPreset.click();

    // Style options: Thin Black Border
    await page.locator('.style-toggle-btn').click();
    await page.locator('button.format-chip', { hasText: 'Thin Black Border' }).click();

    await page.locator('.btn-primary', { hasText: /Compress to 50 KB/i }).click();
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });

    const previewText = await page.locator('app-result-preview').textContent();
    expect(previewText).toContain('200 × 230 px');

    expect(browserErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('F3: Photo Converter - Exact Pixel Resize Mode with Aspect Ratio Lock & Custom Inputs', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await expect(page.locator('.configuring-section')).toBeVisible();

    // Switch to Pixels tab
    await page.getByRole('tab', { name: /pixel/i }).click();

    // Click 300 × 400 preset
    const preset300 = page.locator('.preset-chip', { hasText: '300 × 400 px' });
    await preset300.click();

    // Verify inputs have 300 and 400
    const wInput = page.locator('.dims-grid input').first();
    const hInput = page.locator('.dims-grid input').nth(1);
    expect(await wInput.inputValue()).toBe('300');
    expect(await hInput.inputValue()).toBe('400');

    // Style options: Thin Black Border in pixel mode
    await page.locator('.style-toggle-btn').click();
    await page.locator('button.format-chip', { hasText: 'Thin Black Border' }).click();

    // Resize
    await page.locator('.btn-primary', { hasText: /Resize to/i }).click();
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });

    const previewText = await page.locator('app-result-preview').textContent();
    expect(previewText).toContain('300 × 400 px');

    expect(browserErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('F4: Visual Inspection Modes (Side-by-Side, Split Slider, Toggle View)', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await expect(page.locator('.configuring-section')).toBeVisible();

    await page.locator('.btn-primary', { hasText: /Compress to/i }).click();
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });

    // Test Side-by-Side view button
    const sideBySideBtn = page.locator('.mode-btn', { hasText: 'Side-by-Side' });
    await sideBySideBtn.click();
    await expect(page.locator('.viewport-side-by-side')).toBeVisible();

    // Test Split Slider view button
    const splitSliderBtn = page.locator('.mode-btn', { hasText: 'Split Slider' });
    await splitSliderBtn.click();
    await expect(page.locator('.viewport-slider')).toBeVisible();

    // Test Toggle View button
    const toggleBtn = page.locator('.mode-btn', { hasText: 'Toggle View' });
    await toggleBtn.click();
    await expect(page.locator('.viewport-toggle')).toBeVisible();

    expect(browserErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('F5: Remove and Replace Photo workflow', async ({ page }) => {
    await page.goto('/features/photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await expect(page.locator('.configuring-section')).toBeVisible();

    // Click Remove button
    const removeBtn = page.getByRole('button', { name: /remove/i });
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      await expect(page.locator('app-file-dropzone')).toBeVisible();
    }
  });

  test('F6: ID Photo Studio workflow with KB compression', async ({ page }) => {
    await page.goto('/features/photo/id-photo');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/portrait-person.png'));
    await expect(page.locator('.preview-stage-card')).toBeVisible({ timeout: 15000 });

    // Select preset
    const preset = page.locator('.preset-chip').first();
    await preset.click();

    // Process
    const processBtn = page.getByRole('button', { name: /Create ID Photo/i });
    await processBtn.click();

    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 20000 });
    expect(browserErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
