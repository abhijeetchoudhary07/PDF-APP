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
  console.log(`Saved screenshot: ${filename}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

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

  // Test 1: Home page category marquee & recent tools bar
  console.log('Capturing Home Page Auto-Sliding Toolbars...');
  await page.goto('http://127.0.0.1:4173/home', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const homeBuf = await page.screenshot({ fullPage: false });
  saveScreenshot('feature-1-home-auto-sliding-bars.png', homeBuf);

  // Test 2: Document Validator preset pills auto-scroll bar
  console.log('Capturing Document Validator Auto-Sliding Pills...');
  await page.goto('http://127.0.0.1:4173/features/document-validator', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const valBuf = await page.screenshot({ fullPage: false });
  saveScreenshot('feature-1-validator-auto-sliding-pills.png', valBuf);

  // Test 3: Related Tools auto-sliding carousel on mobile
  console.log('Capturing Related Tools Auto-Sliding Carousel on Mobile...');
  await page.goto('http://127.0.0.1:4173/features/pdf-ocr', { waitUntil: 'networkidle', timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  const relBuf = await page.screenshot({ fullPage: false });
  saveScreenshot('feature-1-related-tools-auto-sliding-mobile.png', relBuf);

  // 2. Conversion Animation Demonstration
  console.log('Capturing Word to PDF Dynamic Conversion Animation (Processing State)...');
  await page.goto('http://127.0.0.1:4173/features/pdf/conversion/word-to-pdf', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(800);

  const inputEl = await page.$('input[type="file"]');
  if (inputEl) {
    const mockDocx = Buffer.from('Mock Word document content for demonstration');
    await inputEl.setInputFiles({
      name: 'annual_financial_report.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: mockDocx
    });
    await page.waitForTimeout(800);

    // Click "Start Conversion"
    const convertBtn = await page.$('.action-submit-wrap app-button');
    if (convertBtn) {
      await convertBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // Capture processing state
  const procBuf = await page.screenshot({ fullPage: false });
  saveScreenshot('feature-2-conversion-animation-processing.png', procBuf);

  // Wait for completed state with celebration checkmark
  await page.waitForTimeout(2000);
  const succBuf = await page.screenshot({ fullPage: false });
  saveScreenshot('feature-2-conversion-animation-success.png', succBuf);

  // Test 4: PDF Compress page conversion animation
  console.log('Capturing PDF Compress Conversion Animation...');
  await page.goto('http://127.0.0.1:4173/features/pdf', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(800);
  const pdfInput = await page.$('input[type="file"]');
  if (pdfInput) {
    const mockPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF');
    await pdfInput.setInputFiles({
      name: 'Quarterly_Tax_Statement.pdf',
      mimeType: 'application/pdf',
      buffer: mockPdf
    });
    await page.waitForTimeout(800);
  }
  const pdfCompressBuf = await page.screenshot({ fullPage: false });
  saveScreenshot('feature-2-pdf-compress-screen.png', pdfCompressBuf);

  await browser.close();
  console.log('All screenshots captured successfully!');
}

main().catch(err => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
