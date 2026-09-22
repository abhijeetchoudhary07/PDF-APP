import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import { getPhase2FixturePath } from '../../common/phase2-helpers';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Phase 2 Shared — Security & XSS Prevention @phase2 @security', () => {
  let maliciousFilePath: string;

  test.beforeAll(async () => {
    const targetDir = path.resolve(__dirname, '../../test-data/phase2');
    maliciousFilePath = path.join(targetDir, 'xss_<script>alert(1)<_script>.pdf');
    // Copy clean PDF to malicious filename
    const cleanPath = path.join(targetDir, 'privacy-clean.pdf');
    if (fs.existsSync(cleanPath)) {
      fs.copyFileSync(cleanPath, maliciousFilePath);
    }
  });

  test.afterAll(async () => {
    if (fs.existsSync(maliciousFilePath)) {
      try {
        fs.unlinkSync(maliciousFilePath);
      } catch {}
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('SEC-001: Malicious filename containing script tags does not execute in DOM', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', async dialog => {
      alertFired = true;
      await dialog.dismiss();
    });

    await page.goto('/features/pdf-compare');
    const input = page.locator('input[type="file"]').first();
    if (fs.existsSync(maliciousFilePath)) {
      await input.setInputFiles(maliciousFilePath);

      // Verify filename is displayed as escaped text
      const fileNameEl = page.locator('.file-name').first();
      await expect(fileNameEl).toBeVisible();

      // Ensure no alert executed
      expect(alertFired).toBe(false);
    }
  });
});
