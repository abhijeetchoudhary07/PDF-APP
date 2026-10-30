import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const OUT_DIR = path.resolve('e2e/test-data/multi-qa');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function generateAll() {
  console.log('Generating Multi-Document Q&A PDF fixtures in:', OUT_DIR);

  // 1. HR Policy Document (Multi-page)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    // Page 1
    const p1 = doc.addPage([595.28, 841.89]);
    p1.drawText('Global Corporate HR Leave & Benefits Policy 2026', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.2, 0.4)
    });
    p1.drawText('Section 1: General Leave Entitlements and Vacation Rules', {
      x: 50,
      y: 740,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p1.drawText('All full-time permanent employees are allocated 20 days of paid vacation per calendar year.', {
      x: 50,
      y: 710,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Vacation requests exceeding 5 consecutive days require supervisor approval at least two weeks in advance.', {
      x: 50,
      y: 690,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    p1.drawText('Section 2: Parental and Paternity Leave Provisions', {
      x: 50,
      y: 640,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p1.drawText('New fathers are entitled to 15 days of paid paternity leave upon the birth or legal adoption of a child.', {
      x: 50,
      y: 610,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p1.drawText('Primary caregivers receive 26 weeks of paid maternity leave in accordance with national labor standards.', {
      x: 50,
      y: 590,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    // Page 2
    const p2 = doc.addPage([595.28, 841.89]);
    p2.drawText('Global Corporate HR Policy: Health & Insurance Coverage', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.2, 0.4)
    });
    p2.drawText('Section 3: Medical Insurance and Hospitalization Reimbursement', {
      x: 50,
      y: 740,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    p2.drawText('Comprehensive medical insurance coverage provides hospitalization reimbursement up to 500000 INR per family unit annually.', {
      x: 50,
      y: 710,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    p2.drawText('Dental and optical outpatient expenses are covered up to a cap of 25000 INR per fiscal year.', {
      x: 50,
      y: 690,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'hr-policy-2026.pdf'), bytes);
    console.log('Created hr-policy-2026.pdf');
  }

  // 2. Technical Manual Document
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const page = doc.addPage([595.28, 841.89]);
    page.drawText('Cloud Infrastructure Architecture & Technical Manual', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.3, 0.2)
    });

    page.drawText('Chapter 1: Kubernetes Cluster Deployment and Network Ports', {
      x: 50,
      y: 740,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    page.drawText('Production Kubernetes ingress controllers listen strictly on secure port 8443 with TLS mutual authentication.', {
      x: 50,
      y: 710,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    page.drawText('Unencrypted HTTP port 80 traffic is rejected or automatically redirected to HTTPS 443.', {
      x: 50,
      y: 690,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    page.drawText('Chapter 2: Distributed Cache and High Availability Thresholds', {
      x: 50,
      y: 640,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    page.drawText('The Redis caching tier enforces a default session TTL of 3600 seconds across all stateless microservices.', {
      x: 50,
      y: 610,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    page.drawText('High availability failover triggers automatically when the health monitor detects 3 consecutive node drops.', {
      x: 50,
      y: 590,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'technical-manual.pdf'), bytes);
    console.log('Created technical-manual.pdf');
  }

  // 3. Financial Report Document
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const page = doc.addPage([595.28, 841.89]);
    page.drawText('Executive Financial Report & Quarterly Performance Q3', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: rgb(0.4, 0.15, 0.1)
    });

    page.drawText('Section A: Operating Revenue and EBITDA Highlights', {
      x: 50,
      y: 740,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    page.drawText('Quarterly operating revenue reached 45 million INR representing strong organic market adoption.', {
      x: 50,
      y: 710,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    page.drawText('Operational efficiency improvements propelled EBITDA growth of 24.5 percent year over year.', {
      x: 50,
      y: 690,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    page.drawText('Section B: Capital Expenditure and Investment Allocation', {
      x: 50,
      y: 640,
      size: 12,
      font: bold,
      color: rgb(0.2, 0.2, 0.2)
    });
    page.drawText('Capital expenditure allocated for AI infrastructure and cloud GPU compute is 8 million INR.', {
      x: 50,
      y: 610,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });
    page.drawText('Net operating cash flow remained positive at 14 million INR for the fiscal quarter ending September.', {
      x: 50,
      y: 590,
      size: 10,
      font,
      color: rgb(0.15, 0.15, 0.15)
    });

    const bytes = await doc.save();
    fs.writeFileSync(path.join(OUT_DIR, 'financial-report.pdf'), bytes);
    console.log('Created financial-report.pdf');
  }

  console.log('All 3 Multi-Document Q&A fixtures generated successfully!');
}

generateAll().catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
