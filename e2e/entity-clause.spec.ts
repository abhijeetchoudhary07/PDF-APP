import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('P6 Entity & Clause Extraction with Page Anchors @entity-clause @p6', () => {
  const leasePdfPath = path.resolve(__dirname, 'test-data/entity-clause/commercial-lease.pdf');
  const serviceContractPdfPath = path.resolve(__dirname, 'test-data/entity-clause/service-contract.pdf');
  const vendorInvoicePdfPath = path.resolve(__dirname, 'test-data/entity-clause/vendor-invoice.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('P6-001: Strict Honesty Gate Disclaimer Persistence on Initial Load and Empty State', async ({ page }) => {
    await page.goto('/features/pdf/intelligence/entities');
    await page.waitForLoadState('domcontentloaded');

    // 1. App Header Title
    const headerTitle = page.locator('.header-title');
    await expect(headerTitle).toBeVisible();
    await expect(headerTitle).toContainText('Entity & Clause Extraction');

    // 2. Strict Honesty Gate Disclaimer Banner
    const disclaimerBanner = page.locator('.honesty-disclaimer-banner');
    await expect(disclaimerBanner).toBeVisible();
    await expect(disclaimerBanner).toHaveAttribute('role', 'alert');
    await expect(disclaimerBanner).toContainText(
      'Information extraction only. This tool finds text patterns and does not provide legal advice.'
    );

    // Verify banner has NO close/dismiss button (cannot be dismissed or hidden)
    const dismissBtn = disclaimerBanner.locator('button');
    await expect(dismissBtn).toHaveCount(0);

    // 3. Empty dropzone state
    const emptyCard = page.locator('.empty-card');
    await expect(emptyCard).toBeVisible();
    await expect(page.locator('.btn-primary-choose')).toBeVisible();
  });

  test('P6-002: Document Ingestion, Multi-page Navigation, Tab Filtering, Clickable Anchors, and CSV/JSON Export', async ({ page }) => {
    await page.goto('/features/pdf/intelligence/entities');
    await page.waitForLoadState('domcontentloaded');

    // 1. Upload Commercial Lease PDF fixture (2 pages)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(leasePdfPath);

    // Wait for document canvas and bottom sheet drawer
    const canvas = page.locator('.doc-canvas');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    const bottomSheet = page.locator('.bottom-sheet-drawer');
    await expect(bottomSheet).toBeVisible();

    // Verify multi-page navigator shows Page 1 of 2
    const pageInfo = page.locator('.page-info');
    await expect(pageInfo).toBeVisible();
    await expect(pageInfo).toContainText('Page 1 of 2');

    // 2. Verify Segmented Tabs & Summary Badges
    const tabAmounts = page.locator('.segmented-tabs .tab-btn').nth(0);
    const tabDates = page.locator('.segmented-tabs .tab-btn').nth(1);
    const tabParties = page.locator('.segmented-tabs .tab-btn').nth(2);
    const tabClauses = page.locator('.segmented-tabs .tab-btn').nth(3);

    await expect(tabAmounts).toBeVisible();
    await expect(tabAmounts).toHaveClass(/active/);
    const amountsCount = await tabAmounts.locator('.tab-count').textContent();
    expect(parseInt(amountsCount || '0', 10)).toBeGreaterThanOrEqual(2);

    // 3. Switch to [Dates & Deadlines] tab
    await tabDates.click();
    await expect(tabDates).toHaveClass(/active/);
    const dateCards = page.locator('.item-card');
    await expect(dateCards.first()).toBeVisible();

    // 4. Switch to [Parties] tab
    await tabParties.click();
    await expect(tabParties).toHaveClass(/active/);
    const partyCards = page.locator('.item-card');
    await expect(partyCards.first()).toBeVisible();
    const partyText = await partyCards.first().locator('.item-text-passage').textContent();
    expect(partyText).toMatch(/Prime Properties|Metro Retail/);

    // 5. Switch to [Clauses] tab
    await tabClauses.click();
    await expect(tabClauses).toHaveClass(/active/);
    const clauseCards = page.locator('.item-card');
    await expect(clauseCards.first()).toBeVisible();

    // 6. Clickable Anchor Jump: Tap a clause located on Page 2
    // Search for a card containing "late penalty" or "notice period"
    const latePenaltyCard = page.locator('.item-card', { hasText: 'late penalty' }).first();
    await expect(latePenaltyCard).toBeVisible();
    await latePenaltyCard.click();

    // Verify auto page navigation to Page 2
    await expect(pageInfo).toContainText('Page 2 of 2');

    // Verify highlighted bounding box on canvas
    const selectedBox = page.locator('.bounding-box-anchor.is-selected');
    await expect(selectedBox).toBeVisible({ timeout: 5000 });

    // Verify canvas detail popover is rendered
    const popover = page.locator('.item-popover');
    await expect(popover).toBeVisible();
    await expect(popover.locator('.popover-badge')).toContainText('Penalties');

    // Close detail popover
    await page.locator('.btn-close-popover').click();
    await expect(popover).not.toBeVisible();

    // 7. Zoom Controls
    const zoomBadge = page.locator('.zoom-badge');
    await expect(zoomBadge).toContainText('100%');

    const zoomInBtn = page.locator('.btn-zoom[title*="Zoom In"]');
    await zoomInBtn.click();
    await expect(zoomBadge).toContainText('125%');

    const resetZoomBtn = page.locator('.btn-zoom[title*="Reset"]');
    await resetZoomBtn.click();
    await expect(zoomBadge).toContainText('100%');

    // 8. Export Modal & Actions
    const exportBtn = page.locator('.btn-primary-export');
    await exportBtn.click();

    const exportModal = page.locator('.export-modal-card');
    await expect(exportModal).toBeVisible();

    // Verify Modal Honesty Disclaimer
    const modalDisclaimer = page.locator('.modal-disclaimer');
    await expect(modalDisclaimer).toBeVisible();
    await expect(modalDisclaimer).toContainText(
      'Information extraction only. This tool finds text patterns and does not provide legal advice.'
    );

    // Trigger CSV Export
    const exportCsvBtn = page.locator('.export-option-btn').nth(0);
    await exportCsvBtn.click();

    // Verify Success Toast
    const toast = page.locator('.toast-notification');
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast).toContainText('Exported');
    await expect(toast).toContainText('.csv');

    // Trigger JSON Export
    await exportBtn.click();
    await expect(exportModal).toBeVisible();
    const exportJsonBtn = page.locator('.export-option-btn').nth(1);
    await exportJsonBtn.click();

    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast).toContainText('Exported');
    await expect(toast).toContainText('.json');
  });

  test('P6-003: Real Test Data — Vendor Invoice & GST/Tax ID Extraction', async ({ page }) => {
    await page.goto('/features/pdf/intelligence/entities');
    await page.waitForLoadState('domcontentloaded');

    // Upload Vendor Invoice
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(vendorInvoicePdfPath);

    const canvas = page.locator('.doc-canvas');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Verify extracted amounts tab has invoice numbers
    const tabAmounts = page.locator('.segmented-tabs .tab-btn').nth(0);
    await tabAmounts.click();

    const amountCards = page.locator('.item-card');
    await expect(amountCards.first()).toBeVisible();
    const allAmountsText = await page.locator('.sheet-scroll-content').textContent();
    expect(allAmountsText).toContain('1,475.00');

    // Switch to [Clauses] tab
    const tabClauses = page.locator('.segmented-tabs .tab-btn').nth(3);
    await tabClauses.click();
    await expect(tabClauses).toHaveClass(/active/);

    await expect(page.locator('.sheet-scroll-content')).toContainText('penalty fee');
  });
});
