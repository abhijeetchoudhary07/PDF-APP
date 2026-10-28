import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, '../e2e/test-data/scanner-audit');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating scanner & OCR audit fixtures in:', outDir);

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Tilted Receipt / Invoice on dark desk background
  const tiltedReceipt = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');

    // Desk background (dark wood/slate)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 800, 1000);

    // Tilted receipt paper
    ctx.save();
    ctx.translate(400, 500);
    ctx.rotate(-0.15); // ~8.5 degrees tilt
    ctx.translate(-220, -380);

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 12;

    // Receipt paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 440, 760);
    ctx.restore();

    // Re-apply tilt for text
    ctx.save();
    ctx.translate(400, 500);
    ctx.rotate(-0.15);
    ctx.translate(-220, -380);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('SUPERSTORE RETAIL LTD', 80, 60);
    ctx.font = '14px monospace';
    ctx.fillText('INVOICE #: INV-2026-90412', 40, 100);
    ctx.fillText('DATE: 2026-10-28 14:32:10', 40, 125);
    ctx.fillText('----------------------------------------', 30, 150);

    ctx.font = '13px monospace';
    ctx.fillText('1x High-Resolution Camera Module   $120.00', 35, 185);
    ctx.fillText('2x Offline Storage USB 128GB        $50.00', 35, 215);
    ctx.fillText('1x Security Hardware Key            $45.00', 35, 245);
    ctx.fillText('----------------------------------------', 30, 280);

    ctx.font = 'bold 16px monospace';
    ctx.fillText('SUBTOTAL:                          $215.00', 35, 315);
    ctx.fillText('TAX (8.25%):                        $17.74', 35, 345);
    ctx.fillText('TOTAL AMOUNT DUE:                  $232.74', 35, 385);
    ctx.fillText('----------------------------------------', 30, 420);

    ctx.font = '12px monospace';
    ctx.fillText('THANK YOU FOR YOUR PATRONAGE!', 85, 460);
    ctx.fillText('BARCODE: *90412-2026*', 110, 500);

    ctx.restore();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(outDir, 'tilted-receipt-invoice.png'), Buffer.from(tiltedReceipt, 'base64'));
  console.log('Created tilted-receipt-invoice.png');

  // 2. Curved Book Page with Center Gutter
  const curvedBook = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 700;
    const ctx = canvas.getContext('2d');

    // Desk background
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 900, 700);

    // Left Page
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(60, 60, 380, 580);

    // Right Page
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(460, 60, 380, 580);

    // Center gutter shadow
    const grad = ctx.createLinearGradient(420, 0, 480, 0);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.0)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(400, 60, 100, 580);

    // Left text
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 20px serif';
    ctx.fillText('Chapter 4: Neural Vision', 90, 120);
    ctx.font = '14px serif';
    for (let y = 170; y < 580; y += 32) {
      ctx.fillText('Automated document edge detection algorithms rely on adaptive filters.', 85, y);
    }

    // Right text
    ctx.font = 'bold 20px serif';
    ctx.fillText('Perspective Rectification', 490, 120);
    ctx.font = '14px serif';
    for (let y = 170; y < 580; y += 32) {
      ctx.fillText('Bilinear interpolation and homography maps skewed quads to planar space.', 485, y);
    }

    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(outDir, 'curved-book-page.png'), Buffer.from(curvedBook, 'base64'));
  console.log('Created curved-book-page.png');

  // 3. Photo with Shadows and Glare
  const shadowGlare = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 750;
    canvas.height = 950;
    const ctx = canvas.getContext('2d');

    // Paper background
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, 750, 950);

    // Document header
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('CONFIDENTIAL AUDIT PROTOCOL', 120, 100);
    ctx.font = '15px sans-serif';
    ctx.fillText('Compliance Directive 2026 / Security Enforcement Division', 120, 135);

    // Body lines
    for (let y = 190; y < 850; y += 36) {
      ctx.fillText('Security parameter verification: client memory bounds must be preserved.', 80, y);
    }

    // Harsh shadow across bottom-right
    const shadowGrad = ctx.createLinearGradient(300, 300, 750, 950);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shadowGrad.addColorStop(0.4, 'rgba(0, 0, 0, 0.45)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(0, 0, 750, 950);

    // Bright glare hotspot at top-left
    const glareGrad = ctx.createRadialGradient(220, 200, 10, 220, 200, 180);
    glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    glareGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
    glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glareGrad;
    ctx.fillRect(0, 0, 750, 950);

    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(outDir, 'shadow-glare-document.png'), Buffer.from(shadowGlare, 'base64'));
  console.log('Created shadow-glare-document.png');

  // 4. Low-Contrast Document on White Table
  const lowContrast = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');

    // Table background: very light off-white (#f9fafb)
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, 800, 1000);

    // Paper: pure white (#ffffff) - very low contrast boundary
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(80, 80, 640, 840);

    // Subtle faint border
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.strokeRect(80, 80, 640, 840);

    // Faint gray text
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('LOW-CONTRAST SCAN SPECIMEN', 140, 160);
    ctx.font = '14px sans-serif';
    ctx.fillText('This document verifies edge detection against minimal contrast backgrounds.', 120, 210);

    for (let y = 260; y < 800; y += 40) {
      ctx.fillText('Adaptive thresholding and gradient Sobel operators isolate the perimeter.', 120, y);
    }

    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(outDir, 'low-contrast-white-table.png'), Buffer.from(lowContrast, 'base64'));
  console.log('Created low-contrast-white-table.png');

  // 5. Multilingual Document (Hindi Devanagari, English, and Numeric Digits)
  const multilingual = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 750;
    canvas.height = 950;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 750, 950);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('GOVERNMENT OF INDIA / भारत सरकार', 150, 80);

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#b45309';
    ctx.fillText('IDENTITY & CITIZEN DIRECTORY / नागरिक सत्यापन', 130, 120);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 145);
    ctx.lineTo(690, 145);
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.font = '16px sans-serif';
    ctx.fillText('Full Name (नाम): Rajesh Kumar Sharma (राजेश कुमार शर्मा)', 70, 190);
    ctx.fillText('Aadhaar / ID Number: 9876 5432 1098', 70, 230);
    ctx.fillText('Date of Birth (जन्म तिथि): 15/08/1990', 70, 270);
    ctx.fillText('Permanent Address: Flat 402, Shanti Vihar, New Delhi 110001', 70, 310);
    ctx.fillText('स्थायी पता: फ्लैट ४०२, शांति विहार, नई दिल्ली ११०००१', 70, 350);

    ctx.strokeRect(65, 400, 620, 250);
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Official Biometric Verification / आधिकारिक बायोमेट्रिक सत्यापन', 85, 440);
    ctx.font = '14px sans-serif';
    ctx.fillText('Security Clearance: Level 3 Approved (सुरक्षा मंजूरी स्वीकृत)', 85, 480);
    ctx.fillText('Authorized Signature: Officer In-Charge (प्राधिकृत हस्ताक्षर)', 85, 520);
    ctx.fillText('Digital Timestamp: 2026-10-28 10:15:30 UTC', 85, 560);

    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(outDir, 'multilingual-hindi-english.png'), Buffer.from(multilingual, 'base64'));
  console.log('Created multilingual-hindi-english.png');

  // 6. XSS Injection Specimen
  const xssDoc = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 700;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 700, 800);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('SECURITY TEST SPECIMEN: XSS INJECTION', 80, 80);

    ctx.font = '15px monospace';
    ctx.fillStyle = '#dc2626';
    ctx.fillText('<script>alert("xss-scanner")</script>', 80, 150);
    ctx.fillText('<img src=x onerror=alert("img-xss")>', 80, 200);
    ctx.fillText('<svg onload=alert("svg-xss")>', 80, 250);
    ctx.fillText('javascript:alert(document.cookie)', 80, 300);

    ctx.fillStyle = '#1e293b';
    ctx.fillText('The above payload strings must be treated as inert text.', 80, 380);
    ctx.fillText('No script execution or DOM manipulation shall occur.', 80, 420);

    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(outDir, 'xss-injection-document.png'), Buffer.from(xssDoc, 'base64'));
  console.log('Created xss-injection-document.png');

  // 7. Oversized / Ultra-High Resolution Image (5000 x 5000 px = 25 Megapixels)
  const oversized = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 5000;
    canvas.height = 5000;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 5000, 5000);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 120px sans-serif';
    ctx.fillText('ULTRA HIGH RESOLUTION SCANNER STRESS SPECIMEN', 300, 600);
    ctx.font = '80px sans-serif';
    ctx.fillText('5000 x 5000 Pixels - Memory Safety Clamping Test', 300, 800);

    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  });
  fs.writeFileSync(path.join(outDir, 'oversized-highres-document.jpg'), Buffer.from(oversized, 'base64'));
  console.log('Created oversized-highres-document.jpg');

  await browser.close();
  console.log('All 7 scanner audit fixtures generated successfully.');
}

main().catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
