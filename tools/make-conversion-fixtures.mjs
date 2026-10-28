/**
 * Builds the fixtures the Part J (conversion) e2e suite runs against.
 *
 * They are generated rather than committed by hand because the interesting
 * ones are binary — a structured PDF whose font sizes actually form a heading
 * hierarchy, and an .eml carrying a base64 PDF attachment — and a hand-edited
 * copy of either drifts out of sync with what the test asserts.
 *
 * Run:  node tools/make-conversion-fixtures.mjs
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pdfDir = path.join(root, 'e2e/test-data/pdf');
const convDir = path.join(root, 'e2e/test-data/conversion');

fs.mkdirSync(pdfDir, { recursive: true });
fs.mkdirSync(convDir, { recursive: true });

/**
 * A two-page PDF with a real font-size hierarchy, a bullet, a numbered item,
 * a bare URL and a two-column table — the things J1/J2/J3 claim to detect.
 */
async function makeStructuredPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page1 = doc.addPage([595.28, 841.89]);
  page1.drawText('Quarterly Filing Guide', { x: 50, y: 780, size: 24, font: bold });
  page1.drawText('Section One: Eligibility', { x: 50, y: 735, size: 16, font: bold });
  page1.drawText('Applicants must hold a valid identity document issued in the', {
    x: 50, y: 700, size: 11, font
  });
  page1.drawText('current financial year before submitting this form.', {
    x: 50, y: 684, size: 11, font
  });
  page1.drawText('• Proof of address', { x: 50, y: 650, size: 11, font });
  page1.drawText('• Recent passport photograph', { x: 50, y: 632, size: 11, font });
  page1.drawText('1. Complete every mandatory field', { x: 50, y: 600, size: 11, font });
  page1.drawText('2. Attach the supporting documents', { x: 50, y: 582, size: 11, font });
  page1.drawText('Full rules at https://example.com/filing-rules for reference.', {
    x: 50, y: 548, size: 11, font, color: rgb(0, 0, 0.8)
  });

  // Table: aligned columns across three rows so the extractor sees a table.
  const cols = [50, 220, 390];
  const headers = ['Document', 'Required', 'Copies'];
  headers.forEach((h, i) => page1.drawText(h, { x: cols[i], y: 500, size: 10, font: bold }));
  const rows = [
    ['Identity card', 'Yes', '2'],
    ['Address proof', 'Yes', '1'],
    ['Photograph', 'Optional', '4']
  ];
  rows.forEach((row, r) => {
    row.forEach((cell, i) =>
      page1.drawText(cell, { x: cols[i], y: 472 - r * 24, size: 10, font })
    );
  });

  const page2 = doc.addPage([595.28, 841.89]);
  page2.drawText('Section Two: Submission', { x: 50, y: 780, size: 16, font: bold });
  page2.drawText('Submit the completed set at any designated collection centre.', {
    x: 50, y: 740, size: 11, font
  });
  page2.drawText('Processing takes up to fifteen working days from receipt.', {
    x: 50, y: 724, size: 11, font
  });

  const bytes = await doc.save();
  const out = path.join(pdfDir, 'structured-doc.pdf');
  fs.writeFileSync(out, bytes);
  return out;
}

/** A one-page PDF used as an email attachment, so merging is observable. */
async function makeAttachmentPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('Attached Report Page', { x: 60, y: 760, size: 14, font });
  return Buffer.from(await doc.save()).toString('base64');
}

/**
 * An .eml with everything J5 names: a cid: inline image, a remote image that
 * must not be fetched, a PDF attachment to merge and a text attachment to list.
 */
