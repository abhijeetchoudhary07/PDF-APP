import { chromium } from 'playwright';
import path from 'path';

const outDir = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/351d79d9-cb6e-4dd8-86e0-4c5cd51e6f05/screenshots';

async function dismissOnboarding(page) {
  try {
    const skipBtn = page.locator('.onboarding-dialog .skip-btn, button:has-text("Skip")').first();
    if (await skipBtn.isVisible({ timeout: 1500 })) {
      await skipBtn.click();
      await page.waitForTimeout(400);
    }
  } catch {}
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const session = {
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

  // 1. Mobile viewport: Onboarding modal
  console.log('1. Onboarding Modal...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.onboarding-dialog', { timeout: 8000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, '01-onboarding-modal-mobile.png'), fullPage: false });
    await context.close();
  }

  // 2. Mobile viewport: Presets modal
  console.log('2. Presets Modal...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto('http://localhost:4173/features/presets', { waitUntil: 'networkidle' });
    await dismissOnboarding(page);
    const createBtn = page.locator('app-page-header app-button button, button:has-text("Custom Preset")').first();
    await createBtn.waitFor({ state: 'visible', timeout: 8000 });
    await createBtn.click();
    await page.waitForSelector('.modal-dialog', { timeout: 8000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, '02-presets-modal-mobile.png'), fullPage: false });
    await context.close();
  }

  // 3. Mobile viewport: Factory Reset confirmation modal
  console.log('3. Local Data Confirmation Modal...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto('http://localhost:4173/features/local-data-storage', { waitUntil: 'networkidle' });
    await dismissOnboarding(page);
    const factoryResetBtn = page.locator('button:has-text("Factory Reset")').first();
    await factoryResetBtn.scrollIntoViewIfNeeded();
    await factoryResetBtn.click();
    await page.waitForSelector('.modal-backdrop .modal-dialog', { timeout: 8000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, '03-local-data-modal-mobile.png'), fullPage: false });
    await context.close();
  }

  // 4. Mobile viewport: Premium Pricing Cards before click
  console.log('4. Premium Pricing Cards Mobile...');
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.addInitScript((sess) => {
      localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
      localStorage.setItem('CapacitorStorage.IFH_PDF_ACCOUNT_SESSION_V1', JSON.stringify(sess));
    }, session);

    await page.goto('http://localhost:4173/features/premium', { waitUntil: 'networkidle' });
    await dismissOnboarding(page);
    await page.waitForSelector('.pricing-card', { timeout: 8000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, '04-premium-plans-mobile.png'), fullPage: false });

    // 5. Click "Pay ₹49" -> Pay Panel opens and scrolls into view
    console.log('5. Clicking Pay button -> Pay Panel Mobile...');
    const chooseBtn = page.locator('[data-testid="choose-pro_monthly"], button:has-text("Pay ₹49")').first();
    await chooseBtn.click();
    await page.waitForSelector('.pay-panel', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, '05-payment-panel-mobile.png'), fullPage: false });
    await context.close();
  }

  // 6. Desktop viewport: Premium Page with Plans & Pay Panel
  console.log('6. Premium Page Desktop...');
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 950 },
    });
    const page = await context.newPage();
    await page.addInitScript((sess) => {
      localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
      localStorage.setItem('CapacitorStorage.IFH_PDF_ACCOUNT_SESSION_V1', JSON.stringify(sess));
    }, session);

    await page.goto('http://localhost:4173/features/premium', { waitUntil: 'networkidle' });
    await dismissOnboarding(page);
    const chooseBtn = page.locator('[data-testid="choose-pro_monthly"], button:has-text("Pay ₹49")').first();
    await chooseBtn.waitFor({ state: 'visible', timeout: 8000 });
    await chooseBtn.click();
    await page.waitForSelector('.pay-panel', { timeout: 8000 });
    await page.waitForTimeout(800);
    // Scroll so top of pay panel and plans are in view
    await page.evaluate(() => {
      window.scrollTo({ top: 380, behavior: 'instant' });
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, '06-payment-page-desktop.png'), fullPage: false });
    await context.close();
  }

  console.log('Finished capturing all screenshots!');
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
