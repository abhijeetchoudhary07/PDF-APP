const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function generateAllTestData() {
  const baseDir = path.resolve(__dirname, '../test-data');
  const pdfDir = path.join(baseDir, 'pdf');
  const photoDir = path.join(baseDir, 'photos');
  const sigDir = path.join(baseDir, 'signatures');
  const scannerDir = path.join(baseDir, 'scanner');

  [pdfDir, photoDir, sigDir, scannerDir].forEach(d => {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  });

  console.log('Generating PDF test fixtures...');

  // 1. text.pdf - Valid PDF with selectable digital text
  const doc1 = await PDFDocument.create();
  const font = await doc1.embedFont(StandardFonts.Helvetica);
  const page1 = doc1.addPage([595, 842]);
  page1.drawText('This is digital selectable text in a PDF document.', { x: 50, y: 750, size: 16, font });
  page1.drawText('Indian Form Helper Document Processor Phase 1.', { x: 50, y: 720, size: 12, font });
  page1.drawText('Applicant Name: John Doe | Roll No: 12345678', { x: 50, y: 690, size: 12, font });
  const textPdfBytes = await doc1.save();
  fs.writeFileSync(path.join(pdfDir, 'text.pdf'), textPdfBytes);

  // 2. scanned.pdf - 1 page with simulated scanned page
  const doc2 = await PDFDocument.create();
  const page2 = doc2.addPage([595, 842]);
  page2.drawRectangle({
    x: 40,
    y: 100,
    width: 515,
    height: 700,
    color: rgb(0.96, 0.96, 0.94),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1
  });
  const scannedPdfBytes = await doc2.save();
  fs.writeFileSync(path.join(pdfDir, 'scanned.pdf'), scannedPdfBytes);

  // 3. scanned-multipage.pdf - 3 pages
  const doc3 = await PDFDocument.create();
  for (let i = 1; i <= 3; i++) {
    const p = doc3.addPage([595, 842]);
    p.drawRectangle({
      x: 40,
      y: 100,
      width: 515,
      height: 700,
      color: rgb(0.97, 0.97, 0.95),
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1
    });
    p.drawText(`Page ${i} Scanned Document Content`, { x: 50, y: 750, size: 14, font });
  }
  const multiPdfBytes = await doc3.save();
  fs.writeFileSync(path.join(pdfDir, 'scanned-multipage.pdf'), multiPdfBytes);

  // 4. hindi.pdf, marathi.pdf, bengali.pdf, punjabi.pdf, mixed-language.pdf
  for (const lang of ['hindi', 'marathi', 'bengali', 'punjabi', 'mixed-language']) {
    const d = await PDFDocument.create();
    const p = d.addPage([595, 842]);
    p.drawText(`Document in ${lang} language representation`, { x: 50, y: 750, size: 14, font });
    const bytes = await d.save();
    fs.writeFileSync(path.join(pdfDir, `${lang}.pdf`), bytes);
  }

  // 5. unreadable.pdf, corrupt.pdf, unsupported.txt
  const docUnreadable = await PDFDocument.create();
  docUnreadable.addPage([595, 842]);
  fs.writeFileSync(path.join(pdfDir, 'unreadable.pdf'), await docUnreadable.save());
  fs.writeFileSync(path.join(pdfDir, 'corrupt.pdf'), Buffer.from('%PDF-1.4\n%%EOF\nGARBAGE_BYTES_CORRUPTED_FILE_DATA'));
  fs.writeFileSync(path.join(pdfDir, 'unsupported.txt'), Buffer.from('This is a plain text file, not a PDF.'));

  console.log('Generating image test fixtures...');

  // Minimal 1x1 JPEG buffer
  const minimalJpgHeader = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0xc2,
    0x01, 0x5e, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9
  ]);

  // Valid photo (~35 KB)
  const validPhotoBuf = Buffer.concat([minimalJpgHeader, Buffer.alloc(35000, 0x20), Buffer.from([0xff, 0xd9])]);
  fs.writeFileSync(path.join(photoDir, 'valid-photo.jpg'), validPhotoBuf);

  // Oversized photo (~120 KB)
  const oversizedPhotoBuf = Buffer.concat([minimalJpgHeader, Buffer.alloc(120000, 0x20), Buffer.from([0xff, 0xd9])]);
  fs.writeFileSync(path.join(photoDir, 'oversized-photo.jpg'), oversizedPhotoBuf);

  // Small photo (< 10 KB)
  const smallPhotoBuf = Buffer.concat([minimalJpgHeader, Buffer.alloc(4000, 0x20), Buffer.from([0xff, 0xd9])]);
  fs.writeFileSync(path.join(photoDir, 'small-photo.jpg'), smallPhotoBuf);

  fs.writeFileSync(path.join(photoDir, 'wrong-ratio.jpg'), validPhotoBuf);
  fs.writeFileSync(path.join(photoDir, 'wrong-dimensions.jpg'), validPhotoBuf);
  fs.writeFileSync(path.join(photoDir, 'unsupported-photo.gif'), Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;'));

  // Signatures
  const validSigBuf = Buffer.concat([minimalJpgHeader, Buffer.alloc(15000, 0x20), Buffer.from([0xff, 0xd9])]);
  fs.writeFileSync(path.join(sigDir, 'valid-signature.jpg'), validSigBuf);

  const invalidSizeSigBuf = Buffer.concat([minimalJpgHeader, Buffer.alloc(80000, 0x20), Buffer.from([0xff, 0xd9])]);
  fs.writeFileSync(path.join(sigDir, 'invalid-size.jpg'), invalidSizeSigBuf);
  fs.writeFileSync(path.join(sigDir, 'invalid-ratio.jpg'), validSigBuf);
  fs.writeFileSync(path.join(sigDir, 'invalid-format.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));

  // Scanner images
  fs.writeFileSync(path.join(scannerDir, 'clean-document.jpg'), validPhotoBuf);
  fs.writeFileSync(path.join(scannerDir, 'tilted-document.jpg'), validPhotoBuf);
  fs.writeFileSync(path.join(scannerDir, 'perspective-document.jpg'), validPhotoBuf);
  fs.writeFileSync(path.join(scannerDir, 'low-light-document.jpg'), validPhotoBuf);
  fs.writeFileSync(path.join(scannerDir, 'shadow-document.jpg'), validPhotoBuf);
  fs.writeFileSync(path.join(scannerDir, 'noisy-document.jpg'), validPhotoBuf);
  fs.writeFileSync(path.join(scannerDir, 'no-edge-document.jpg'), validPhotoBuf);

  console.log('Successfully generated all test fixtures in e2e/test-data!');
}

generateAllTestData().catch(err => {
  console.error('Error generating test data:', err);
  process.exit(1);
});
