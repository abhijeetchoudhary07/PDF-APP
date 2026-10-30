import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('Q1: Preset Builder from Instructions (/features/presets/builder) @preset-builder @q1', () => {
  const recruitmentPdfPath = path.resolve(__dirname, 'test-data/presets/recruitment-guidelines.pdf');
  const passportPdfPath = path.resolve(__dirname, 'test-data/presets/passport-guidelines.pdf');
  const unparseablePdfPath = path.resolve(__dirname, 'test-data/presets/unparseable-guidelines.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('PB-001: Ingestion & Route Accessibility — Direct navigation and alias redirects', async ({ page }) => {
    // Test alias redirect from /features/preset-builder
    await page.goto('/features/preset-builder');
    await expect(page).toHaveURL(/.*features\/presets\/builder/);

    // Verify main components rendered
    const heroTitle = page.locator('.hero-title');
    await expect(heroTitle).toBeVisible();

    const dropzone = page.locator('.guideline-dropzone');
    await expect(dropzone).toBeVisible();

    const pasteToggle = page.locator('.toggle-paste-btn');
    await expect(pasteToggle).toBeVisible();
  });

  test('PB-002: Instruction sheet ingestion, OCR extraction, split-card review, human edit, and save to custom presets', async ({ page }) => {
    await page.goto('/features/presets/builder');
    await page.waitForLoadState('domcontentloaded');

    // 1. Upload Recruitment Guidelines
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(recruitmentPdfPath);

    // 2. Verify Split Card Review UI appears
    const splitGrid = page.locator('.split-review-grid');
    await expect(splitGrid).toBeVisible({ timeout: 15000 });

    const snippetCard = page.locator('.snippet-review-card');
    await expect(snippetCard).toBeVisible();

    const formCard = page.locator('.form-review-card');
    await expect(formCard).toBeVisible();

    // 3. Verify highlighted tokens in top snippet card
    const highlightTokens = snippetCard.locator('mark.highlight-token');
    await expect(highlightTokens.first()).toBeVisible();
    const tokenCount = await highlightTokens.count();
    expect(tokenCount).toBeGreaterThanOrEqual(2);

    // 4. Verify extracted specification bounds in bottom mobile form
    const widthInput = page.locator('input#dimWidth');
    const heightInput = page.locator('input#dimHeight');
    const minKbInput = page.locator('input#minKb');
    const maxKbInput = page.locator('input#maxKb');
    const profileNameInput = page.locator('input#profileName');

    await expect(widthInput).toHaveValue('200');
    await expect(heightInput).toHaveValue('230');
    await expect(minKbInput).toHaveValue('20');
    await expect(maxKbInput).toHaveValue('50');

    // Verify neutral naming (Photo 200x230px 20-50KB)
    const proposedName = await profileNameInput.inputValue();
    expect(proposedName).toContain('200x230px');
    expect(proposedName).toContain('50KB');

    // 5. Human Verification Step: Adjust Max KB input (e.g. change 50 to 100)
    await maxKbInput.fill('100');
    await maxKbInput.dispatchEvent('change');

    // Verify profile name dynamically updates with new verified number
    await expect(profileNameInput).toHaveValue(/100KB/);

    // 6. Click "Save Specification Profile"
    const saveButton = page.locator('.btn-save-profile');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // 7. Verify Success Confirmation Banner appears
    const successBanner = page.locator('.save-success-banner');
    await expect(successBanner).toBeVisible({ timeout: 10000 });
    await expect(successBanner).toContainText('100KB');

    // 8. Verify saved profile in Preferences (localStorage) under IFH_CUSTOM_PRESETS
    const storedJson = await page.evaluate(() =>
      localStorage.getItem('CapacitorStorage.IFH_CUSTOM_PRESETS') ||
      localStorage.getItem('IFH_CUSTOM_PRESETS')
    );
    expect(storedJson).not.toBeNull();
    const storedPresets = JSON.parse(storedJson!);
    expect(storedPresets.length).toBeGreaterThanOrEqual(1);

    const savedPreset = storedPresets.find((p: any) => p.name.includes('100KB'));
    expect(savedPreset).toBeDefined();
    expect(savedPreset.isCustom).toBe(true);
    expect(savedPreset.category).toBe('My Custom Presets');
    expect(savedPreset.photo.maxKb).toBe(100);
    expect(savedPreset.photo.minKb).toBe(20);
    expect(savedPreset.photo.width).toBe(200);
    expect(savedPreset.photo.height).toBe(230);
  });

  test('PB-003: Physical dimension extraction and real-time pixel conversion preview (35x45mm at 300 DPI)', async ({ page }) => {
    await page.goto('/features/presets/builder');
    await page.waitForLoadState('domcontentloaded');

    // Open paste text mode
    const pasteToggle = page.locator('.toggle-paste-btn');
    await pasteToggle.click();

    const textarea = page.locator('.paste-textarea');
    await expect(textarea).toBeVisible();

    // Paste passport guidelines with millimeter dimensions
    await textarea.fill('Photograph dimensions: 35 mm x 45 mm. File size not exceeding 50 KB. Aspect ratio: 3.5:4.5. Resolution: 300 DPI. Allowed format: JPEG.');

    const parseBtn = page.locator('.btn-parse-text');
    await parseBtn.click();

    // Verify split review card opens
    await expect(page.locator('.split-review-grid')).toBeVisible();

    const widthInput = page.locator('input#dimWidth');
    const heightInput = page.locator('input#dimHeight');
    const unitSelect = page.locator('select#dimUnit');

    await expect(widthInput).toHaveValue('35');
    await expect(heightInput).toHaveValue('45');
    await expect(unitSelect).toHaveValue('mm');

    // Verify pixel conversion hint is rendered in the form: ≈ 413 × 531 px (at 300 DPI)
    const hint = page.locator('.unit-conversion-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('413 × 531 px');
  });

  test('PB-004: Unparseable sheet error handling without hallucinated values', async ({ page }) => {
    await page.goto('/features/presets/builder');
    await page.waitForLoadState('domcontentloaded');

    // Upload unparseable general notice
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(unparseablePdfPath);

    // Verify error alert is displayed
    const errorAlert = page.locator('.error-alert-card');
    await expect(errorAlert).toBeVisible({ timeout: 15000 });
    await expect(errorAlert).toContainText(/Could not detect upload specifications/i);

    // Verify split card does NOT open and form is NOT hallucinated
    await expect(page.locator('.split-review-grid')).not.toBeVisible();
  });

  test('PB-005: Cybersecurity protection — Neutral naming enforcement and bounds validation', async ({ page }) => {
    await page.goto('/features/presets/builder');
    await page.waitForLoadState('domcontentloaded');

    // Paste sample guidelines
    const pasteToggle = page.locator('.toggle-paste-btn');
    await pasteToggle.click();

    const textarea = page.locator('.paste-textarea');
    await textarea.fill('File size 20KB-50KB, 200x230 pixels, JPEG format');
    await page.locator('.btn-parse-text').click();

    await expect(page.locator('.split-review-grid')).toBeVisible();

    // 1. Trademark / Government Infringement Test: user enters government exam name
    const profileNameInput = page.locator('input#profileName');
    await profileNameInput.fill('UPSC Civil Services Exam Photo 50KB');

    // 2. Click Save
    const saveButton = page.locator('.btn-save-profile');
    await saveButton.click();

    // Verify forbidden keywords were automatically stripped
    await expect(page.locator('.save-success-banner')).toBeVisible();
    const storedJson = await page.evaluate(() =>
      localStorage.getItem('CapacitorStorage.IFH_CUSTOM_PRESETS') ||
      localStorage.getItem('IFH_CUSTOM_PRESETS')
    );
    expect(storedJson).not.toBeNull();
    const storedPresets = JSON.parse(storedJson!);
    const lastSaved = storedPresets[storedPresets.length - 1];

    expect(lastSaved.name).not.toMatch(/upsc|exam/i);
  });
});
