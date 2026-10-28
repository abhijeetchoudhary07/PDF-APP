import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const OUT_DIR = path.resolve('e2e/test-data/editor-audit');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function generateAll() {
  console.log('Generating real PDF Editor audit fixtures in:', OUT_DIR);

  // 1. Single-Page Invoice with sensitive data (For redaction, editing, coordinate testing)
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    page.drawText('TAX INVOICE - APEX LOGISTICS PVT LTD', {
      x: 50,
      y: 790,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.2, 0.4)
    });
    page.drawText('Invoice No: INV-2026-8891', { x: 50, y: 765, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('Date: 28-October-2026', { x: 400, y: 765, size: 11, font, color: rgb(0.3, 0.3, 0.3) });

    page.drawRectangle({
      x: 50,
      y: 660,
      width: 495,
      height: 85,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
      color: rgb(0.97, 0.98, 1.0)
    });
    page.drawText('Billed To: Rajesh Kumar Sharma', { x: 65, y: 720, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText('Account Number: ACC-99281734', { x: 65, y: 700, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('CONFIDENTIAL_TAX_ID: 999-00-1234', { x: 65, y: 680, size: 10, font: bold, color: rgb(0.8, 0.1, 0.1) });
    page.drawText('PAYMENT_CARD_SECRET: 4111-2222-3333-4444', { x: 65, y: 665, size: 10, font: bold, color: rgb(0.8, 0.1, 0.1) });

    page.drawText('Description', { x: 50, y: 620, size: 11, font: bold });
    page.drawText('Qty', { x: 350, y: 620, size: 11, font: bold });
    page.drawText('Amount (INR)', { x: 440, y: 620, size: 11, font: bold });
    page.drawLine({ start: { x: 50, y: 610 }, end: { x: 545, y: 610 }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });

    page.drawText('Cloud Infrastructure Subscription (Annual)', { x: 50, y: 585, size: 10, font });
    page.drawText('1', { x: 355, y: 585, size: 10, font });
    page.drawText('48,000.00', { x: 450, y: 585, size: 10, font });

    page.drawText('Dedicated Security Gateway Appliance', { x: 50, y: 560, size: 10, font });
    page.drawText('2', { x: 355, y: 560, size: 10, font });
    page.drawText('32,500.00', { x: 450, y: 560, size: 10, font });

    page.drawLine({ start: { x: 350, y: 540 }, end: { x: 545, y: 540 }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
    page.drawText('Grand Total: INR 80,500.00', { x: 370, y: 520, size: 12, font: bold, color: rgb(0.1, 0.4, 0.1) });

    fs.writeFileSync(path.join(OUT_DIR, 'single-page-invoice.pdf'), await doc.save());
    console.log('Saved single-page-invoice.pdf');
  }

  // 2. Multi-column Academic Paper
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

    page.drawText('Quantum Cryptographic Protocols in Distributed Systems', {
      x: 80,
      y: 790,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.1, 0.2)
    });
    page.drawText('Dr. A. Choudhary, Prof. K. Ramanujan — Department of Advanced Computing', {
      x: 100,
      y: 770,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    // Abstract box
    page.drawRectangle({
      x: 60,
      y: 690,
      width: 475,
      height: 65,
      color: rgb(0.96, 0.96, 0.96)
    });
    page.drawText('Abstract: This paper presents a formal analysis of quantum key distribution protocols', { x: 70, y: 735, size: 9, font: bold });
    page.drawText('under asynchronous network constraints. We establish mathematical bounds for Byzantine', { x: 70, y: 720, size: 9, font });
    page.drawText('fault tolerance when adversaries leverage partial state collapse and timing side-channels.', { x: 70, y: 705, size: 9, font });

    // Left Column
    const colLeftX = 60;
    const colWidth = 225;
    page.drawText('1. Introduction', { x: colLeftX, y: 660, size: 11, font: bold });
    page.drawText('Distributed consensus algorithms have traditionally', { x: colLeftX, y: 640, size: 9, font });
    page.drawText('assumed classical computational boundaries. With', { x: colLeftX, y: 625, size: 9, font });
    page.drawText('the advent of quantum decryption capabilities,', { x: colLeftX, y: 610, size: 9, font });
    page.drawText('conventional RSA and elliptic curve foundations', { x: colLeftX, y: 595, size: 9, font });
    page.drawText('require post-quantum cryptographic primitives.', { x: colLeftX, y: 580, size: 9, font });
    page.drawText('Our proposed architecture integrates continuous', { x: colLeftX, y: 565, size: 9, font });
    page.drawText('variable quantum key distribution with zero-knowledge', { x: colLeftX, y: 550, size: 9, font });
    page.drawText('succinct arguments of knowledge (zk-SNARKs).', { x: colLeftX, y: 535, size: 9, font });

    // Right Column
    const colRightX = 310;
    page.drawText('2. Architectural Bounds', { x: colRightX, y: 660, size: 11, font: bold });
    page.drawText('Let G = (V, E) denote a communication network', { x: colRightX, y: 640, size: 9, font });
    page.drawText('where each vertex represents an autonomous node.', { x: colRightX, y: 625, size: 9, font });
    page.drawText('Photonic entropy states are transmitted through', { x: colRightX, y: 610, size: 9, font });
    page.drawText('attenuated optical fiber links under depolarizing', { x: colRightX, y: 595, size: 9, font });
    page.drawText('noise characterized by parameter gamma in [0, 1].', { x: colRightX, y: 580, size: 9, font });
    page.drawText('Empirical measurements indicate 99.4% fidelity', { x: colRightX, y: 565, size: 9, font });
    page.drawText('across standard metropolitan distances up to 80 km.', { x: colRightX, y: 550, size: 9, font });
    page.drawText('Experimental error margins remain under 0.02%.', { x: colRightX, y: 535, size: 9, font });

    // Divider Line
    page.drawLine({ start: { x: 297, y: 670 }, end: { x: 297, y: 510 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });

    fs.writeFileSync(path.join(OUT_DIR, 'multicolumn-academic.pdf'), await doc.save());
    console.log('Saved multicolumn-academic.pdf');
  }

  // 3. Fillable PDF Form with interactive AcroForm fields
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const form = doc.getForm();

    page.drawText('GOVERNMENT SERVICE PORTAL - ENROLLMENT FORM', {
      x: 50,
      y: 790,
      size: 14,
      font: bold,
      color: rgb(0.1, 0.2, 0.4)
    });
    page.drawText('Please fill all mandatory interactive form fields below.', { x: 50, y: 770, size: 10, font });

    // Text Field: Full Name
    page.drawText('Full Legal Name:', { x: 50, y: 720, size: 11, font: bold });
    const nameField = form.createTextField('fullName');
    nameField.setText('Rajesh Sharma');
    nameField.addToPage(page, { x: 180, y: 710, width: 300, height: 24 });

    // Text Field: Email
    page.drawText('Email Address:', { x: 50, y: 670, size: 11, font: bold });
    const emailField = form.createTextField('email');
    emailField.setText('rajesh.sharma@example.gov.in');
    emailField.addToPage(page, { x: 180, y: 660, width: 300, height: 24 });

    // Checkbox: Confirm
    page.drawText('Agree to Terms & Conditions:', { x: 50, y: 620, size: 11, font: bold });
    const agreeBox = form.createCheckBox('agreeTerms');
    agreeBox.check();
    agreeBox.addToPage(page, { x: 230, y: 615, width: 18, height: 18 });

    // Text Field: Department Code
    page.drawText('Department Code:', { x: 50, y: 570, size: 11, font: bold });
    const deptField = form.createTextField('deptCode');
    deptField.setText('DEPT-TECH-04');
    deptField.addToPage(page, { x: 180, y: 560, width: 150, height: 24 });

    fs.writeFileSync(path.join(OUT_DIR, 'fillable-form.pdf'), await doc.save());
    console.log('Saved fillable-form.pdf');
  }

  // 4. Scanned Image PDF (Pure raster page in PDF container)
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);

    // Create a 400x500 synthetic scanned paper texture JPEG
    const rawRgb = new Uint8Array(400 * 500 * 3);
    for (let i = 0; i < 400 * 500; i++) {
      const noise = (Math.random() - 0.5) * 15;
      rawRgb[i * 3 + 0] = Math.max(0, Math.min(255, 240 + noise));
      rawRgb[i * 3 + 1] = Math.max(0, Math.min(255, 242 + noise));
      rawRgb[i * 3 + 2] = Math.max(0, Math.min(255, 235 + noise));
    }

    // Embed an existing image fixture if available or draw raster rectangle
    const sampleImgPath = path.resolve('e2e/test-data/scanner-audit/tilted-receipt-invoice.png');
    if (fs.existsSync(sampleImgPath)) {
      const pngBytes = fs.readFileSync(sampleImgPath);
      const embeddedPng = await doc.embedPng(pngBytes);
      page.drawImage(embeddedPng, {
        x: 40,
        y: 100,
        width: 515,
        height: 680
      });
    } else {
      page.drawRectangle({
        x: 40,
        y: 100,
        width: 515,
        height: 680,
        color: rgb(0.95, 0.95, 0.95)
      });
    }

    fs.writeFileSync(path.join(OUT_DIR, 'scanned-image-doc.pdf'), await doc.save());
    console.log('Saved scanned-image-doc.pdf');
  }

  console.log('All PDF Editor audit fixtures generated successfully.');
}

generateAll().catch(console.error);
