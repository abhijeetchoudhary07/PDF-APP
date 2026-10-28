import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, Packer } from 'docx';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, '../e2e/test-data/conversion-audit');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating conversion audit test fixtures in:', outDir);

async function generateAll() {
  // 1. Valid Formatted DOCX with Heading, Paragraphs, and Table
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          text: 'Annual Performance & Compliance Report',
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Executive Summary: ', bold: true }),
            new TextRun('This document validates client-side offline conversion fidelity. All components are processed locally without external egress.')
          ],
          spacing: { after: 200 }
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: 'Metric', bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: 'Target', bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: 'Status', bold: true })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: 'Client Offline Processing' })] }),
                new TableCell({ children: [new Paragraph({ text: '100%' })] }),
                new TableCell({ children: [new Paragraph({ text: 'Verified' })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: 'Zero Network Egress' })] }),
                new TableCell({ children: [new Paragraph({ text: '0 KB' })] }),
                new TableCell({ children: [new Paragraph({ text: 'Enforced' })] })
              ]
            })
          ]
        })
      ]
    }]
  });
  const docxBuffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(outDir, 'sample-formatted.docx'), docxBuffer);
  console.log('Created sample-formatted.docx');

  // 2. Multi-Sheet Complex Excel Workbook
  const wb = XLSX.utils.book_new();
  const summaryData = [
    ['Quarter', 'Revenue ($M)', 'Expenses ($M)', 'Margin (%)', 'Compliance Grade'],
    ['Q1', '12.4', '8.1', '34.6%', 'A+'],
    ['Q2', '14.8', '9.2', '37.8%', 'A'],
    ['Q3', '16.5', '10.0', '39.4%', 'A+'],
    ['Q4', '19.2', '11.5', '40.1%', 'A+']
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Financial Overview');

  const regionalData = [
    ['Region', 'Branch Code', 'Active Users', 'Audit Status'],
    ['North America', 'NA-101', '45,200', 'Passed'],
    ['Europe West', 'EU-204', '38,900', 'Passed'],
    ['Asia Pacific', 'AP-308', '62,100', 'Passed'],
    ['Latin America', 'LA-402', '18,500', 'Passed']
  ];
  const wsRegional = XLSX.utils.aoa_to_sheet(regionalData);
  XLSX.utils.book_append_sheet(wb, wsRegional, 'Regional Breakdown');

  const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  fs.writeFileSync(path.join(outDir, 'sample-multisheet.xlsx'), xlsxBuffer);
  console.log('Created sample-multisheet.xlsx');

  // 3. PowerPoint Presentation Deck
  const pptx = new pptxgen();
  const slide1 = pptx.addSlide();
  slide1.addText('Document Conversion Security & Fidelity Suite', { x: 1, y: 1.5, fontSize: 24, bold: true, color: '1f2937' });
  slide1.addText('Client-Side High Assurance Engine', { x: 1, y: 2.3, fontSize: 16, color: '4b5563' });

  const slide2 = pptx.addSlide();
  slide2.addText('Core Architecture Highlights', { x: 0.8, y: 0.8, fontSize: 20, bold: true, color: '1f2937' });
  slide2.addText([
    { text: '100% Offline execution without server dependencies\n', options: { bullet: true, fontSize: 14 } },
    { text: 'Native sandboxing protecting against SSRF and XXE\n', options: { bullet: true, fontSize: 14 } },
    { text: 'Deterministic layout preservation and typography fallback\n', options: { bullet: true, fontSize: 14 } }
  ], { x: 0.8, y: 1.6, w: 8, h: 4 });

  const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' });
  fs.writeFileSync(path.join(outDir, 'sample-presentation.pptx'), pptxBuffer);
  console.log('Created sample-presentation.pptx');

  // 4. Raw Text with Special Characters & Hindi UTF-8 script
  const textHindi = `Offline Document Converter Verification
========================================
Language: English & हिन्दी (Hindi)
Date: 2026-10-28

Overview:
The system supports multilingual document intake and graceful fallback for fonts.

Hindi Verification Block:
नमस्ते दुनिया! यह एक सुरक्षित ऑफ़लाइन दस्तावेज़ रूपांतरण प्रणाली है।
भारत सरकार के डिजिटल नियमों के अनुसार सभी डेटा स्थानीय रूप से संसाधित होता है।

Bullet Points:
* Section 1: Data Integrity
* Section 2: Privacy Assurance
* Section 3: Performance Benchmarks
`;
  fs.writeFileSync(path.join(outDir, 'sample-unicode-hindi.txt'), textHindi, 'utf8');
  console.log('Created sample-unicode-hindi.txt');

  // 5. CSV with Special Characters & Regional Scripts
  const csvRegional = `"ID","Employee Name","Department","City","Designation (पद)","Security Clearance"
"EMP001","Rajesh Sharma (राजेश शर्मा)","Cybersecurity","New Delhi","Lead Auditor","Top Secret"
"EMP002","Priya Patel (प्रिया पटेल)","Data Governance","Mumbai","Compliance Officer","Confidential"
"EMP003","Amit Kumar (अमित कुमार)","Infrastructure","Bengaluru","Systems Architect","Secret"
"EMP004","Sneha Reddy (स्नेहा रेड्डी)","Quality Engineering","Hyderabad","Staff QA","Secret"
`;
  fs.writeFileSync(path.join(outDir, 'sample-regional.csv'), csvRegional, 'utf8');
  console.log('Created sample-regional.csv');

  // 6. Messy HTML with styles, nested divs, tables, and harmless markup
  const messyHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Corporate Policy & Operations Manual</title>
  <style>body { font-family: sans-serif; } .badge { color: blue; }</style>
</head>
<body>
  <h1>Corporate Policy Manual</h1>
  <div class="container" style="padding: 10px; border: 1px solid #ccc;">
    <p>This manual defines the governance requirements for offline applications.</p>
    <div class="inner-box">
      <h2>Section 4.1: Data Governance</h2>
      <p>Data must remain strictly within user-controlled memory boundaries.</p>
      <table border="1" cellpadding="6" cellspacing="0" style="width: 100%;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th>Rule ID</th>
            <th>Requirement</th>
            <th>Impact</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>SEC-01</td>
            <td>Zero External Requests</td>
            <td>Critical</td>
          </tr>
          <tr>
            <td>SEC-02</td>
            <td>Memory Buffer Cleanup</td>
            <td>High</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'sample-messy.html'), messyHtml, 'utf8');
  console.log('Created sample-messy.html');

  // 7. Structured JSON File
  const structuredJson = JSON.stringify({
    system: "PDF Document Studio",
    version: "2.5.0",
    securityAudit: {
      timestamp: "2026-10-28T00:00:00Z",
      status: "PASSED",
      engine: "Client-Side WASM / WebWorker",
      features: [
        { name: "Word to PDF", status: "Active", maxFileSizeMB: 50 },
        { name: "Excel to PDF", status: "Active", maxFileSizeMB: 50 },
        { name: "PPT to PDF", status: "Active", maxFileSizeMB: 50 },
        { name: "HTML to PDF", status: "Active", maxFileSizeMB: 20 },
        { name: "CSV to PDF", status: "Active", maxFileSizeMB: 20 }
      ],
      hardening: {
        xxeProtection: true,
        ssrfProtection: true,
        polyglotCheck: true,
        recursionDepthLimit: 64
      }
    }
  }, null, 2);
  fs.writeFileSync(path.join(outDir, 'sample-structured.json'), structuredJson, 'utf8');
  console.log('Created sample-structured.json');

  // 8. Valid XML File
  const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<auditReport generated="2026-10-28">
  <systemName>PDF Tools Engine</systemName>
  <environment>Offline Client</environment>
  <controls>
    <control id="CTL-01" category="Integrity">Passed</control>
    <control id="CTL-02" category="Authentication">Passed</control>
    <control id="CTL-03" category="Privacy">Passed</control>
  </controls>
