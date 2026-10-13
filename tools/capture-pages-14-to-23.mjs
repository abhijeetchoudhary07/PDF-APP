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

const pages = [
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
];

async function main() {
  const browser = await chromium.launch({ headless: true });

  console.log('Capturing Pages 14 to 23 on mobile (iPhone 14: 390x844)...');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
    localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
  });

  for (const item of pages) {
    try {
      const url = `http://localhost:4173/${item.route}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(600);

      await page.evaluate(() => {
        if (window.__toastService) {
          window.__toastService.clear();
        }
      });
      await page.waitForTimeout(200);

      const buf = await page.screenshot({ fullPage: false });
      saveScreenshot(item.name, buf);
      console.log(`✓ [${item.route}] -> ${item.name}`);
    } catch (err) {
      console.error(`✗ Error on ${item.route}:`, err.message);
    }
  }

  await context.close();
  await browser.close();
  console.log('\nAll Pages 14-23 captured successfully!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
