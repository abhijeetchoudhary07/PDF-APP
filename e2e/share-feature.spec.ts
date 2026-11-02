import { test, expect } from '@playwright/test';
import { getTestDataPath } from './fixtures/mocks';

/**
 * E2E test suite for Share Functionality across Desktop and Mobile viewports,
 * validating real file sharing, Web Share API, Capacitor Native sharing, and Fallback modals.
 */

test.describe('Share Functionality E2E - Comprehensive Suite', () => {

  test('Desktop: Photo compression and share fallback modal with sanitized URLs', async ({ page }) => {
    // Setup mocks where Web Share is NOT supported (typical desktop browser)
    await page.addInitScript(() => {
      try {
        localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
        localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
      } catch (e) {}

      // Explicitly disable Web Share API to test Desktop fallback modal
      (navigator as any).canShare = undefined;
      (navigator as any).share = undefined;
    });

    await page.goto('/features/photo');

    // Upload test JPEG photo
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/portrait-person.png'));
    await expect(page.locator('.configuring-section')).toBeVisible({ timeout: 15000 });

    // Select 50 KB preset
    const preset50 = page.locator('.preset-chip', { hasText: '50 KB' });
    await preset50.click();

    // Trigger compression
    const compressBtn = page.locator('.btn-primary', { hasText: /Compress to/i });
    await compressBtn.click();

    // Verify Result Preview is shown
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 20000 });

    // Intercept window.open to verify no localhost URL is leaked in the message
    let openedUrl = '';
    await page.exposeFunction('mockWindowOpen', (url: string) => {
      openedUrl = url;
    });
    await page.evaluate(() => {
      window.open = (url?: string | URL) => {
        (window as any).mockWindowOpen(String(url));
        return null;
      };
    });

    // Locate and click the Share button inside app-result-preview
    const shareBtn = page.locator('app-result-preview app-button.secondary-share-btn button, app-result-preview button:has-text("Share")').first();
    await expect(shareBtn).toBeVisible({ timeout: 10000 });
    await shareBtn.click();

    // Modal dialog should appear on desktop when Web Share API is absent
    const modalDialog = page.locator('.modal-dialog');
    await expect(modalDialog).toBeVisible({ timeout: 10000 });

    // Check WhatsApp share button
    const whatsappBtn = page.locator('button.whatsapp-channel');
    await expect(whatsappBtn).toBeVisible();

    await whatsappBtn.click();
    await page.waitForTimeout(500);

    expect(openedUrl).toContain('whatsapp');
    expect(openedUrl).not.toContain('localhost');
    expect(openedUrl).not.toContain('127.0.0.1');
    expect(openedUrl).not.toContain('undefined');
  });

  test('Mobile: Photo tool shares binary File directly via Web Share API without localhost text', async ({ page }) => {
    // Inject spy on navigator.share and navigator.canShare
    await page.addInitScript(() => {
      try {
        localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
        localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
      } catch (e) {}

      (window as any).__shareCalls = [];

      (navigator as any).canShare = (data: any) => {
        return !!(data && data.files && data.files.length > 0);
      };

      (navigator as any).share = async (data: any) => {
        (window as any).__shareCalls.push({
          title: data.title,
          text: data.text,
          url: data.url,
          fileNames: data.files ? data.files.map((f: any) => f.name) : [],
          fileTypes: data.files ? data.files.map((f: any) => f.type) : [],
          fileSizes: data.files ? data.files.map((f: any) => f.size) : []
        });
        return Promise.resolve();
      };
    });

    await page.goto('/features/photo');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/portrait-person.png'));
    await expect(page.locator('.configuring-section')).toBeVisible({ timeout: 15000 });

    // Preset 20 KB
    await page.locator('.preset-chip', { hasText: '20 KB' }).click();
    await page.locator('.btn-primary', { hasText: /Compress to/i }).click();

    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 20000 });

    // Click Share button
    const shareBtn = page.locator('app-result-preview app-button.secondary-share-btn button, app-result-preview button:has-text("Share")').first();
    await expect(shareBtn).toBeVisible({ timeout: 10000 });
    await shareBtn.click();

    // Verify spy caught the share call
    const shareCalls = await page.evaluate(() => (window as any).__shareCalls);
    expect(shareCalls.length).toBeGreaterThanOrEqual(1);

    const call = shareCalls[0];
    // CRITICAL: Must share real file
    expect(call.fileNames.length).toBe(1);
    expect(call.fileNames[0]).toMatch(/\.(jpg|jpeg|png|webp)$/i);
    expect(call.fileSizes[0]).toBeGreaterThan(0);

    // CRITICAL FIX VERIFICATION: Must NOT contain text or url with localhost/message
    expect(call.text).toBeUndefined();
    expect(call.url).toBeUndefined();
  });

  test('PDF tool: Shares PDF document directly via Web Share API', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
        localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
      } catch (e) {}

      (window as any).__pdfShareCalls = [];

      (navigator as any).canShare = (data: any) => !!(data && data.files && data.files.length > 0);
      (navigator as any).share = async (data: any) => {
        (window as any).__pdfShareCalls.push({
          title: data.title,
          text: data.text,
          url: data.url,
          fileNames: data.files ? data.files.map((f: any) => f.name) : [],
          fileTypes: data.files ? data.files.map((f: any) => f.type) : [],
          fileSizes: data.files ? data.files.map((f: any) => f.size) : []
        });
        return Promise.resolve();
      };
    });

    await page.goto('/features/pdf');

    // Switch to 'Compress' tab
    const compressTab = page.getByRole('tab', { name: /Compress/i });
    await expect(compressTab).toBeVisible({ timeout: 10000 });
    await compressTab.click();
    await expect(compressTab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('pdf/text.pdf'));

    // Wait for PDF compression action button
    const compressBtn = page.locator('app-button', { hasText: /Compress/i }).first();
    await expect(compressBtn).toBeVisible({ timeout: 15000 });
    await compressBtn.click();

    // Wait for result preview Share button
    const shareBtn = page.locator('app-result-preview app-button.secondary-share-btn button, app-result-preview button:has-text("Share")').first();
    await expect(shareBtn).toBeVisible({ timeout: 25000 });
    await shareBtn.click();

    // Verify PDF file was shared
    const calls = await page.evaluate(() => (window as any).__pdfShareCalls);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].fileNames[0]).toMatch(/\.pdf$/i);
    expect(calls[0].fileTypes[0]).toBe('application/pdf');
    expect(calls[0].text).toBeUndefined();
    expect(calls[0].url).toBeUndefined();
  });

  test('User abort/cancel on native share dialog is handled gracefully without triggering download', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
        localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
      } catch (e) {}

      (navigator as any).canShare = () => true;
      (navigator as any).share = async () => {
        const abortErr = new Error('Share canceled');
        abortErr.name = 'AbortError';
        throw abortErr;
      };
    });

    await page.goto('/features/photo');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(getTestDataPath('photos/portrait-person.png'));
    await expect(page.locator('.configuring-section')).toBeVisible({ timeout: 15000 });

    await page.locator('.preset-chip', { hasText: '20 KB' }).click();
    await page.locator('.btn-primary', { hasText: /Compress to/i }).click();

    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 20000 });

    // Track any downloads
    let downloadTriggered = false;
    page.on('download', () => { downloadTriggered = true; });

    const shareBtn = page.locator('app-result-preview app-button.secondary-share-btn button, app-result-preview button:has-text("Share")').first();
    await expect(shareBtn).toBeVisible({ timeout: 10000 });
    await shareBtn.click();

    // Give it a brief moment to ensure no accidental download was triggered
    await page.waitForTimeout(1000);
    expect(downloadTriggered).toBe(false);

    // Verify modal dialog is not popped up on user cancellation
    const modal = page.locator('.modal-dialog');
    await expect(modal).not.toBeVisible();
  });
});
