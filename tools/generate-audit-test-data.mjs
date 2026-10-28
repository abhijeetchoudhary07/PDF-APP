import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts, PDFName, PDFDict, PDFString, PDFHexString } from 'pdf-lib';

const OUT_DIR = path.resolve('e2e/test-data/audit');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function generateAll() {
  console.log('Generating real PDF audit fixtures in:', OUT_DIR);

  // 1. Standard 1-page PDF (Vector text + shapes)
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4 Portrait
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    
    page.drawText('GOVERNMENT OF INDIA - OFFICIAL AUDIT SAMPLE', {
      x: 50,
      y: 780,
      size: 16,
      font: boldFont,
      color: rgb(0.1, 0.2, 0.4)
    });
    page.drawText('This is a standard 1-page document for verifying PDF tools.', {
      x: 50,
      y: 750,
      size: 11,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });
    page.drawRectangle({
      x: 50,
      y: 600,
      width: 495,
      height: 120,
      borderColor: rgb(0.2, 0.4, 0.8),
      borderWidth: 2,
      color: rgb(0.95, 0.97, 1.0)
    });
    page.drawText('Section 1: Applicant Verification & Data Integrity', {
      x: 65,
      y: 690,
      size: 13,
      font: boldFont,
      color: rgb(0.1, 0.3, 0.6)
    });
    page.drawText('All parameters: portrait orientation, vector typography, RGB geometry.', {
      x: 65,
      y: 660,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });
    
    const bytes = await doc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(OUT_DIR, 'standard-1page.pdf'), bytes);
    console.log('Created standard-1page.pdf:', bytes.length, 'bytes');
  }

  // 2. Multi-page PDF (55 pages, alternating portrait and landscape)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    
    for (let i = 1; i <= 55; i++) {
      const isLandscape = i % 5 === 0;
      const width = isLandscape ? 841.89 : 595.28;
      const height = isLandscape ? 595.28 : 841.89;
      const page = doc.addPage([width, height]);
      
      page.drawText(`Multi-page Audit Document - Page ${i} of 55`, {
        x: 50,
        y: height - 50,
        size: 14,
        font: boldFont,
        color: rgb(0.15, 0.25, 0.45)
      });
      page.drawText(`Orientation: ${isLandscape ? 'Landscape (A4-L)' : 'Portrait (A4-P)'}`, {
        x: 50,
        y: height - 80,
        size: 11,
        font,
        color: rgb(0.4, 0.4, 0.4)
      });
      page.drawRectangle({
        x: 50,
        y: height - 250,
        width: width - 100,
        height: 140,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 1,
        color: rgb(0.98, 0.98, 0.98)
      });
      page.drawText(`Content block for page ${i}. Stress test for multi-page batch rendering & memory sanity.`, {
        x: 70,
        y: height - 180,
        size: 10,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });
    }

    const bytes = await doc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(OUT_DIR, 'multipage-55pages.pdf'), bytes);
    console.log('Created multipage-55pages.pdf:', bytes.length, 'bytes');
  }

  // 3. Scanned image-based PDF (Simulating a scanned official receipt / record)
  {
    const doc = await PDFDocument.create();
    const photoBytes = fs.readFileSync('e2e/test-data/photos/valid-photo.jpg');
    const jpgImage = await doc.embedJpg(photoBytes);
    const page = doc.addPage([595, 842]);
    page.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: 595,
      height: 842
    });

    const bytes = await doc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(OUT_DIR, 'scanned-image.pdf'), bytes);
    console.log('Created scanned-image.pdf:', bytes.length, 'bytes');
  }

  // 4. Password-protected PDF (Protected with user password: TestPassword123!)
  {
    // Generate clean base doc
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([500, 500]);
    page.drawText('CONFIDENTIAL RESTRICTED DOCUMENT', {
      x: 60,
      y: 400,
      size: 16,
      font,
      color: rgb(0.8, 0.1, 0.1)
    });
    page.drawText('This file is encrypted with password: TestPassword123!', {
      x: 60,
      y: 350,
      size: 11,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });
    const baseBytes = await doc.save({ useObjectStreams: false });
    
    // Use our hardened encryption function
    const pdfText = new TextDecoder('latin1').decode(baseBytes);
    const trailerIdx = pdfText.lastIndexOf('trailer');
    const xrefIdx = pdfText.lastIndexOf('xref');
    const insertPoint = xrefIdx !== -1 && xrefIdx < trailerIdx ? xrefIdx : trailerIdx;
    const trailerEnd = pdfText.indexOf('>>', trailerIdx);

    const encryptObjStr = `\n10 0 obj\n<<\n  /Filter /Standard\n  /V 2\n  /R 3\n  /Length 128\n  /P -4\n  /O <28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a>\n  /U <28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a>\n>>\nendobj\n`;
    const beforeInsert = pdfText.slice(0, insertPoint);
    const middleSection = pdfText.slice(insertPoint, trailerEnd);
    const afterTrailerClose = pdfText.slice(trailerEnd);
    const injected = `${beforeInsert}${encryptObjStr}${middleSection}\n  /Encrypt 10 0 R\n  /ID [ <0123456789abcdef0123456789abcdef> <0123456789abcdef0123456789abcdef> ]\n${afterTrailerClose}`;
    fs.writeFileSync(path.join(OUT_DIR, 'password-protected.pdf'), Buffer.from(injected, 'latin1'));
    console.log('Created password-protected.pdf');
  }

  // 5. Large PDF (>20 MB)
  {
    console.log('Creating large-21mb.pdf (>20 MB)...');
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('High Volume Benchmark Document (>20 MB)', { x: 50, y: 700, size: 16, font });
    
    // Add raw uncompressed stream or high-volume content stream
    // Using pseudo-random bytes so FlateDecode does not over-compress it
    const randomChunk = Buffer.alloc(21 * 1024 * 1024);
    for (let i = 0; i < randomChunk.length; i += 4) {
      randomChunk.writeUInt32LE((Math.random() * 0xffffffff) >>> 0, i);
    }
    const rawStream = doc.context.stream(randomChunk);
    const streamRef = doc.context.register(rawStream);
    page.node.set(PDFName.of('LargePayload'), streamRef);

    const bytes = await doc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(OUT_DIR, 'large-21mb.pdf'), bytes);
    console.log('Created large-21mb.pdf:', (bytes.length / (1024 * 1024)).toFixed(2), 'MB');
  }

  // 6. Security Fixture: 0-Byte PDF
  {
    fs.writeFileSync(path.join(OUT_DIR, 'corrupt-zero-byte.pdf'), Buffer.alloc(0));
    console.log('Created corrupt-zero-byte.pdf (0 bytes)');
  }

  // 7. Security Fixture: Corrupted header & truncated xref
  {
    fs.writeFileSync(path.join(OUT_DIR, 'corrupt-truncated.pdf'), Buffer.from('NOT_A_PDF_CONTENT_STREAM_CORRUPT_BYTES_XYZ123'));
    console.log('Created corrupt-truncated.pdf');
  }

  // 8. Security Fixture: Malicious JavaScript in /OpenAction & /AA
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Document with Embedded JavaScript Payload', { x: 30, y: 350, size: 12, font });

    // Inject malicious JavaScript /OpenAction
    const jsActionDict = doc.context.obj({
      Type: 'Action',
      S: 'JavaScript',
      JS: PDFString.of("app.alert('XSS Exploit Attempt - Malicious Script Executed!');")
    });
    const jsActionRef = doc.context.register(jsActionDict);
    doc.catalog.set(PDFName.of('OpenAction'), jsActionRef);

    // Also inject Document /AA (Additional Actions on Open)
    const aaDict = doc.context.obj({
      O: jsActionRef
    });
    doc.catalog.set(PDFName.of('AA'), doc.context.register(aaDict));

    const bytes = await doc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(OUT_DIR, 'malicious-js.pdf'), bytes);
    console.log('Created malicious-js.pdf:', bytes.length, 'bytes');
  }

  // 9. Security Fixture: PDF bomb (High ratio decompression / recursive structure)
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    // Create nested FlateDecode stream
    const bombData = Buffer.alloc(5 * 1024 * 1024, 0x00); // 5 MB of zeroes compressed tightly to ~5 KB
    const stream = doc.context.flateStream(bombData);
    const streamRef = doc.context.register(stream);
    page.node.set(PDFName.of('DecompressionBombPayload'), streamRef);

    const bytes = await doc.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(OUT_DIR, 'pdf-bomb.pdf'), bytes);
    console.log('Created pdf-bomb.pdf:', bytes.length, 'bytes');
  }

  console.log('All audit test fixtures generated successfully!');
}

generateAll().catch(err => {
  console.error('Failed to generate fixtures:', err);
  process.exit(1);
});
