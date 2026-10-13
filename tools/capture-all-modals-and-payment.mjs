import { chromium } from 'playwright';
import path from 'path';

const outDir = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/351d79d9-cb6e-4dd8-86e0-4c5cd51e6f05/screenshots';
const samplePdf = path.resolve('e2e/test-data/pdf/text.pdf');

const demoSession = {
  accessToken: 'demo-token-123',
  refreshToken: 'demo-refresh-123',
  syncedAt: Date.now(),
  user: {
    id: 'usr_test_123',
    email: 'student@example.com',
    displayName: 'Student Demo',
    authProvider: 'email',
    isActive: true,
    isVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  },
  entitlement: {
    isPremium: false,
    planId: 'free',
    status: 'expired',
    validUntil: null,
    platform: null,
    daysRemaining: null,
  },
};

async function setupPage(context, withAuth = false) {
  const page = await context.newPage();
  await page.addInitScript(({ auth, sess }) => {
    localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
    localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
    if (auth) {
      localStorage.setItem('CapacitorStorage.IFH_PDF_ACCOUNT_SESSION_V1', JSON.stringify(sess));
    }
  }, { auth: withAuth, sess: demoSession });
  return page;
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // 1. Mobile: Onboarding Modal
  console.log('1. Onboarding Modal Mobile...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.onboarding-dialog', { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '01-onboarding-modal-mobile.png'), fullPage: false });
    await context.close();
  }

  // 2. Mobile: Presets Modal
  console.log('2. Presets Modal Mobile...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await setupPage(context);
    await page.goto('http://localhost:4173/features/presets', { waitUntil: 'networkidle' });
    const createBtn = page.locator('app-page-header app-button button, button:has-text("Custom Preset")').first();
    await createBtn.waitFor({ state: 'visible', timeout: 8000 });
    await createBtn.click();
    await page.waitForSelector('.modal-dialog', { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '02-presets-modal-mobile.png'), fullPage: false });
    await context.close();
  }

  // 3. Mobile: Local Data Confirmation Modal
  console.log('3. Local Data Confirmation Modal Mobile...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await setupPage(context);
    await page.goto('http://localhost:4173/features/local-data-storage', { waitUntil: 'networkidle' });
    const factoryResetBtn = page.locator('button:has-text("Factory Reset")').first();
    await factoryResetBtn.scrollIntoViewIfNeeded();
    await factoryResetBtn.click();
    await page.waitForSelector('.modal-backdrop .modal-dialog', { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '03-local-data-modal-mobile.png'), fullPage: false });
    await context.close();
  }

  // 4. Mobile: Global Search Modal
  console.log('4. Global Search Modal Mobile...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await setupPage(context);
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.search-dialog', { timeout: 8000 });
    const input = page.locator('.search-modal-input');
    await input.fill('compress');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '04-global-search-mobile.png'), fullPage: false });
    await context.close();
  }

  // 5. Mobile: Signature Drawing Modal
  console.log('5. Signature Creation Modal Mobile...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await setupPage(context);
    await page.goto('http://localhost:4173/features/pdf-sign', { waitUntil: 'networkidle' });
    
    // Upload sample PDF
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('button:has-text("Select PDF to Sign")').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(samplePdf);
    
    // Wait for PDF sign workspace
    await page.waitForSelector('.sign-workspace', { timeout: 8000 });
    const addSigBtn = page.locator('button:has-text("+ Signature")').first();
    await addSigBtn.click();
    await page.waitForSelector('.modal-dialog', { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '05-signature-dialog-mobile.png'), fullPage: false });
    await context.close();
  }

  // 6. Mobile: Add Recipient Modal
  console.log('6. Add Recipient Modal Mobile...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await setupPage(context);
    await page.goto('http://localhost:4173/features/pdf/signature-request', { waitUntil: 'networkidle' });
    
    // Upload sample PDF
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('button:has-text("Select PDF Document")').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(samplePdf);
    
    // Wait for request workspace
    await page.waitForSelector('.request-workspace', { timeout: 8000 });
    const addRecipientBtn = page.locator('button:has-text("+ Add Recipient")').first();
    await addRecipientBtn.click();
    await page.waitForSelector('.modal-dialog', { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '06-add-recipient-modal-mobile.png'), fullPage: false });
    await context.close();
  }

  // 7. Mobile: Payment Journey Step 1 - Plan Cards
  console.log('7. Payment Journey Step 1 (Plans Mobile)...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await setupPage(context, true);
    await page.goto('http://localhost:4173/features/premium', { waitUntil: 'networkidle' });
    await page.waitForSelector('.pricing-card', { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '07-payment-journey-plans-mobile.png'), fullPage: false });

    // 8. Mobile: Payment Journey Step 2 - Pay Panel with yugxor@axl & QR Code
    console.log('8. Payment Journey Step 2 (Pay Panel with yugxor@axl & QR Code Mobile)...');
    const chooseBtn = page.locator('[data-testid="choose-pro_monthly"], button:has-text("Pay ₹49")').first();
    await chooseBtn.click();
    await page.waitForSelector('.pay-panel', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, '08-payment-journey-pay-panel-mobile.png'), fullPage: false });

    // 9. Mobile: Payment Journey Step 3 - Reference Number & Submit
    console.log('9. Payment Journey Step 3 (Reference Number Form Mobile)...');
    const utrInput = page.locator('#utrNumber, input[name="utrNumber"], input[placeholder*="12-digit"], input[placeholder*="412345678901"]').first();
    if (await utrInput.isVisible()) {
      await utrInput.scrollIntoViewIfNeeded();
      await utrInput.fill('123456789012');
      const senderInput = page.locator('input[placeholder*="match the transfer"], input[name="senderName"]').first();
      if (await senderInput.isVisible()) {
        await senderInput.fill('John Doe');
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, '09-payment-journey-utr-form-mobile.png'), fullPage: false });
    }
    await context.close();
  }

  // 10. Desktop: Payment Journey Overview
  console.log('10. Payment Journey Desktop Overview...');
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 950 },
    });
    const page = await setupPage(context, true);
    await page.goto('http://localhost:4173/features/premium', { waitUntil: 'networkidle' });
    const chooseBtn = page.locator('[data-testid="choose-pro_monthly"], button:has-text("Pay ₹49")').first();
    await chooseBtn.waitFor({ state: 'visible', timeout: 8000 });
    await chooseBtn.click();
    await page.waitForSelector('.pay-panel', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.scrollTo({ top: 380, behavior: 'instant' });
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '10-payment-journey-desktop-overview.png'), fullPage: false });
    await context.close();
  }

  console.log('All modal and payment journey screenshots captured successfully!');
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
