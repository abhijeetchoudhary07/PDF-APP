import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('Q2: Profile Export & Import as JSON (/features/presets/manage) @profile-transfer @q2', () => {
  const validProfilePath = path.resolve(__dirname, 'test-data/presets/valid-profile-v1.json');
  const malformedBracketPath = path.resolve(__dirname, 'test-data/presets/malformed-bracket.json');
  const missingMaxKbPath = path.resolve(__dirname, 'test-data/presets/missing-maxkb.json');
  const unsupportedVersionPath = path.resolve(__dirname, 'test-data/presets/unsupported-version-v2.json');
  const prototypePollutionPath = path.resolve(__dirname, 'test-data/presets/prototype-pollution.json');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('PT-001: Navigation and Route Accessibility — direct URL and alias redirects', async ({ page }) => {
    // 1. Test alias redirect from /features/presets-manage
    await page.goto('/features/presets-manage');
    await expect(page).toHaveURL(/.*features\/presets\/manage/);

    // Verify main components rendered
    const heroTitle = page.locator('.hero-title');
    await expect(heroTitle).toBeVisible();

    const savedProfilesSection = page.locator('.saved-profiles-section');
    await expect(savedProfilesSection).toBeVisible();

    const importDropzone = page.locator('.profile-dropzone');
    await expect(importDropzone).toBeVisible();

    const pasteToggle = page.locator('.toggle-paste-btn');
    await expect(pasteToggle).toBeVisible();

    // 2. Test alias redirect from /presets/manage
    await page.goto('/presets/manage');
    await expect(page).toHaveURL(/.*features\/presets\/manage/);
  });

  test('PT-002: Export Profile — existing custom profile serialized to JSON and share/download triggered', async ({ page }) => {
    // Seed initial custom preset into localStorage
    await page.addInitScript(() => {
      const initialPresets = [
        {
          id: 'custom-spec-export-seed',
          name: 'Photo 35x45mm 50KB',
          category: 'My Custom Presets',
          isCustom: true,
          photo: {
            minKb: 20,
            maxKb: 50,
            width: 35,
            height: 45,
            unit: 'mm',
            widthPx: 413,
            heightPx: 531,
            format: 'JPEG',
            dpi: 300
          },
          createdAt: 1700000000000
        }
      ];
      localStorage.setItem('CapacitorStorage.IFH_CUSTOM_PRESETS', JSON.stringify(initialPresets));
      localStorage.setItem('IFH_CUSTOM_PRESETS', JSON.stringify(initialPresets));
    });

    await page.goto('/features/presets/manage');
    await page.waitForLoadState('domcontentloaded');

    // Verify profile card exists
    const profileCard = page.locator('.profile-card').filter({ hasText: 'Photo 35x45mm 50KB' });
    await expect(profileCard).toBeVisible();

    // Verify specification chips
    await expect(profileCard.locator('.chip-dim')).toContainText('35 × 45 mm');
    await expect(profileCard.locator('.chip-size')).toContainText('20 – 50 KB');
    await expect(profileCard.locator('.chip-format')).toContainText('JPEG');
    await expect(profileCard.locator('.chip-dpi')).toContainText('300 DPI');

    // Share button click triggers JSON file download in browser
    const shareBtn = profileCard.locator('.btn-share');
    await expect(shareBtn).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await shareBtn.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.json');
    expect(download.suggestedFilename()).toContain('photo_35x45mm_50kb');
  });

  test('PT-003: Import Profile — valid JSON file upload, preview modal inspection, and successful import', async ({ page }) => {
    // Clear custom presets
    await page.addInitScript(() => {
      localStorage.removeItem('CapacitorStorage.IFH_CUSTOM_PRESETS');
      localStorage.removeItem('IFH_CUSTOM_PRESETS');
    });

    await page.goto('/features/presets/manage');
    await page.waitForLoadState('domcontentloaded');

    // 1. Drop valid-profile-v1.json
    const fileInput = page.locator('.profile-dropzone input[type="file"]');
    await fileInput.setInputFiles(validProfilePath);

    // 2. Verify Preview Modal opens
    const previewModal = page.locator('.preview-modal-body');
    await expect(previewModal).toBeVisible({ timeout: 10000 });

    const previewProfileName = page.locator('.preview-profile-name');
    await expect(previewProfileName).toHaveText('Photo 35x45mm 50KB');

    // Verify parsed spec values in table
    const specTable = page.locator('.spec-table');
    await expect(specTable).toContainText('35 × 45 mm');
    await expect(specTable).toContainText('20 – 50 KB');
    await expect(specTable).toContainText('JPEG');
    await expect(specTable).toContainText('300 DPI');

    // 3. Click "Import Profile"
    const confirmImportBtn = page.locator('.btn-confirm-import').filter({ hasText: 'Import Profile' });
    await expect(confirmImportBtn).toBeVisible();
    await confirmImportBtn.click();

    // 4. Verify modal is closed
    await expect(previewModal).toBeHidden({ timeout: 5000 });

    // 5. Verify profile appears in the saved list
    const importedCard = page.locator('.profile-card').filter({ hasText: 'Photo 35x45mm 50KB' });
    await expect(importedCard).toBeVisible();

    // 6. Verify storage has the profile
    const storedJson = await page.evaluate(() =>
      localStorage.getItem('CapacitorStorage.IFH_CUSTOM_PRESETS') ||
      localStorage.getItem('IFH_CUSTOM_PRESETS')
    );
    expect(storedJson).not.toBeNull();
    const presets = JSON.parse(storedJson!);
    const imported = presets.find((p: any) => p.name === 'Photo 35x45mm 50KB');
    expect(imported).toBeDefined();
    expect(imported.photo.maxKb).toBe(50);
    expect(imported.photo.minKb).toBe(20);
    expect(imported.photo.width).toBe(35);
    expect(imported.photo.height).toBe(45);
    expect(imported.photo.unit).toBe('mm');
  });

  test('PT-004: Safe Merge & Duplicate Conflict Resolution — Overwrite vs Save as Copy', async ({ page }) => {
    // Start with preset already existing
    await page.addInitScript(() => {
      const existing = [
        {
          id: 'custom-spec-photo-test',
          name: 'Photo 35x45mm 50KB',
          category: 'My Custom Presets',
          isCustom: true,
          photo: {
            minKb: 20,
            maxKb: 50,
            width: 35,
            height: 45,
            unit: 'mm',
            format: 'JPEG'
          },
          createdAt: 1700000000000
        }
      ];
      localStorage.setItem('CapacitorStorage.IFH_CUSTOM_PRESETS', JSON.stringify(existing));
      localStorage.setItem('IFH_CUSTOM_PRESETS', JSON.stringify(existing));
    });

    await page.goto('/features/presets/manage');
    await page.waitForLoadState('domcontentloaded');

    // Drop valid-profile-v1.json again (duplicate ID & Name)
    const fileInput = page.locator('.profile-dropzone input[type="file"]');
    await fileInput.setInputFiles(validProfilePath);

    // Verify duplicate warning box appears
    const duplicateBox = page.locator('.duplicate-warning-box');
    await expect(duplicateBox).toBeVisible({ timeout: 10000 });
    await expect(duplicateBox).toContainText('Profile Already Exists');

    // Verify both "Overwrite Existing" and "Save as New Copy" buttons are present
    const overwriteBtn = page.locator('.btn-confirm-import.overwrite');
    const saveCopyBtn = page.locator('.btn-confirm-import.save-copy');
    await expect(overwriteBtn).toBeVisible();
    await expect(saveCopyBtn).toBeVisible();

    // Click "Save as New Copy"
    await saveCopyBtn.click();

    // Verify list now has 2 profiles: original and copy
    const cards = page.locator('.profile-card');
    await expect(cards).toHaveCount(2, { timeout: 5000 });

    const copyCard = page.locator('.profile-card').filter({ hasText: 'Photo 35x45mm 50KB (Copy)' });
    await expect(copyCard).toBeVisible();
  });

  test('PT-005: Validation and Error Handling on Malformed JSON, Missing Fields, and Unknown Versions', async ({ page }) => {
    await page.goto('/features/presets/manage');
    await page.waitForLoadState('domcontentloaded');

    const fileInput = page.locator('.profile-dropzone input[type="file"]');
    const errCard = page.locator('.validation-error-card');

    // 1. Malformed JSON (syntax error / missing bracket)
    await fileInput.setInputFiles(malformedBracketPath);
    await expect(errCard).toBeVisible({ timeout: 5000 });
    await expect(errCard).toContainText('Malformed JSON');

    // Dismiss error
    await page.locator('.btn-dismiss-err').click();
    await expect(errCard).toBeHidden();

    // 2. Missing required field maxKb
    await fileInput.setInputFiles(missingMaxKbPath);
    await expect(errCard).toBeVisible({ timeout: 5000 });
    await expect(errCard).toContainText("Field 'photo.maxKb' is required");

    await page.locator('.btn-dismiss-err').click();
    await expect(errCard).toBeHidden();

    // 3. Unsupported version v2.0
    await fileInput.setInputFiles(unsupportedVersionPath);
    await expect(errCard).toBeVisible({ timeout: 5000 });
    await expect(errCard).toContainText("Unsupported profile version '2.0'");
  });

  test('PT-006: Cybersecurity Stress-Testing — Prototype Pollution and Script Injection', async ({ page }) => {
    await page.goto('/features/presets/manage');
    await page.waitForLoadState('domcontentloaded');

    const fileInput = page.locator('.profile-dropzone input[type="file"]');
    const errCard = page.locator('.validation-error-card');

    // 1. Prototype Pollution Attempt
    await fileInput.setInputFiles(prototypePollutionPath);
    await expect(errCard).toBeVisible({ timeout: 5000 });
    await expect(errCard).toContainText('Security violation: Prototype pollution attempt detected');

    // Verify Object.prototype is unpolluted in the browser runtime
    const isPolluted = await page.evaluate(() => {
      return (Object.prototype as any).isAdmin === true;
    });
    expect(isPolluted).toBe(false);

    // 2. Script Injection / XSS in Paste Input
    const pasteToggle = page.locator('.toggle-paste-btn');
    await pasteToggle.click();

    const pasteArea = page.locator('.paste-textarea');
    await expect(pasteArea).toBeVisible();

    const xssJson = JSON.stringify({
      version: '1.0',
      id: 'xss-clean-test',
      name: 'Safe Name <script>alert("hacked")</script>',
      category: 'Custom <img src="x" onerror="evil()"> Presets',
      photo: {
        maxKb: 50,
        format: 'JPEG<script>bad()</script>'
      }
    });

    await pasteArea.fill(xssJson);
    await page.locator('.btn-validate-paste').click();

    // Preview modal opens with sanitized strings (no script execution)
    const previewName = page.locator('.preview-profile-name');
    await expect(previewName).toBeVisible({ timeout: 5000 });
    const nameText = await previewName.textContent();
    expect(nameText).not.toContain('<script>');
    expect(nameText).toContain('Safe Name');

    // Import the sanitized profile
    await page.locator('.btn-confirm-import').click();
    await expect(page.locator('.profile-card').filter({ hasText: 'Safe Name' })).toBeVisible();
  });
});
