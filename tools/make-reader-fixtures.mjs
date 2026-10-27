/**
 * Builds the fixture the Part L (reader) e2e suite runs against.
 *
 * Generated rather than committed by hand, for the same reason the
 * conversion fixtures are: what the Part L tests assert is structure a hand
 * edit cannot keep in sync -- a three-level outline whose titles are real
 * PDF text strings, two text columns that must reflow in the right order,
 * and one image per page positioned between them so the reading view has a
 * correct place to put it.
 *
 * pdf-lib writes no outline of its own, so the /Outlines tree is assembled
 * here from raw objects. Note `PDFString.of` for each title: `context.obj`
 * turns a JS string into a PDFName, and a title written that way is not a
 * text string, so pdf.js reads no title at all and every entry in the
 * sidebar comes out untitled.
 *
 * Run:  node tools/make-reader-fixtures.mjs
 */
import { PDFDocument, StandardFonts, rgb, PDFName, PDFArray, PDFNumber, PDFString } from 'pdf-lib';
import fs from 'node:fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'e2e/test-data/reader');
const outFile = path.join(outDir, 'reader-outline-columns-images.pdf');
const plateFile = path.join(root, 'e2e/test-data/signatures/signature-ink.png');
fs.mkdirSync(outDir, { recursive: true });

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

// A real image, so the reflow view has a figure to extract and place.
const png = await doc.embedPng(fs.readFileSync(plateFile));

const PAGES = 24;
const pageRefs = [];

for (let i = 1; i <= PAGES; i++) {
  const page = doc.addPage([595, 842]);
  pageRefs.push(page.ref);

  page.drawText(`Chapter ${Math.ceil(i / 6)} — Section ${i}`, {
    x: 50, y: 780, size: 20, font: bold, color: rgb(0.1, 0.1, 0.2)
  });

  // Two columns, so the reflow reading order has something to prove.
  const left = [
    'The quarterly report sets out the position',
    'as it stood at the end of the period, with',
    'the application of each measure recorded',
    'against the baseline agreed beforehand.',
    'Nothing in this column continues into the',
    'right-hand column on the same line.'
  ];
  const right = [
    'Where a figure could not be verified it is',
    'marked plainly rather than estimated. The',
    'application of that rule is the reason some',
    'rows are blank. A reader following the text',
    'should reach this column only after the',
    'left-hand one has finished.'
  ];

  left.forEach((line, n) => {
    page.drawText(line, { x: 50, y: 700 - n * 18, size: 10, font });
  });
  right.forEach((line, n) => {
    page.drawText(line, { x: 320, y: 700 - n * 18, size: 10, font });
  });

  // A figure in the middle of the page, between the columns above and the
  // paragraph below, so interleaving has a correct answer.
  page.drawImage(png, { x: 50, y: 420, width: 180, height: 120 });

  page.drawText(`Figure ${i}. Sample plate from page ${i}.`, {
    x: 50, y: 400, size: 9, font
  });
  page.drawText(
    `Page ${i} closing note: the application of the method above is repeated here.`,
    { x: 50, y: 360, size: 10, font }
  );
  page.drawText(`${i}`, { x: 540, y: 40, size: 9, font });
}

/*
 * A nested outline, three levels deep: four chapters, each with two
 * sections, and the first section of each carrying two sub-sections. The
 * old reader template could only render two of those levels.
 */
const ctx = doc.context;
const outlineDictRef = ctx.nextRef();
const topRefs = [];
const allItems = [];

function makeItem(title, pageIndex, parentRef) {
  const ref = ctx.nextRef();
  allItems.push({ ref, title, pageIndex, parentRef, kids: [] });
  return ref;
}

for (let c = 0; c < 4; c++) {
  const chapterRef = makeItem(`Chapter ${c + 1}`, c * 6, outlineDictRef);
  topRefs.push(chapterRef);
  const chapter = allItems[allItems.length - 1];

  for (let s = 0; s < 2; s++) {
    const secRef = makeItem(`Section ${c + 1}.${s + 1}`, c * 6 + s * 3, chapterRef);
    chapter.kids.push(secRef);
    const section = allItems[allItems.length - 1];

    if (s === 0) {
      for (let t = 0; t < 2; t++) {
        const subRef = makeItem(
          `Sub-section ${c + 1}.${s + 1}.${t + 1}`,
          c * 6 + t + 1,
          secRef
        );
        section.kids.push(subRef);
      }
    }
  }
}

for (const item of allItems) {
  const dest = PDFArray.withContext(ctx);
  dest.push(pageRefs[item.pageIndex]);
  dest.push(PDFName.of('XYZ'));
  dest.push(PDFNumber.of(0));
  dest.push(PDFNumber.of(842));
  dest.push(PDFNumber.of(0));

  const entries = {
    Title: PDFString.of(item.title),
    Parent: item.parentRef,
    Dest: dest
  };

  if (item.kids.length > 0) {
    entries.First = item.kids[0];
    entries.Last = item.kids[item.kids.length - 1];
    entries.Count = PDFNumber.of(item.kids.length);
  }

  const siblings = item.parentRef === outlineDictRef
    ? topRefs
    : allItems.find(i => i.ref === item.parentRef).kids;
  const pos = siblings.indexOf(item.ref);
  if (pos > 0) entries.Prev = siblings[pos - 1];
  if (pos < siblings.length - 1) entries.Next = siblings[pos + 1];

  ctx.assign(item.ref, ctx.obj(entries));
}

ctx.assign(outlineDictRef, ctx.obj({
  Type: PDFName.of('Outlines'),
  First: topRefs[0],
  Last: topRefs[topRefs.length - 1],
  Count: PDFNumber.of(topRefs.length)
}));

doc.catalog.set(PDFName.of('Outlines'), outlineDictRef);
doc.setTitle('Reader L1-L6 fixture');

const bytes = await doc.save();
fs.writeFileSync(outFile, bytes);
console.log(`wrote ${outFile} — ${bytes.length} bytes, ${PAGES} pages, ${allItems.length} outline items`);
