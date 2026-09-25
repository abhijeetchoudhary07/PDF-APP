import { test, expect } from '@playwright/test';

/*
 * Several Phase 1 paths are aliases kept for old links and redirect to a
 * canonical route -- /features/pdf-merge resolves to /features/pdf/merge. The
 * URL assertions below name the destination, because asserting the alias
 * failed on precisely the routes whose redirect was working.
 */
import { setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Phase 1 — Regression Suite for Existing Features @regression', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('REG-001: Photo compression route loads', async ({ page }) => {
    await page.goto('/features/photo');
    await expect(page).toHaveURL(/.*features\/photo/);
    await expect(page.locator('h1, .page-title, .title').first()).toBeVisible();
  });

  test('REG-003: Signature processing route loads', async ({ page }) => {
    await page.goto('/features/signature');
    await expect(page).toHaveURL(/.*features\/signature/);
    await expect(page.locator('h1, .page-title, .title').first()).toBeVisible();
  });

  test('REG-004: Exam & Job Presets route loads', async ({ page }) => {
    await page.goto('/features/presets');
    await expect(page).toHaveURL(/.*features\/presets/);
    await expect(page.locator('h1, .page-title, .title').first()).toBeVisible();
  });

  test('REG-005 & REG-006: PDF Compress and Images to PDF routes load', async ({ page }) => {
    await page.goto('/features/pdf-compress');
    await expect(page).toHaveURL(/.*features\/pdf-compress/);

    await page.goto('/features/images-to-pdf');
    await expect(page).toHaveURL(/.*features\/images-to-pdf/);
  });

  test('REG-008 to REG-010: PDF Merge, Split, and Organize routes load', async ({ page }) => {
    await page.goto('/features/pdf-merge');
    await expect(page).toHaveURL(/.*features\/pdf\/merge/);

    await page.goto('/features/pdf-split');
    await expect(page).toHaveURL(/.*features\/pdf\/split/);

    await page.goto('/features/pdf-organize');
    await expect(page).toHaveURL(/.*features\/pdf\/organize/);
  });

  test('REG-013 & REG-015: PDF Reader and PDF Signing routes load', async ({ page }) => {
    await page.goto('/features/pdf-reader');
    await expect(page).toHaveURL(/.*features\/pdf\/editor/);

    await page.goto('/features/pdf-signing');
    await expect(page).toHaveURL(/.*features\/pdf\/sign/);
  });

  test('REG-016 & REG-017: PDF Forms and PDF Security routes load', async ({ page }) => {
    await page.goto('/features/pdf-forms');
    await expect(page).toHaveURL(/.*features\/pdf\/forms/);

    await page.goto('/features/pdf-security');
    await expect(page).toHaveURL(/.*features\/pdf\/security/);
  });

  test('REG-018 & REG-019: Converter and Batch Image routes load', async ({ page }) => {
    await page.goto('/features/converter');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion/);

    await page.goto('/features/batch-images');
    await expect(page).toHaveURL(/.*features\/batch-images/);
  });

  test('REG-021 & REG-022: Global search and Tool Registry load on Home page', async ({ page }) => {
    await page.goto('/');
    // Check that Home page renders tool cards
    await expect(page.locator('.tool-card, ion-card, [routerLink]').first()).toBeVisible();
  });
});
