import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const OUT_DIR = path.resolve('e2e/test-data/entity-clause');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function generateAll() {
  console.log('Generating Entity & Clause PDF fixtures in:', OUT_DIR);

  // 1. Commercial Lease Agreement
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    // Page 1
    const p1 = doc.addPage([595.28, 841.89]);
    p1.drawText('COMMERCIAL REAL ESTATE LEASE AGREEMENT', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.2, 0.4)
    });
    p1.drawText('Agreement between Prime Properties LLC ("Landlord") and Metro Retail Inc. ("Tenant").', {
      x: 50,
      y: 740,
      size: 11,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Reference ID: LEASE-2025-0044', {
      x: 50,
      y: 715,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    p1.drawText('1. Term & Commencement', {
      x: 50,
      y: 670,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p1.drawText('This agreement has a commencement date of 01/01/2025 and expiration date of 31/12/2027.', {
      x: 50,
      y: 645,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    p1.drawText('2. Rent and Security Deposit', {
      x: 50,
      y: 600,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p1.drawText('The Tenant shall pay a monthly rent of $4,500 USD on or before the 1st of each month.', {
      x: 50,
      y: 575,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('A refundable security deposit of $9,000 is due upon signing.', {
      x: 50,
      y: 550,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    p1.drawText('3. Obligations & Maintenance', {
      x: 50,
      y: 505,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p1.drawText('The Tenant must keep the leased premises in good working condition.', {
      x: 50,
      y: 480,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    // Page 2
    const p2 = doc.addPage([595.28, 841.89]);
    p2.drawText('4. Default & Late Penalties', {
      x: 50,
      y: 780,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p2.drawText('In the event of delinquent rent, a late penalty of $150 shall apply after 5 business days.', {
      x: 50,
      y: 755,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    p2.drawText('5. Early Termination', {
      x: 50,
      y: 710,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p2.drawText('Either party is entitled to terminate this agreement subject to a notice period of 60 days.', {
      x: 50,
      y: 685,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'commercial-lease.pdf'), pdfBytes);
    console.log('Saved commercial-lease.pdf (2 pages)');
  }

  // 2. Service Contract with Payment Terms
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const p1 = doc.addPage([595.28, 841.89]);
    p1.drawText('MASTER SERVICES AGREEMENT', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.2, 0.4)
    });
    p1.drawText('This Agreement is effective as of October 15, 2024.', {
      x: 50,
      y: 745,
      size: 11,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Entered into between Apex Financial Corp ("Client") and CloudScale Technologies Ltd ("Contractor").', {
      x: 50,
      y: 720,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Contract Reference: MSA-2024-883', {
      x: 50,
      y: 695,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    p1.drawText('1. Milestones and Fees', {
      x: 50,
      y: 650,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p1.drawText('The total aggregate contract value is $75,000 USD.', {
      x: 50,
      y: 625,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('An initial retainer deposit of $15,000 shall be paid upon signing.', {
      x: 50,
      y: 600,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Milestone 1 compensation of $25,000 is payable within 30 days of completion.', {
      x: 50,
      y: 575,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    p1.drawText('2. Obligations & Penalties', {
      x: 50,
      y: 530,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p1.drawText('The Contractor agrees to deliver the project documentation no later than 15 December 2024.', {
      x: 50,
      y: 505,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Unexcused delivery failure shall result in liquidated damages of $200 per day.', {
      x: 50,
      y: 480,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'service-contract.pdf'), pdfBytes);
    console.log('Saved service-contract.pdf');
  }

  // 3. Vendor Invoice
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const p1 = doc.addPage([595.28, 841.89]);
    p1.drawText('TAX INVOICE', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.2, 0.4)
    });
    p1.drawText('Vendor: Office Supplies Superstore Pvt Ltd', {
      x: 50,
      y: 745,
      size: 11,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Customer: Zenith Consulting LLC', {
      x: 50,
      y: 720,
      size: 11,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Invoice No: INV-2024-8841    GSTIN: 27AABCT3518Q1Z5', {
      x: 50,
      y: 695,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });
    p1.drawText('Invoice Date: 2024-11-05    Payment Due Date: 2024-11-25', {
      x: 50,
      y: 670,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    p1.drawText('Line Items:', {
      x: 50,
      y: 625,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p1.drawText('Office Equipment Subtotal: $1,250.00', {
      x: 50,
      y: 600,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Tax & Handling: $225.00', {
      x: 50,
      y: 575,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Total Amount: $1,475.00', {
      x: 50,
      y: 550,
      size: 11,
      font: bold,
      color: rgb(0.1, 0.4, 0.1)
    });

    p1.drawText('Terms & Conditions:', {
      x: 50,
      y: 505,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p1.drawText('Purchaser must remit full payment on or before November 25, 2024.', {
      x: 50,
      y: 480,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Late payments shall incur a penalty fee of 1.5% per month.', {
      x: 50,
      y: 455,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    const pdfBytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'vendor-invoice.pdf'), pdfBytes);
    console.log('Saved vendor-invoice.pdf');
  }

  console.log('All Entity & Clause PDF fixtures successfully created!');
}

generateAll().catch(err => {
  console.error('Failed generating fixtures:', err);
  process.exit(1);
});