</auditReport>`;
  fs.writeFileSync(path.join(outDir, 'sample-valid.xml'), validXml, 'utf8');
  console.log('Created sample-valid.xml');

  // 9. Benign XXE Attack Payload (Simulated offensive test)
  const xxeXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE root [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>
  <data>&xxe;</data>
</root>`;
  fs.writeFileSync(path.join(outDir, 'xxe-attack.xml'), xxeXml, 'utf8');
  console.log('Created xxe-attack.xml');

  // 10. Benign SSRF Attack Payload (Simulated offensive test)
  const ssrfHtml = `<!DOCTYPE html>
<html>
<body>
  <h1>Security Probe Document</h1>
  <p>Attempting SSRF via image and frame tags to cloud metadata:</p>
  <img src="http://169.254.169.254/latest/meta-data/identity-credentials" alt="probe" />
  <img src="http://127.0.0.1:8080/admin/delete" alt="loopback probe" />
  <script>alert('malicious script execution attempt');</script>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'ssrf-attack.html'), ssrfHtml, 'utf8');
  console.log('Created ssrf-attack.html');

  // 11. Polyglot Shell Script Disguised as .docx
  const polyglotDocx = `#!/bin/bash
# Disguised shell script payload
echo "Malicious payload executing on host"
rm -rf /tmp/test-artifact
exit 0
`;
  fs.writeFileSync(path.join(outDir, 'polyglot-script.docx'), polyglotDocx, 'utf8');
  console.log('Created polyglot-script.docx');

  // 12. Deeply Nested Element Bomb (Call Stack Overflow Test)
  let nested = '<div>Test start';
  for (let i = 0; i < 500; i++) {
    nested += '<div>nested';
  }
  nested += ' deepest content ';
  for (let i = 0; i < 500; i++) {
    nested += '</div>';
  }
  nested += '</div>';
  fs.writeFileSync(path.join(outDir, 'nested-overflow.html'), nested, 'utf8');
  console.log('Created nested-overflow.html');

  // 13. Baseline Multi-Page PDF with Selectable Text and Tables (for PDF -> Format conversions)
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Page 1
  const page1 = pdfDoc.addPage([595.28, 841.89]);
  page1.drawText('Document Studio Conversion Benchmark', { x: 50, y: 790, size: 18, font: boldFont, color: rgb(0.1, 0.2, 0.4) });
  page1.drawText('This document verifies reverse conversions: PDF to Word, Excel, Markdown, and HTML.', { x: 50, y: 760, size: 11, font, color: rgb(0.2, 0.2, 0.2) });

  page1.drawText('Section 1: Tabular Dataset', { x: 50, y: 720, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  page1.drawText('Item Code      Description              Qty      Unit Price      Total Amount', { x: 50, y: 690, size: 10, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
  page1.drawText('ITM-001        Enterprise PDF Engine      2        $450.00         $900.00', { x: 50, y: 670, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  page1.drawText('ITM-002        Offline OCR Module         1        $250.00         $250.00', { x: 50, y: 650, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  page1.drawText('ITM-003        Security Hardening Pack    1        $350.00         $350.00', { x: 50, y: 630, size: 10, font, color: rgb(0.3, 0.3, 0.3) });

  // Page 2
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  page2.drawText('Section 2: Verification Checklist', { x: 50, y: 790, size: 16, font: boldFont, color: rgb(0.1, 0.2, 0.4) });
  page2.drawText('•  Zero external network dependencies verified.', { x: 60, y: 750, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
  page2.drawText('•  Memory leak mitigation and loadingTask destruction.', { x: 60, y: 730, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
  page2.drawText('•  Sanitization of SSRF and XXE injection vectors.', { x: 60, y: 710, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
  page2.drawText('•  Full Playwright E2E verification across viewports.', { x: 60, y: 690, size: 11, font, color: rgb(0.2, 0.2, 0.2) });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(path.join(outDir, 'sample-multi-page.pdf'), pdfBytes);
  console.log('Created sample-multi-page.pdf');

  console.log('All 13 conversion audit fixtures created successfully.');
}

generateAll().catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