async function makeRichEml() {
  const attachmentPdfB64 = await makeAttachmentPdf();
  // 1x1 transparent PNG.
  const pngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const eml = [
    'From: filings@indianformhelper.local',
    'To: applicant@example.com, reviewer@example.com',
    'Cc: records@example.com',
    'Subject: Filing receipt and supporting documents',
    'Date: Mon, 20 Oct 2026 10:00:00 +0000',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="OUTER"',
    '',
    '--OUTER',
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    '<p>Your filing has been received.</p>',
    '<p>Office stamp: <img src="cid:office_stamp" /></p>',
    '<p>Tracking pixel: <img src="https://tracker.example.com/pixel.png" /></p>',
    '<p>Keep this receipt for your records.</p>',
    '',
    '--OUTER',
    'Content-Type: image/png; name="stamp.png"',
    'Content-ID: <office_stamp>',
    'Content-Disposition: inline; filename="stamp.png"',
    'Content-Transfer-Encoding: base64',
    '',
    pngB64,
    '--OUTER',
    'Content-Type: application/pdf; name="report.pdf"',
    'Content-Disposition: attachment; filename="report.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    attachmentPdfB64,
    '--OUTER',
    'Content-Type: text/plain; name="notes.txt"',
    'Content-Disposition: attachment; filename="notes.txt"',
    'Content-Transfer-Encoding: 7bit',
    '',
    'Supplementary notes for the reviewer.',
    '--OUTER--',
    ''
  ].join('\n');

  const out = path.join(convDir, 'rich-message.eml');
  fs.writeFileSync(out, eml, 'utf8');
  return out;
}

/**
 * A .msg in the MIME form the converter falls back to when the file is not an
 * OLE compound document. A genuine Outlook binary cannot be produced here, and
 * this exercises the same header/body/attachment path.
 */
function makeMsg() {
  const msg = [
    'From: Registrar <registrar@example.com>',
    'To: applicant@example.com',
    'Subject: Outlook message export',
    'Date: Mon, 20 Oct 2026 12:00:00 +0000',
    'Content-Type: text/plain; charset="utf-8"',
    '',
    'This message was exported from Outlook.',
    'It carries no attachments.',
    ''
  ].join('\n');

  const out = path.join(convDir, 'sample.msg');
  fs.writeFileSync(out, msg, 'utf8');
  return out;
}

/**
 * Devanagari markdown. The built-in PDF fonts cannot draw these glyphs, so the
 * conversion must still succeed and say what it left out rather than fail.
 */
function makeHindiMarkdown() {
  const md = [
    '# आवेदन निर्देश',
    '',
    'This paragraph is in English and must survive intact.',
    '',
    'यह पैराग्राफ हिंदी में है।',
    '',
    '- Address proof',
    '- पहचान पत्र',
    ''
  ].join('\n');

  const out = path.join(convDir, 'hindi-notes.md');
  fs.writeFileSync(out, md, 'utf8');
  return out;
}

/** Markdown with a line far wider than the page, to prove it wraps. */
function makeWideMarkdown() {
  const longValue = 'x'.repeat(400);
  const md = [
    '# Wide Content',
    '',
    '```',
    `const token = "${longValue}";`,
    '```',
    '',
    `A paragraph containing one extremely long unbroken token: ${longValue}`,
    ''
  ].join('\n');

  const out = path.join(convDir, 'wide-content.md');
  fs.writeFileSync(out, md, 'utf8');
  return out;
}

/**
 * A minimal but genuine .docx carrying Hindi and English, for the Word branch.
 * Built here rather than in the unit suite because mammoth's Node build has no
 * arrayBuffer input -- only the browser build the app ships can read it.
 */
async function makeHindiDocx() {
  const { default: JSZip } = await import('jszip');
  const hindi = '\u0906\u0935\u0947\u0926\u0928 \u0928\u093f\u0930\u094d\u0926\u0947\u0936';

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      `<w:p><w:r><w:t>${hindi}</w:t></w:r></w:p>` +
      '<w:p><w:r><w:t>This English paragraph must survive intact.</w:t></w:r></w:p>' +
      '</w:body></w:document>'
  );

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const out = path.join(convDir, 'hindi-document.docx');
  fs.writeFileSync(out, buf);
  return out;
}

const written = [
  await makeStructuredPdf(),
  await makeRichEml(),
  makeMsg(),
  makeHindiMarkdown(),
  makeWideMarkdown(),
  await makeHindiDocx()
];

for (const f of written) {
  console.log('wrote', path.relative(root, f), `(${fs.statSync(f).size} bytes)`);
}
