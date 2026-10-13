import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const outDir = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/351d79d9-cb6e-4dd8-86e0-4c5cd51e6f05/screenshots';
const rootArtifactDir = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/351d79d9-cb6e-4dd8-86e0-4c5cd51e6f05';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function saveScreenshot(filename, buffer) {
  fs.writeFileSync(path.join(outDir, filename), buffer);
  fs.writeFileSync(path.join(rootArtifactDir, filename), buffer);
}

const pagesToTest = [
  { name: 'page-01-home-mobile.png', route: 'home' },
  { name: 'page-02-photo-tools-mobile.png', route: 'features/photo' },
  { name: 'page-03-signature-tools-mobile.png', route: 'features/signature' },
  { name: 'page-04-pdf-hub-mobile.png', route: 'features/pdf' },
  { name: 'page-05-pdf-editor-mobile.png', route: 'features/pdf/editor' },
  { name: 'page-06-pdf-organizer-mobile.png', route: 'features/pdf/organize' },
  { name: 'page-07-pdf-conversion-mobile.png', route: 'features/pdf/conversion' },
  { name: 'page-08-pdf-forms-mobile.png', route: 'features/pdf/forms' },
  { name: 'page-09-pdf-sign-mobile.png', route: 'features/pdf/sign' },
  { name: 'page-10-pdf-security-mobile.png', route: 'features/pdf/security' },
  { name: 'page-11-pdf-flatten-mobile.png', route: 'features/pdf/flatten' },
  { name: 'page-12-signature-request-mobile.png', route: 'features/pdf/signature-request' },
  { name: 'page-13-presets-mobile.png', route: 'features/presets' },
  { name: 'page-14-ocr-mobile.png', route: 'features/pdf-ocr' },
  { name: 'page-15-document-scanner-mobile.png', route: 'features/document-scanner' },
  { name: 'page-16-document-validator-mobile.png', route: 'features/document-validator' },
  { name: 'page-17-pdf-compare-mobile.png', route: 'features/pdf-compare' },
  { name: 'page-18-pdf-sanitizer-mobile.png', route: 'features/pdf-privacy-sanitizer' },
  { name: 'page-19-header-footer-mobile.png', route: 'features/pdf-header-footer' },
  { name: 'page-20-pdf-repair-mobile.png', route: 'features/pdf-repair' },
  { name: 'page-21-pdf-extractor-mobile.png', route: 'features/pdf-extractor' },
  { name: 'page-22-qr-barcode-mobile.png', route: 'features/qr-barcode' },
  { name: 'page-23-pdf-intelligence-mobile.png', route: 'features/pdf-intelligence' },
  { name: 'page-24-history-mobile.png', route: 'features/history' },
  { name: 'page-25-batch-photos-mobile.png', route: 'features/batch' },
  { name: 'page-26-batch-pdf-mobile.png', route: 'features/batch-pdf' },
  { name: 'page-27-settings-mobile.png', route: 'features/settings' },
  { name: 'page-28-privacy-policy-mobile.png', route: 'features/privacy-policy' },
  { name: 'page-29-terms-of-use-mobile.png', route: 'features/terms-of-use' },
  { name: 'page-30-local-storage-mobile.png', route: 'features/local-data-storage' },
  { name: 'page-31-help-faq-mobile.png', route: 'features/help-faq' },
  { name: 'page-32-contact-support-mobile.png', route: 'features/contact-support' },
  { name: 'page-33-about-engine-mobile.png', route: 'features/about-engine' },
  { name: 'page-34-account-mobile.png', route: 'account' },
  { name: 'page-35-premium-plans-mobile.png', route: 'features/premium' },
  { name: 'page-36-profile-mobile.png', route: 'profile' }
];

