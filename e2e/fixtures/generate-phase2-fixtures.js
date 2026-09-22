const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts, PDFName, PDFString, PDFArray, PDFDict } = require('pdf-lib');

async function generatePhase2Fixtures() {
  const targetDir = path.resolve(__dirname, '../test-data/phase2');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log('Generating Phase 2 Deterministic Test Fixtures...');

  // Helper minimal 1x1 valid PNG
  const minimalPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ]);

  // ==========================================
  // 1. COMPARE FIXTURES
  // ==========================================

  // A. Identical PDFs
  const docIdentical1 = await PDFDocument.create();
  const font1 = await docIdentical1.embedFont(StandardFonts.Helvetica);
  const pId1 = docIdentical1.addPage([595, 842]);
  pId1.drawText('Document Comparison Benchmark.\nThis is identical content on page 1.', { x: 50, y: 750, font: font1, size: 14 });
  const identicalBytes = await docIdentical1.save();
  fs.writeFileSync(path.join(targetDir, 'identical-original.pdf'), identicalBytes);
  fs.writeFileSync(path.join(targetDir, 'identical-modified.pdf'), identicalBytes);

  // B. Text Added
  const docTextAddedOrig = await PDFDocument.create();
  const fAdd = await docTextAddedOrig.embedFont(StandardFonts.Helvetica);
  const pAddO = docTextAddedOrig.addPage([595, 842]);
  pAddO.drawText('Line one of the contract agreement.', { x: 50, y: 750, font: fAdd, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'text-added-original.pdf'), await docTextAddedOrig.save());

  const docTextAddedMod = await PDFDocument.create();
  const fAddM = await docTextAddedMod.embedFont(StandardFonts.Helvetica);
  const pAddM = docTextAddedMod.addPage([595, 842]);
  pAddM.drawText('Line one of the contract agreement. Additional clause for liability has been inserted here.', { x: 50, y: 750, font: fAddM, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'text-added-modified.pdf'), await docTextAddedMod.save());

  // C. Text Removed
  const docTextRemOrig = await PDFDocument.create();
  const fRem = await docTextRemOrig.embedFont(StandardFonts.Helvetica);
  const pRemO = docTextRemOrig.addPage([595, 842]);
  pRemO.drawText('Standard operating procedure. Obsolete section to be removed. End of document.', { x: 50, y: 750, font: fRem, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'text-removed-original.pdf'), await docTextRemOrig.save());

  const docTextRemMod = await PDFDocument.create();
  const fRemM = await docTextRemMod.embedFont(StandardFonts.Helvetica);
  const pRemM = docTextRemMod.addPage([595, 842]);
  pRemM.drawText('Standard operating procedure. End of document.', { x: 50, y: 750, font: fRemM, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'text-removed-modified.pdf'), await docTextRemMod.save());

  // D. Text Changed
  const docTextChgOrig = await PDFDocument.create();
  const fChg = await docTextChgOrig.embedFont(StandardFonts.Helvetica);
  const pChgO = docTextChgOrig.addPage([595, 842]);
  pChgO.drawText('The total fee is 1000 rupees payable immediately.', { x: 50, y: 750, font: fChg, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'text-changed-original.pdf'), await docTextChgOrig.save());

  const docTextChgMod = await PDFDocument.create();
  const fChgM = await docTextChgMod.embedFont(StandardFonts.Helvetica);
  const pChgM = docTextChgMod.addPage([595, 842]);
  pChgM.drawText('The total fee is 5000 rupees payable immediately.', { x: 50, y: 750, font: fChgM, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'text-changed-modified.pdf'), await docTextChgMod.save());

  // E. Page Added
  const docPgAddOrig = await PDFDocument.create();
  const fPg = await docPgAddOrig.embedFont(StandardFonts.Helvetica);
  const p1 = docPgAddOrig.addPage([595, 842]);
  p1.drawText('Original Page One Content', { x: 50, y: 750, font: fPg, size: 14 });
  const p2 = docPgAddOrig.addPage([595, 842]);
  p2.drawText('Original Page Two Content', { x: 50, y: 750, font: fPg, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'page-added-original.pdf'), await docPgAddOrig.save());

  const docPgAddMod = await PDFDocument.create();
  const fPgM = await docPgAddMod.embedFont(StandardFonts.Helvetica);
  const pM1 = docPgAddMod.addPage([595, 842]);
  pM1.drawText('Original Page One Content', { x: 50, y: 750, font: fPgM, size: 14 });
  const pM2 = docPgAddMod.addPage([595, 842]);
  pM2.drawText('Inserted New Page Content', { x: 50, y: 750, font: fPgM, size: 14 });
  const pM3 = docPgAddMod.addPage([595, 842]);
  pM3.drawText('Original Page Two Content', { x: 50, y: 750, font: fPgM, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'page-added-modified.pdf'), await docPgAddMod.save());

  // F. Page Removed
  fs.writeFileSync(path.join(targetDir, 'page-removed-original.pdf'), await docPgAddMod.save());
  fs.writeFileSync(path.join(targetDir, 'page-removed-modified.pdf'), await docPgAddOrig.save());

  // G. Different Page Count
  const docDiffOrig = await PDFDocument.create();
  const fDiff = await docDiffOrig.embedFont(StandardFonts.Helvetica);
  const pDiff1 = docDiffOrig.addPage([595, 842]);
  pDiff1.drawText('Single page original', { x: 50, y: 750, font: fDiff, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'different-page-count-original.pdf'), await docDiffOrig.save());

  const docDiffMod = await PDFDocument.create();
  const fDiffM = await docDiffMod.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const p = docDiffMod.addPage([595, 842]);
    p.drawText(`Modified Multi-Page Document: Page ${i}`, { x: 50, y: 750, font: fDiffM, size: 14 });
  }
  fs.writeFileSync(path.join(targetDir, 'different-page-count-modified.pdf'), await docDiffMod.save());

  // H. Reordered Pages
  const docReorderOrig = await PDFDocument.create();
  const fReo = await docReorderOrig.embedFont(StandardFonts.Helvetica);
  const rO1 = docReorderOrig.addPage([595, 842]);
  rO1.drawText('Alpha Chapter: Initial Section', { x: 50, y: 750, font: fReo, size: 14 });
  const rO2 = docReorderOrig.addPage([595, 842]);
  rO2.drawText('Beta Chapter: Subsequent Section', { x: 50, y: 750, font: fReo, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'reordered-original.pdf'), await docReorderOrig.save());

  const docReorderMod = await PDFDocument.create();
  const fReoM = await docReorderMod.embedFont(StandardFonts.Helvetica);
  const rM1 = docReorderMod.addPage([595, 842]);
  rM1.drawText('Beta Chapter: Subsequent Section', { x: 50, y: 750, font: fReoM, size: 14 });
  const rM2 = docReorderMod.addPage([595, 842]);
  rM2.drawText('Alpha Chapter: Initial Section', { x: 50, y: 750, font: fReoM, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'reordered-modified.pdf'), await docReorderMod.save());

  // ==========================================
  // 2. PRIVACY SANITIZER FIXTURES
  // ==========================================

  // A. Clean PDF
  const docClean = await PDFDocument.create();
  const pClean = docClean.addPage([595, 842]);
  const fClean = await docClean.embedFont(StandardFonts.Helvetica);
  pClean.drawText('Clean document without metadata, comments, or form fields.', { x: 50, y: 750, font: fClean, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'privacy-clean.pdf'), await docClean.save());

  // B. Metadata PDF
  const docMeta = await PDFDocument.create();
  const pMeta = docMeta.addPage([595, 842]);
  const fMeta = await docMeta.embedFont(StandardFonts.Helvetica);
  pMeta.drawText('Document with sensitive metadata properties.', { x: 50, y: 750, font: fMeta, size: 14 });
  docMeta.setTitle('Confidential Quarterly Report');
  docMeta.setAuthor('John Doe - Internal Auditor');
  docMeta.setSubject('Financial Compliance');
  docMeta.setKeywords(['confidential', 'tax', 'audit', '2026']);
  docMeta.setProducer('Internal Document Generator');
  docMeta.setCreator('Acrobat Pro Test Suite');
  docMeta.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  docMeta.setModificationDate(new Date('2026-02-01T00:00:00Z'));
  fs.writeFileSync(path.join(targetDir, 'privacy-metadata.pdf'), await docMeta.save());

  // C. Form Fields PDF
  const docForms = await PDFDocument.create();
  const pForms = docForms.addPage([595, 842]);
  const form = docForms.getForm();
  const nameField = form.createTextField('applicant_name');
  nameField.setText('Jane Smith');
  nameField.addToPage(pForms, { x: 50, y: 700, width: 200, height: 25 });
  const agreeCheck = form.createCheckBox('terms_agreed');
  agreeCheck.check();
  agreeCheck.addToPage(pForms, { x: 50, y: 650, width: 20, height: 20 });
  fs.writeFileSync(path.join(targetDir, 'privacy-forms.pdf'), await docForms.save());

  // D. Attachments PDF
  const docAttach = await PDFDocument.create();
  const pAtt = docAttach.addPage([595, 842]);
  const fAtt = await docAttach.embedFont(StandardFonts.Helvetica);
  pAtt.drawText('Document with embedded confidential attachment.', { x: 50, y: 750, font: fAtt, size: 14 });
  await docAttach.attach(Buffer.from('Sensitive raw payload: user=admin;pass=secret123'), 'secret_credentials.txt', {
    mimeType: 'text/plain',
    description: 'Confidential credentials',
    creationDate: new Date('2026-01-15'),
    modificationDate: new Date('2026-01-16')
  });
  fs.writeFileSync(path.join(targetDir, 'privacy-attachments.pdf'), await docAttach.save());

  // E. Privacy All (Metadata + Forms + Attachments)
  const docAllPriv = await PDFDocument.create();
  const pAll = docAllPriv.addPage([595, 842]);
  const fAll = await docAllPriv.embedFont(StandardFonts.Helvetica);
  pAll.drawText('Combined privacy test document.', { x: 50, y: 750, font: fAll, size: 14 });
  docAllPriv.setTitle('Full Audit PDF');
  docAllPriv.setAuthor('Security Operations');
  const formAll = docAllPriv.getForm();
  const userField = formAll.createTextField('user_ssn');
  userField.setText('123-45-6789');
  userField.addToPage(pAll, { x: 50, y: 700, width: 200, height: 25 });
  await docAllPriv.attach(Buffer.from('Internal logs payload'), 'system_logs.log', {
    mimeType: 'text/plain',
    description: 'System audit log'
  });
  fs.writeFileSync(path.join(targetDir, 'privacy-all.pdf'), await docAllPriv.save());

  // F. Privacy Scripts & Unsupported
  const docScript = await PDFDocument.create();
  const pScr = docScript.addPage([595, 842]);
  const fScr = await docScript.embedFont(StandardFonts.Helvetica);
  pScr.drawText('Document with embedded JavaScript action.', { x: 50, y: 750, font: fScr, size: 14 });
  // Add OpenAction with JavaScript
  const jsDict = docScript.context.obj({
    S: 'JavaScript',
    JS: PDFString.of("app.alert('Hello Security');")
  });
  docScript.catalog.set(PDFName.of('OpenAction'), jsDict);
  fs.writeFileSync(path.join(targetDir, 'privacy-scripts.pdf'), await docScript.save());

  // ==========================================
  // 3. HEADER / FOOTER FIXTURES
  // ==========================================

  // A. 1-page portrait
  const docHf1 = await PDFDocument.create();
  const fHf = await docHf1.embedFont(StandardFonts.Helvetica);
  const pHf1 = docHf1.addPage([595, 842]);
  pHf1.drawText('Header & Footer Single Page Portrait Document Content', { x: 50, y: 400, font: fHf, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'hf-1page-portrait.pdf'), await docHf1.save());

  // B. Multi-page portrait (6 pages)
  const docHfMulti = await PDFDocument.create();
  const fHfM = await docHfMulti.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 6; i++) {
    const p = docHfMulti.addPage([595, 842]);
    p.drawText(`Multi-page document body text for page ${i}.`, { x: 50, y: 400, font: fHfM, size: 14 });
  }
  fs.writeFileSync(path.join(targetDir, 'hf-multipage-portrait.pdf'), await docHfMulti.save());

  // C. Multi-page landscape (3 pages)
  const docHfLand = await PDFDocument.create();
  const fHfL = await docHfLand.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const p = docHfLand.addPage([842, 595]);
    p.drawText(`Landscape orientation test content on page ${i}.`, { x: 50, y: 300, font: fHfL, size: 14 });
  }
  fs.writeFileSync(path.join(targetDir, 'hf-multipage-landscape.pdf'), await docHfLand.save());

  // D. Mixed orientation (Portrait, Landscape, Portrait)
  const docHfMix = await PDFDocument.create();
  const fHfMix = await docHfMix.embedFont(StandardFonts.Helvetica);
  const pM1o = docHfMix.addPage([595, 842]);
  pM1o.drawText('Page 1: Portrait orientation', { x: 50, y: 400, font: fHfMix, size: 14 });
  const pM2o = docHfMix.addPage([842, 595]);
  pM2o.drawText('Page 2: Landscape orientation', { x: 50, y: 300, font: fHfMix, size: 14 });
  const pM3o = docHfMix.addPage([595, 842]);
  pM3o.drawText('Page 3: Portrait orientation', { x: 50, y: 400, font: fHfMix, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'hf-mixed-orientation.pdf'), await docHfMix.save());

  // ==========================================
  // 4. REPAIR FIXTURES
  // ==========================================

  // A. Healthy PDF
  const docRepHealthy = await PDFDocument.create();
  const fRepH = await docRepHealthy.embedFont(StandardFonts.Helvetica);
  const pRepH = docRepHealthy.addPage([595, 842]);
  pRepH.drawText('Fully healthy and valid PDF document.', { x: 50, y: 750, font: fRepH, size: 14 });
  fs.writeFileSync(path.join(targetDir, 'repair-healthy.pdf'), await docRepHealthy.save());

  // B. Malformed Header PDF
  const healthyBytes = await docRepHealthy.save();
  const malformedHeaderBytes = Buffer.concat([
    Buffer.from('GARBAGE_HEADER_PREFIX\n'),
    Buffer.from(healthyBytes)
  ]);
  fs.writeFileSync(path.join(targetDir, 'repair-malformed-header.pdf'), malformedHeaderBytes);

  // C. Corrupted XREF / Trailer PDF
  const corruptedXrefBytes = Buffer.from(healthyBytes);
  // Overwrite part of xref/trailer at the end with junk
  const eofIndex = corruptedXrefBytes.lastIndexOf(Buffer.from('%%EOF'));
  if (eofIndex > 100) {
    corruptedXrefBytes.fill('X', eofIndex - 50, eofIndex);
  }
  fs.writeFileSync(path.join(targetDir, 'repair-corrupted-xref.pdf'), corruptedXrefBytes);

  // D. Broken page reference PDF
  const docBroken = await PDFDocument.create();
  const pBr1 = docBroken.addPage([595, 842]);
  pBr1.drawText('Broken page test page 1', { x: 50, y: 750, size: 14 });
  const pBr2 = docBroken.addPage([595, 842]);
  pBr2.drawText('Broken page test page 2', { x: 50, y: 750, size: 14 });
  const brokenBytes = await docBroken.save();
  fs.writeFileSync(path.join(targetDir, 'repair-broken-pageref.pdf'), brokenBytes);

  // E. Partially readable PDF
  const docPart = await PDFDocument.create();
  const fPart = await docPart.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 4; i++) {
    const p = docPart.addPage([595, 842]);
    p.drawText(`Partially readable document: Valid Page ${i} content.`, { x: 50, y: 750, font: fPart, size: 14 });
  }
  fs.writeFileSync(path.join(targetDir, 'repair-partial.pdf'), await docPart.save());

  // F. Completely corrupted PDF
  fs.writeFileSync(path.join(targetDir, 'repair-corrupted.pdf'), Buffer.from('%PDF-1.4\nJUNK_RANDOM_CORRUPT_BYTES_99999\x00\xff\xfe\xca\xfe\xba\xbe'));

  // G. Non-PDF file renamed as .pdf
  fs.writeFileSync(path.join(targetDir, 'repair-not-a-pdf.pdf'), Buffer.from('This is a plain text file pretending to be a PDF document.\nNot valid PDF data.'));

  // ==========================================
  // 5. EXTRACTOR FIXTURES
  // ==========================================

  // A. Selectable Text with paragraphs
  const docExtText = await PDFDocument.create();
  const fExt = await docExtText.embedFont(StandardFonts.Helvetica);
  const pExt1 = docExtText.addPage([595, 842]);
  pExt1.drawText('Annual Executive Summary 2026', { x: 50, y: 780, font: fExt, size: 18 });
  pExt1.drawText(
    'Paragraph 1: The organization achieved substantial growth across all functional verticals.\n' +
    'Digital transformation initiatives led to enhanced efficiency and customer satisfaction.',
    { x: 50, y: 730, font: fExt, size: 12, lineHeight: 18 }
  );
  pExt1.drawText(
    'Paragraph 2: Financial metrics demonstrated resilient balance sheet stability.\n' +
    'All statutory compliance parameters have been verified and documented.',
    { x: 50, y: 650, font: fExt, size: 12, lineHeight: 18 }
  );
  const pExt2 = docExtText.addPage([595, 842]);
  pExt2.drawText('Second Page Details and Operational Statistics', { x: 50, y: 780, font: fExt, size: 16 });
  pExt2.drawText('Key operational metrics are recorded here for auditing purposes.', { x: 50, y: 730, font: fExt, size: 12 });
  fs.writeFileSync(path.join(targetDir, 'extractor-text.pdf'), await docExtText.save());

  // B. Embedded Images PDF
  const docExtImg = await PDFDocument.create();
  const pExtImg = docExtImg.addPage([595, 842]);
  const embeddedImg = await docExtImg.embedPng(minimalPng);
  pExtImg.drawImage(embeddedImg, { x: 50, y: 500, width: 200, height: 150 });
  pExtImg.drawImage(embeddedImg, { x: 300, y: 500, width: 150, height: 100 });
  fs.writeFileSync(path.join(targetDir, 'extractor-images.pdf'), await docExtImg.save());

  // C. Structured Tables PDF
  const docExtTbl = await PDFDocument.create();
  const fTbl = await docExtTbl.embedFont(StandardFonts.Helvetica);
  const pExtTbl = docExtTbl.addPage([595, 842]);
  pExtTbl.drawText('Employee Directory Table', { x: 50, y: 780, font: fTbl, size: 16 });

  // Draw simulated table lines & cells
  const tableData = [
    ['ID', 'Name', 'Department', 'Status'],
    ['101', 'Alice Johnson', 'Engineering', 'Active'],
    ['102', 'Bob Smith', 'Design', 'Active'],
    ['103', 'Carol Davis', 'Management', 'On Leave']
  ];

  let yPos = 730;
  for (const row of tableData) {
    pExtTbl.drawText(`${row[0]}    ${row[1]}    ${row[2]}    ${row[3]}`, { x: 50, y: yPos, font: fTbl, size: 12 });
    yPos -= 30;
  }
  fs.writeFileSync(path.join(targetDir, 'extractor-tables.pdf'), await docExtTbl.save());

  // D. Embedded Attachments PDF
  const docExtAtt = await PDFDocument.create();
  const pExtAtt = docExtAtt.addPage([595, 842]);
  const fAttExt = await docExtAtt.embedFont(StandardFonts.Helvetica);
  pExtAtt.drawText('Document with multiple embedded files.', { x: 50, y: 750, font: fAttExt, size: 14 });
  await docExtAtt.attach(Buffer.from('Table data in CSV: Name,Score\nAlice,95\nBob,88'), 'scores.csv', {
    mimeType: 'text/csv',
    description: 'Score report'
  });
  await docExtAtt.attach(Buffer.from('Configuration settings JSON: {"env":"production"}'), 'config.json', {
    mimeType: 'application/json',
    description: 'App config'
  });
  fs.writeFileSync(path.join(targetDir, 'extractor-attachments.pdf'), await docExtAtt.save());

  // E. Mixed PDF (Text + Image + Table)
  const docExtMix = await PDFDocument.create();
  const fExtMix = await docExtMix.embedFont(StandardFonts.Helvetica);
  const pExtMix = docExtMix.addPage([595, 842]);
  pExtMix.drawText('Comprehensive Document with Mixed Content', { x: 50, y: 780, font: fExtMix, size: 16 });
  pExtMix.drawText('This document features text paragraphs, an embedded image, and a table.', { x: 50, y: 740, font: fExtMix, size: 12 });
  const embeddedMixImg = await docExtMix.embedPng(minimalPng);
  pExtMix.drawImage(embeddedMixImg, { x: 50, y: 550, width: 120, height: 100 });
  pExtMix.drawText('Item    Qty    Price', { x: 50, y: 500, font: fExtMix, size: 12 });
  pExtMix.drawText('Widget A    10    $50', { x: 50, y: 470, font: fExtMix, size: 12 });
  pExtMix.drawText('Widget B    5     $30', { x: 50, y: 440, font: fExtMix, size: 12 });
  fs.writeFileSync(path.join(targetDir, 'extractor-mixed.pdf'), await docExtMix.save());

  // F. Empty page PDF
  const docExtEmpty = await PDFDocument.create();
  const fExtEmp = await docExtEmpty.embedFont(StandardFonts.Helvetica);
  const pExtEmp1 = docExtEmpty.addPage([595, 842]);
  pExtEmp1.drawText('Page 1 has extractable text content.', { x: 50, y: 750, font: fExtEmp, size: 14 });
  docExtEmpty.addPage([595, 842]); // Page 2 has no text
  fs.writeFileSync(path.join(targetDir, 'extractor-empty-page.pdf'), await docExtEmpty.save());

  // G. Large PDF (10 pages)
  const docExtLg = await PDFDocument.create();
  const fExtLg = await docExtLg.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 10; i++) {
    const p = docExtLg.addPage([595, 842]);
    p.drawText(`Large Document Performance Benchmark - Page ${i}`, { x: 50, y: 780, font: fExtLg, size: 16 });
    for (let j = 1; j <= 15; j++) {
      p.drawText(`Line ${j}: Data row containing selectable text payload for testing memory and responsiveness.`, { x: 50, y: 750 - (j * 25), font: fExtLg, size: 11 });
    }
  }
  fs.writeFileSync(path.join(targetDir, 'extractor-large.pdf'), await docExtLg.save());

  console.log('Successfully generated all Phase 2 test fixtures in e2e/test-data/phase2/ !');
}

generatePhase2Fixtures().catch(err => {
  console.error('Failed to generate Phase 2 test fixtures:', err);
  process.exit(1);
});
