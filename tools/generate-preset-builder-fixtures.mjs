import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const OUT_DIR = path.resolve('e2e/test-data/presets');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function generateAll() {
  console.log('Generating Preset Builder test fixtures in:', OUT_DIR);

  // 1. Recruitment Upload Guidelines PDF
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([595.28, 841.89]);

    page.drawText('IMPORTANT GUIDELINES FOR PHOTOGRAPH UPLOAD', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.1, 0.8)
    });

    const lines = [
      '1. The applicant should upload a clear color photograph.',
      '2. File size 20KB-50KB, 200x230 pixels, JPEG format.',
      '3. Background must be light or plain white without any border.',
      '4. Resolution must be 200 DPI.'
    ];

    lines.forEach((line, idx) => {
      page.drawText(line, {
        x: 50,
        y: 740 - idx * 25,
        size: 12,
        font,
        color: rgb(0.15, 0.15, 0.15)
      });
    });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'recruitment-guidelines.pdf'), bytes);
  }

  // 2. Passport Guidelines PDF
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([595.28, 841.89]);

    page.drawText('PASSPORT SPECIFICATION INSTRUCTIONS', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });

    const lines = [
      'Upload specification:',
      'Photograph dimensions: 35 mm x 45 mm.',
      'File size not exceeding 50 KB.',
      'Aspect ratio: 3.5:4.5.',
      'Resolution: 300 DPI.',
      'Allowed format: JPEG.'
    ];

    lines.forEach((line, idx) => {
      page.drawText(line, {
        x: 50,
        y: 740 - idx * 25,
        size: 12,
        font,
        color: rgb(0.15, 0.15, 0.15)
      });
    });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'passport-guidelines.pdf'), bytes);
  }

  // 3. Unparseable / General Notice PDF
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([595.28, 841.89]);

    page.drawText('GENERAL INSTRUCTIONS NOTICE', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.5, 0.1, 0.1)
    });

    const lines = [
      'Welcome to the application registration portal.',
      'Please read all eligibility criteria before proceeding.',
      'For technical assistance, contact the helpdesk toll-free numbers.'
    ];

    lines.forEach((line, idx) => {
      page.drawText(line, {
        x: 50,
        y: 740 - idx * 25,
        size: 12,
        font,
        color: rgb(0.15, 0.15, 0.15)
      });
    });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'unparseable-guidelines.pdf'), bytes);
  }

  // 4. Also copy or create a sample image guideline
  // Simple 1x1 or test image
  const minimalPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(OUT_DIR, 'sample-guideline.png'), minimalPng);

  console.log('Successfully generated fixtures in:', OUT_DIR);
}

generateAll().catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