async function main() {
  const browser = await chromium.launch({ headless: true });

  // 1. Capture Toasts on Mobile Viewport (iPhone 14: 390x844)
  console.log('Capturing Toast notifications on mobile...');
  const toastContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });

  const toastPage = await toastContext.newPage();
  await toastPage.addInitScript(() => {
    localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
    localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
  });

  await toastPage.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
  await toastPage.waitForTimeout(500);

  // Toast 1: Success
  await toastPage.evaluate(() => {
    window.__toastService.clear();
    window.__toastService.success('PDF document compressed and saved successfully!', 'Success', 10000);
  });
  await toastPage.waitForSelector('.toast-item.toast-success', { timeout: 3000 });
  await toastPage.waitForTimeout(400);
  let buf = await toastPage.screenshot({ fullPage: false });
  saveScreenshot('toast-01-success-mobile.png', buf);
  console.log('✓ Captured toast-01-success-mobile.png');

  // Toast 2: Warning
  await toastPage.evaluate(() => {
    window.__toastService.clear();
    window.__toastService.warning('Storage limit approaching: 85% of offline storage used.', 'Warning', 10000);
  });
  await toastPage.waitForSelector('.toast-item.toast-warning', { timeout: 3000 });
  await toastPage.waitForTimeout(400);
  buf = await toastPage.screenshot({ fullPage: false });
  saveScreenshot('toast-02-warning-mobile.png', buf);
  console.log('✓ Captured toast-02-warning-mobile.png');

  // Toast 3: Error
  await toastPage.evaluate(() => {
    window.__toastService.clear();
    window.__toastService.error('Failed to verify UTR number. Please check the 12-digit transaction ID.', 'Transaction Error', 10000);
  });
  await toastPage.waitForSelector('.toast-item.toast-error', { timeout: 3000 });
  await toastPage.waitForTimeout(400);
  buf = await toastPage.screenshot({ fullPage: false });
  saveScreenshot('toast-03-error-mobile.png', buf);
  console.log('✓ Captured toast-03-error-mobile.png');

  // Toast 4: Info
  await toastPage.evaluate(() => {
    window.__toastService.clear();
    window.__toastService.info('All processing happens 100% locally on your device for complete privacy.', 'Offline Security', 10000);
  });
  await toastPage.waitForSelector('.toast-item.toast-info', { timeout: 3000 });
  await toastPage.waitForTimeout(400);
  buf = await toastPage.screenshot({ fullPage: false });
  saveScreenshot('toast-04-info-mobile.png', buf);
  console.log('✓ Captured toast-04-info-mobile.png');

  // Toast 5: Stacked Multiple Toasts on Mobile
  await toastPage.evaluate(() => {
    window.__toastService.clear();
    window.__toastService.success('Profile avatar updated.', 'Success', 10000);
    window.__toastService.info('Theme set to dark mode.', 'Info', 10000);
  });
  await toastPage.waitForTimeout(400);
  buf = await toastPage.screenshot({ fullPage: false });
  saveScreenshot('toast-05-stacked-mobile.png', buf);
  console.log('✓ Captured toast-05-stacked-mobile.png');

  // Toast 6: Compact Mobile Screen (iPhone SE: 375x667)
  const compactContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const compactPage = await compactContext.newPage();
  await compactPage.addInitScript(() => {
    localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
    localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
  });
  await compactPage.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
  await compactPage.waitForTimeout(400);
  await compactPage.evaluate(() => {
    window.__toastService.clear();
    window.__toastService.success('Signature clean up completed successfully.', 'Signature Saved', 10000);
  });
  await compactPage.waitForSelector('.toast-item.toast-success', { timeout: 3000 });
  await compactPage.waitForTimeout(400);
  buf = await compactPage.screenshot({ fullPage: false });
  saveScreenshot('toast-06-compact-mobile-375.png', buf);
  console.log('✓ Captured toast-06-compact-mobile-375.png');
  await compactContext.close();
  await toastContext.close();

  // 2. Capture ALL Pages across the App on Mobile Viewport (iPhone 14: 390x844)
  console.log('\nCapturing all pages on mobile...');
  const pageContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });

  const appPage = await pageContext.newPage();
  await appPage.addInitScript(() => {
    localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
    localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
  });

  for (const pageItem of pagesToTest) {
    try {
      const url = `http://localhost:4173/${pageItem.route}`;
      await appPage.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await appPage.waitForTimeout(500);

      // Dismiss any transient toast before taking clean page shot
      await appPage.evaluate(() => {
        if (window.__toastService) {
          window.__toastService.clear();
        }
      });
      await appPage.waitForTimeout(200);

      const pageBuf = await appPage.screenshot({ fullPage: false });
      saveScreenshot(pageItem.name, pageBuf);
      console.log(`✓ [${pageItem.route}] -> ${pageItem.name}`);
    } catch (err) {
      console.error(`✗ Error capturing ${pageItem.route}:`, err.message);
    }
  }

  // 3. Capture Large Android Phone (412x915) for Home and Premium to verify responsive scaling across devices
  console.log('\nCapturing Android large viewport (412x915)...');
  const androidContext = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const androidPage = await androidContext.newPage();
  await androidPage.addInitScript(() => {
    localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
    localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
  });
  await androidPage.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
  await androidPage.waitForTimeout(400);
  buf = await androidPage.screenshot({ fullPage: false });
  saveScreenshot('page-37-home-android-412.png', buf);
  console.log('✓ Captured page-37-home-android-412.png');

  await androidPage.goto('http://localhost:4173/features/premium', { waitUntil: 'networkidle' });
  await androidPage.waitForTimeout(400);
  buf = await androidPage.screenshot({ fullPage: false });
  saveScreenshot('page-38-premium-android-412.png', buf);
  console.log('✓ Captured page-38-premium-android-412.png');

  await androidContext.close();
  await pageContext.close();
  await browser.close();
  console.log('\nAll screenshots captured successfully!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
