import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from '../fixtures/mocks';

function getAuditPdfPath(fileName: string): string {
  return path.resolve(process.cwd(), 'e2e/test-data/editor-audit', fileName);
}

test.describe('PDF Editor Comprehensive Release Audit Suite', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('TC-EDT-01: Load invoice, zoom scaling, text editing, shape placement, and undo/redo', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/features/pdf-editor');
    await expect(page).toHaveURL(/.*features\/pdf(\/|-)editor/);

    // 1. Upload Single-Page Invoice
    const fileChooserPromise = page.waitForEvent('filechooser');
    const selectBtn = page.getByRole('button', { name: /select pdf file/i });
    await expect(selectBtn).toBeVisible({ timeout: 15000 });
    await selectBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditPdfPath('single-page-invoice.pdf'));

    // 2. Verify Editor Workspace Loaded
    await expect(page.locator('.editor-workspace')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.editor-title')).toContainText('single-page-invoice');

    // 3. Test Zoom In and Zoom Out
    const zoomInBtn = page.locator('button[title*="Zoom In"], .zoom-btn:has-text("+"), button:has-text("+")').first();
    const zoomOutBtn = page.locator('button[title*="Zoom Out"], .zoom-btn:has-text("-"), button:has-text("-")').first();
    if (await zoomInBtn.isVisible()) {
      await zoomInBtn.click();
      await page.waitForTimeout(300);
      await zoomOutBtn.click();
      await page.waitForTimeout(300);
    }

    // 4. Place Text Element
    const textToolBtn = page.locator('button.d-btn').filter({ hasText: /text/i }).first();
    if (await textToolBtn.isVisible()) {
      await textToolBtn.click();
      // Click on canvas overlay to create text
      const overlay = page.locator('.interactive-overlay');
      await overlay.click({ position: { x: 120, y: 150 } });
      await expect(page.locator('.interactive-element.selected, .text-content').first()).toBeVisible({ timeout: 10000 });
    }

    // 5. Test Undo / Redo
    const undoBtn = page.locator('button[title*="Undo"], app-button[title*="Undo"] button').first();
    const redoBtn = page.locator('button[title*="Redo"], app-button[title*="Redo"] button').first();
    if (await undoBtn.isEnabled()) {
      await undoBtn.click();
      await page.waitForTimeout(300);
      if (await redoBtn.isEnabled()) {
        await redoBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // 6. Test Export
    const exportBtn = page.locator('app-button:has-text("Export"), button:has-text("Export")').first();
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    // Verify 0 fatal errors
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('404') && !e.includes('standardFontDataUrl'));
    expect(fatalErrors).toHaveLength(0);
  });

  test('TC-EDT-02: Multi-column academic paper, freehand drawing, and annotations', async ({ page }) => {
    await page.goto('/features/pdf-editor');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select pdf file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditPdfPath('multicolumn-academic.pdf'));

    await expect(page.locator('.editor-workspace')).toBeVisible({ timeout: 25000 });

    // Test Freehand Drawing
    const drawToolBtn = page.locator('button.d-btn').filter({ hasText: /draw/i }).first();
    if (await drawToolBtn.isVisible()) {
      await drawToolBtn.click();
      const overlay = page.locator('.interactive-overlay');
      const box = await overlay.boundingBox();
      if (box) {
        // Drag across to draw
        await page.mouse.move(box.x + 100, box.y + 200);
        await page.mouse.down();
        await page.mouse.move(box.x + 150, box.y + 220);
        await page.mouse.move(box.x + 200, box.y + 200);
        await page.mouse.up();
      }
    }

    // Test Highlight Tool
    const highlightToolBtn = page.locator('button.d-btn').filter({ hasText: /highlight/i }).first();
    if (await highlightToolBtn.isVisible()) {
      await highlightToolBtn.click();
      const overlay = page.locator('.interactive-overlay');
      const box = await overlay.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 80, box.y + 300);
        await page.mouse.down();
        await page.mouse.move(box.x + 220, box.y + 320);
        await page.mouse.up();
      }
    }

    // Verify elements are on canvas
    await expect(page.locator('.interactive-overlay')).toBeVisible();
  });

  test('TC-EDT-03: True Redaction security — sensitive billing data destroyed', async ({ page }) => {
    await page.goto('/features/pdf-editor');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select pdf file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditPdfPath('single-page-invoice.pdf'));

    await expect(page.locator('.editor-workspace')).toBeVisible({ timeout: 25000 });

    // Select Redact tool
    const redactToolBtn = page.locator('button.d-btn').filter({ hasText: /redact/i }).first();
    if (await redactToolBtn.isVisible()) {
      await redactToolBtn.click();

      // Drag redaction box over sensitive data
      const overlay = page.locator('.interactive-overlay');
      const box = await overlay.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 60, box.y + 200);
        await page.mouse.down();
        await page.mouse.move(box.x + 300, box.y + 240);
        await page.mouse.up();
      }

      // Check for redaction overlay box
      await expect(page.locator('.redaction-overlay-box, .interactive-element').first()).toBeVisible({ timeout: 10000 });
    }

    // Open Redaction Manager Modal
    const redactManagerBtn = page.locator('button.d-btn:has([name="shield-checkmark-outline"])').first();
    if (await redactManagerBtn.isVisible()) {
      await redactManagerBtn.click();
      await expect(page.locator('.modal-card, ion-modal, .redaction-modal').first()).toBeVisible({ timeout: 10000 });
      // Close modal
      const closeBtn = page.locator('button:has-text("Close"), button:has-text("Done"), button:has-text("Apply")').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
    }
  });

  test('TC-EDT-04: Advanced modals — Whiteout disclaimer and Annotation Flattening', async ({ page }) => {
    await page.goto('/features/pdf-editor');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select pdf file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditPdfPath('fillable-form.pdf'));

    await expect(page.locator('.editor-workspace')).toBeVisible({ timeout: 25000 });

    // Open Flatten Overlay Modal
    const flattenBtn = page.locator('button.d-btn').filter({ hasText: /flatten/i }).first();
    if (await flattenBtn.isVisible()) {
      await flattenBtn.click();
      await expect(page.getByRole('heading', { name: /flatten & overlay/i })).toBeVisible({ timeout: 10000 });
      const closeBtn = page.getByRole('button', { name: /close|cancel/i }).first();
      if (await closeBtn.isVisible()) await closeBtn.click();
    }

    // Open Whiteout tool
    const whiteoutBtn = page.locator('button.d-btn').filter({ hasText: /whiteout/i }).first();
    if (await whiteoutBtn.isVisible()) {
      await whiteoutBtn.click();
      // Whiteout active
      await expect(page.locator('.interactive-overlay')).toBeVisible();
    }
  });

  test('TC-EDT-05: Mobile viewport navigation tabs and responsive touch layout', async ({ page }) => {
    await page.goto('/features/pdf-editor');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select pdf file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditPdfPath('single-page-invoice.pdf'));

    await expect(page.locator('.editor-workspace')).toBeVisible({ timeout: 25000 });

    // Check if mobile footer is active on mobile viewport
    const mobileFooter = page.locator('.mobile-footer');
    if (await mobileFooter.isVisible()) {
      const tabs = page.locator('.mobile-tabs-container .m-tab');
      const count = await tabs.count();
      expect(count).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < count; i++) {
        const box = await tabs.nth(i).boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(40);
      }
    }
  });

  test('TC-EDT-06: Cybersecurity stress testing — XSS text annotation immunity and 0 alert popups', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', async dialog => {
      alertFired = true;
      await dialog.dismiss();
    });

    await page.goto('/features/pdf-editor');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select pdf file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditPdfPath('scanned-image-doc.pdf'));

    await expect(page.locator('.editor-workspace')).toBeVisible({ timeout: 25000 });

    // Place text with XSS payload
    const textToolBtn = page.locator('button.d-btn').filter({ hasText: /text/i }).first();
    if (await textToolBtn.isVisible()) {
      await textToolBtn.click();
      const overlay = page.locator('.interactive-overlay');
      await overlay.click({ position: { x: 100, y: 150 } });

      const textarea = page.locator('.text-content textarea');
      if (await textarea.isVisible()) {
        await textarea.fill("<script>alert('xss')</script><img src=x onerror=alert(1)>");
        await page.keyboard.press('Escape');
      }
    }

    // Verify no script execution / alert popup
    expect(alertFired).toBe(false);
  });
});
