import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const outDir = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/351d79d9-cb6e-4dd8-86e0-4c5cd51e6f05/screenshots';
const rootArtifactDir = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/351d79d9-cb6e-4dd8-86e0-4c5cd51e6f05';

function saveScreenshot(filename, buffer) {
  fs.writeFileSync(path.join(outDir, filename), buffer);
  fs.writeFileSync(path.join(rootArtifactDir, filename), buffer);
  console.log(`Saved screenshot: ${filename}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: { width: 412, height: 860 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
    localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
  });

  // 1. Text to PDF Conversion Page (Native text input & offline conversion)
  console.log('Navigating to Text-to-PDF conversion page...');
  await page.goto('http://127.0.0.1:4173/features/pdf/conversion/text-to-pdf', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Fill text input
  const textarea = await page.$('.text-input-box');
  if (textarea) {
    await textarea.fill('Official Application Document\n\nThis is a sample document for conversion.\nFeatures:\n1. 100% Offline client-side conversion\n2. Real-time scanning animation\n3. Zero upload privacy guarantee');
    await page.waitForTimeout(400);

    // Scroll to and click Start Conversion button
    const convertBtn = await page.$('.action-submit-wrap app-button');
    if (convertBtn) {
      await convertBtn.scrollIntoViewIfNeeded();
      // Trigger conversion and capture active laser scanning beam & progress ring
      await convertBtn.click();
      await page.waitForTimeout(220);
      const procBuf = await page.screenshot({ fullPage: false });
      saveScreenshot('feature-conversion-animation-active-beam.png', procBuf);

      // Wait for completion celebration state (checkmark bounce and 100% ring)
      await page.waitForTimeout(950);
      const succBuf = await page.screenshot({ fullPage: false });
      saveScreenshot('feature-conversion-animation-success-state.png', succBuf);

      // Wait for transition to final download result card
      await page.waitForTimeout(1200);
      const resBuf = await page.screenshot({ fullPage: false });
      saveScreenshot('feature-conversion-final-result-card.png', resBuf);
    }
  }

  // 2. Capture Related Tools Bar Auto-Scroll on Mobile View
  console.log('Capturing Related Tools horizontal bar on converter page...');
  const relatedToolsEl = await page.$('app-related-tools');
  if (relatedToolsEl) {
    await relatedToolsEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const relBuf = await page.screenshot({ fullPage: false });
    saveScreenshot('feature-auto-scroll-related-tools.png', relBuf);
  }

  // 3. Capture Document Validator preset pills row
  console.log('Capturing Document Validator auto-sliding presets...');
  await page.goto('http://127.0.0.1:4173/features/document-validator', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const valBuf = await page.screenshot({ fullPage: false });
  saveScreenshot('feature-auto-scroll-validator-pills.png', valBuf);

  // 4. Capture QR Barcode Type Pills row auto-sliding
  console.log('Capturing QR Barcode type pills row...');
  await page.goto('http://127.0.0.1:4173/features/qr-barcode', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const qrBuf = await page.screenshot({ fullPage: false });
  saveScreenshot('feature-auto-scroll-qr-type-pills.png', qrBuf);

  await browser.close();
  console.log('All feature showcase screenshots generated successfully!');
}

main().catch(err => {
  console.error('Error generating showcase:', err);
  process.exit(1);
});
