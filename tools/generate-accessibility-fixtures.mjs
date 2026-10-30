import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('e2e/test-data/accessibility');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Untagged Single-Column Document
async function createSingleColumnDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]);

  page.drawText('Public Administration Civil Service Handbook 2026', {
    x: 50,
    y: 780,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.2, 0.4)
  });

  page.drawText('Section 1: Fundamental Service Principles', {
    x: 50,
    y: 740,
    size: 13,
    font: boldFont
  });

  page.drawText('Public officials must perform duties with utmost integrity, impartiality, and transparency.', {
    x: 50,
    y: 715,
    size: 10.5,
    font
  });

  page.drawText('All decisions must be documented with objective justification adhering to statutory provisions.', {
    x: 50,
    y: 695,
    size: 10.5,
    font
  });

  page.drawText('Section 2: Ethical Standards and Conduct', {
    x: 50,
    y: 660,
    size: 13,
    font: boldFont
  });

  page.drawText('• Maintain strict confidentiality of official records and citizens personal data', {
    x: 50,
    y: 635,
    size: 10,
    font
  });

  page.drawText('• Disclose potential conflicts of interest immediately to supervisory authorities', {
    x: 50,
    y: 615,
    size: 10,
    font
  });

  page.drawText('• Facilitate open public inquiries within prescribed statutory timelines', {
    x: 50,
    y: 595,
    size: 10,
    font
  });

  page.drawText('Page 1 of 1 • Department of Administrative Reforms', {
    x: 50,
    y: 30,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5)
  });

  const bytes = await doc.save();
  const filePath = path.join(outDir, 'single-column-doc.pdf');
  fs.writeFileSync(filePath, bytes);
  console.log('Created:', filePath);
}

// 2. Two-Column Magazine Article
async function createTwoColumnMagazine() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]);

  // Full-width Headline
  page.drawText('Technology in Public Governance: The Digital Transformation Decade', {
    x: 50,
    y: 790,
    size: 15,
    font: boldFont,
    color: rgb(0.12, 0.25, 0.45)
  });

  // Left Column (Col 0)
  page.drawText('Democratizing Access to Public Records', {
    x: 50,
    y: 750,
    size: 12,
    font: boldFont
  });
  page.drawText('Decentralized digital portals have enabled millions of', { x: 50, y: 725, size: 9.5, font });
  page.drawText('citizens to access government certificates and land records', { x: 50, y: 710, size: 9.5, font });
  page.drawText('instantly without visiting district administrative offices.', { x: 50, y: 695, size: 9.5, font });

  page.drawText('Cloud infrastructure and zero-trust security architecture', { x: 50, y: 670, size: 9.5, font });
  page.drawText('guarantee that confidential records are protected against', { x: 50, y: 655, size: 9.5, font });
  page.drawText('unauthorized cyber intrusions and tampering.', { x: 50, y: 640, size: 9.5, font });

  // Right Column (Col 1)
  page.drawText('Mobile First Delivery and Inclusion', {
    x: 320,
    y: 750,
    size: 12,
    font: boldFont
  });
  page.drawText('Smartphones have bridged the technological divide between', { x: 320, y: 725, size: 9.5, font });
  page.drawText('metropolitan hubs and remote rural communities across India.', { x: 320, y: 710, size: 9.5, font });
  page.drawText('Multilingual interfaces in 22 official languages ensure', { x: 320, y: 695, size: 9.5, font });

  page.drawText('that language barriers never hinder access to welfare', { x: 320, y: 670, size: 9.5, font });
  page.drawText('schemes, scholarships, and healthcare pensions.', { x: 320, y: 655, size: 9.5, font });

  page.drawText('Page 1 of 1 • Governance Today Monthly Review', {
    x: 50,
    y: 30,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5)
  });

  const bytes = await doc.save();
  const filePath = path.join(outDir, 'two-column-magazine.pdf');
  fs.writeFileSync(filePath, bytes);
  console.log('Created:', filePath);
}

// 3. Document with Charts and Decorative Header Bars
async function createChartsAndDecorationsDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]);

  // Decorative header bar (Artifact)
  page.drawRectangle({
    x: 0,
    y: 815,
    width: 595.28,
    height: 26.89,
    color: rgb(0.15, 0.35, 0.65)
  });

  page.drawText('CONFIDENTIAL ANNUAL REPORT • OFFICIAL USE ONLY', {
    x: 50,
    y: 823,
    size: 9,
    font: boldFont,
    color: rgb(1, 1, 1)
  });

  page.drawText('Quarterly Financial and Candidate Performance Report', {
    x: 50,
    y: 775,
    size: 15,
    font: boldFont
  });

  page.drawText('Section 1: Expenditure Analysis and Audit Metrics', {
    x: 50,
    y: 740,
    size: 12,
    font: boldFont
  });

  page.drawText('Summary of disbursements across regional testing testing centers in Q1-Q4.', {
    x: 50,
    y: 715,
    size: 10,
    font
  });

  // Embedded Chart graphic (1x1 PNG or drawn chart rectangle with image XObject)
  // Create an embedded small 2x2 image XObject to simulate real image detection
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQIW2P8z/D/PwMDAwMjjAYAOAID/5L7Y0wAAAAASUVORK5CYII=';
  const imgBytes = Buffer.from(pngBase64, 'base64');
  const embeddedImg = await doc.embedPng(imgBytes);

  page.drawImage(embeddedImg, {
    x: 50,
    y: 530,
    width: 200,
    height: 150
  });

  page.drawText('Figure 1: Capital outlay distribution per regional examination board.', {
    x: 50,
    y: 510,
    size: 9,
    font: boldFont,
    color: rgb(0.3, 0.3, 0.3)
  });

  // Table summary
  page.drawText('Quarter | Budget Allocated | Actual Spent | Variance', {
    x: 50,
    y: 470,
    size: 10,
    font: boldFont
  });
  page.drawText('Q1 2026 | Rs. 4,500,000    | Rs. 4,200,000 | +Rs. 300,000', {
    x: 50,
    y: 450,
    size: 9.5,
    font
  });
  page.drawText('Q2 2026 | Rs. 5,200,000    | Rs. 5,100,000 | +Rs. 100,000', {
    x: 50,
    y: 430,
    size: 9.5,
    font
  });

  // Decorative footer bar (Artifact)
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 595.28,
    height: 35,
    color: rgb(0.92, 0.94, 0.96)
  });

  page.drawText('Page 1 of 1 • Financial Oversight Committee Audit Verification', {
    x: 50,
    y: 12,
    size: 8.5,
    font,
    color: rgb(0.4, 0.4, 0.4)
  });

  const bytes = await doc.save();
  const filePath = path.join(outDir, 'charts-and-decorations.pdf');
  fs.writeFileSync(filePath, bytes);
  console.log('Created:', filePath);
}

async function main() {
  await createSingleColumnDoc();
  await createTwoColumnMagazine();
  await createChartsAndDecorationsDoc();
  console.log('Accessibility test fixtures created successfully.');
}

main().catch(console.error);
