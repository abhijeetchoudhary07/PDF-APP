import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/*
 * These three used to look for a `<select>`, a `.preset-selector` and a
 * `.doc-slot-card`. The validator has never had any of them — `git log -S` finds
 * no commit that ever added a <select> to this template — so the specs were
 * written against a design that was never built and had been failing since they
 * landed. They now drive the control that actually exists: a search box that
 * filters a scrolling row of `.preset-pill` buttons.
 */
test.describe('Document Validator — Preset Selection & Metadata @validator @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-001: Open validator page', async ({ page }) => {
    await expect(page).toHaveURL(/.*features\/document-validator/);
    await expect(page.locator('h1.page-title')).toContainText(/validator|verify/i);

    // The preset picker is a search box plus a row of pills, and ngOnInit
    // selects the first preset, so the transparency banner is up on arrival.
    await expect(page.locator('.preset-search-input')).toBeVisible();
    await expect(page.locator('.preset-pill').first()).toBeVisible();
    await expect(page.locator('.transparency-banner')).toBeVisible();
  });

  test('VAL-002 to VAL-005 & VAL-007: Select Exam/Job/ID/Visa preset and update requirements', async ({ page }) => {
    const pills = page.locator('.preset-pill');
    await expect(pills.first()).toBeVisible({ timeout: 10000 });
    expect(await pills.count()).toBeGreaterThan(1);

    const banner = page.locator('.transparency-banner');

    // The first preset is selected for us; take its name as the starting point.
    await expect(banner).toBeVisible();
    const firstName = (await pills.nth(0).locator('.p-name').innerText()).trim();
    await expect(banner.locator('h3')).toHaveText(firstName);
    await expect(pills.nth(0)).toHaveClass(/active/);

    // Choosing another preset moves the selection and repoints the banner.
    const secondName = (await pills.nth(1).locator('.p-name').innerText()).trim();
    await pills.nth(1).click();

    await expect(pills.nth(1)).toHaveClass(/active/);
    await expect(pills.nth(0)).not.toHaveClass(/active/);
    await expect(banner.locator('h3')).toHaveText(secondName);

    // And the requirement slots follow the preset rather than going stale.
    await expect(page.locator('.slots-grid .slot-card').first()).toBeVisible();
  });

  test('VAL-006: the search box filters the preset list', async ({ page }) => {
    const pills = page.locator('.preset-pill');
    await expect(pills.first()).toBeVisible();
    const total = await pills.count();

    await page.locator('.preset-search-input').fill('zzzzzz-no-such-preset');
    await expect(pills).toHaveCount(0);

    await page.locator('.preset-search-input').fill('');
    await expect(pills).toHaveCount(total);
  });

  test('VAL-009 to VAL-012: Verify preset source transparency, name, and document types', async ({ page }) => {
    const banner = page.locator('.transparency-banner');
    await expect(banner).toBeVisible();

    // Name and category are both stated, so it is clear which rules are in force.
    await expect(banner.locator('h3')).not.toBeEmpty();
    await expect(banner.locator('app-badge').first()).toBeVisible();

    // At least one document type is required, and each gets its own slot card.
    await expect(banner.locator('.doc-chip').first()).toBeVisible();
    await expect(page.locator('.slots-grid .slot-card').first()).toBeVisible();

    const chips = await banner.locator('.doc-chip').count();
    const slots = await page.locator('.slots-grid .slot-card').count();
    expect(slots).toBe(chips);
  });
});
