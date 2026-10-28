/**
 * Generates JPEG fixtures that carry real EXIF.
 *
 * The photo fixtures in e2e/test-data/photos are all canvas output, which has
 * no EXIF at all, so nothing in the suite could exercise the metadata viewer,
 * the capture-date repair, or the EXIF rename tokens and auto-rotate in the
 * batch suite. These write a genuine APP1/TIFF block so those paths are
 * tested against the bytes a phone actually produces.
 */
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../e2e/test-data/photos');

/** Builds a little-endian EXIF APP1 segment. */
function buildExifApp1({ dateTimeOriginal, orientation = 1, make = 'TestCam', model = 'Model X', gps = null }) {
  const ascii = s => { const b = Buffer.from(s, 'latin1'); return Buffer.concat([b, Buffer.from([0])]); };

  const data = [];           // deferred values (>4 bytes), appended after the IFDs
  let dataLen = 0;
  const defer = buf => { const off = buf.length; data.push(buf); const at = dataLen; dataLen += buf.length; return at; };

  const makeB = ascii(make), modelB = ascii(model), dtB = ascii(dateTimeOriginal);
  const rational = (num, den) => { const b = Buffer.alloc(8); b.writeUInt32LE(num, 0); b.writeUInt32LE(den, 4); return b; };

  // IFD0 has 5 entries, ExifIFD 2, GPS 4 (when present).
  const gpsCount = gps ? 4 : 0;
  const ifd0Count = gps ? 5 : 4;
  const exifCount = 2;

  const HEADER = 8;
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifSize = 2 + exifCount * 12 + 4;
  const gpsSize = gps ? 2 + gpsCount * 12 + 4 : 0;

  const ifd0At = HEADER;
  const exifAt = ifd0At + ifd0Size;
  const gpsAt = exifAt + exifSize;
  const dataAt = gpsAt + gpsSize;

  const makeOff = dataAt + defer(makeB);
  const modelOff = dataAt + defer(modelB);
  const dtOff = dataAt + defer(dtB);
  let latOff = 0, lonOff = 0;
  if (gps) {
    const toDms = deg => { const d = Math.floor(deg); const m = Math.floor((deg - d) * 60); const s = Math.round((((deg - d) * 60) - m) * 60 * 100);
      return Buffer.concat([rational(d, 1), rational(m, 1), rational(s, 100)]); };
    latOff = dataAt + defer(toDms(Math.abs(gps.lat)));
    lonOff = dataAt + defer(toDms(Math.abs(gps.lon)));
  }

  const entry = (tag, type, count, valueWriter) => {
    const b = Buffer.alloc(12);
    b.writeUInt16LE(tag, 0); b.writeUInt16LE(type, 2); b.writeUInt32LE(count, 4);
    valueWriter(b, 8);
    return b;
  };
  const longVal = v => (b, o) => b.writeUInt32LE(v, o);
  const shortVal = v => (b, o) => { b.writeUInt16LE(v, o); b.writeUInt16LE(0, o + 2); };

  const ifd0Entries = [
    entry(0x010F, 2, makeB.length, longVal(makeOff)),     // Make
    entry(0x0110, 2, modelB.length, longVal(modelOff)),   // Model
    entry(0x0112, 3, 1, shortVal(orientation)),           // Orientation
    entry(0x8769, 4, 1, longVal(exifAt))                  // ExifIFDPointer
  ];
  if (gps) ifd0Entries.push(entry(0x8825, 4, 1, longVal(gpsAt)));
  ifd0Entries.sort((a, b) => a.readUInt16LE(0) - b.readUInt16LE(0));

  const exifEntries = [
    entry(0x9003, 2, dtB.length, longVal(dtOff)),         // DateTimeOriginal
    entry(0x9004, 2, dtB.length, longVal(dtOff))          // DateTimeDigitized
  ];

  const gpsEntries = gps ? [
    entry(0x0001, 2, 2, (b, o) => { b.write(gps.lat >= 0 ? 'N\0' : 'S\0', o, 'latin1'); }),
    entry(0x0002, 5, 3, longVal(latOff)),
    entry(0x0003, 2, 2, (b, o) => { b.write(gps.lon >= 0 ? 'E\0' : 'W\0', o, 'latin1'); }),
    entry(0x0004, 5, 3, longVal(lonOff))
  ] : [];

  const ifdBlock = (entries) => {
    const head = Buffer.alloc(2); head.writeUInt16LE(entries.length, 0);
    const tail = Buffer.alloc(4); // next-IFD offset = 0
    return Buffer.concat([head, ...entries, tail]);
  };

  const tiff = Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]), // "II", 42, IFD0 @ 8
    ifdBlock(ifd0Entries),
    ifdBlock(exifEntries),
    ...(gps ? [ifdBlock(gpsEntries)] : []),
    ...data
  ]);

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const seg = Buffer.alloc(4);
  seg.writeUInt16BE(0xFFE1, 0);
  seg.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([seg, payload]);
}

/** Splices an APP1 segment in right after SOI. */
function injectExif(jpeg, app1) {
  if (jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) throw new Error('not a JPEG');
  let insertAt = 2;
  /*
   * Skip an existing APP0/JFIF so the APP1 lands in a legal position. The
   * marker is 2 bytes and the length field counts itself, so the next segment
   * starts at 2 + 2 + (length - 2) + 2 = 4 + length.
   */
  if (jpeg[2] === 0xFF && jpeg[3] === 0xE0) insertAt = 4 + jpeg.readUInt16BE(4);
  return Buffer.concat([jpeg.subarray(0, insertAt), app1, jpeg.subarray(insertAt)]);
}

const browser = await chromium.launch();
const page = await browser.newPage();

async function jpegOf(label, w, h) {
  const dataUrl = await page.evaluate(({ label, w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#f7f5ef'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#14203a'; x.font = 'bold 26px serif';
    for (let i = 0; i < 5; i++) x.fillText(label + ' ' + i, 20, 44 + i * 40);
    // A corner marker, so an orientation transform is visible in a test.
    x.fillStyle = '#dc2626'; x.fillRect(0, 0, Math.round(w * 0.18), Math.round(h * 0.10));
    return c.toDataURL('image/jpeg', 0.9);
  }, { label, w, h });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

const FIXTURES = [
  { name: 'exif-dated-2019.jpg', label: 'Dated Scan', w: 480, h: 360,
    exif: { dateTimeOriginal: '2019:03:07 14:25:36', orientation: 1, make: 'Canon', model: 'EOS 200D',
            gps: { lat: 28.6139, lon: 77.2090 } } },
  { name: 'exif-rotated-90cw.jpg', label: 'Rotated', w: 480, h: 360,
    exif: { dateTimeOriginal: '2021:11:19 09:02:11', orientation: 6, make: 'Samsung', model: 'SM-G991B', gps: null } },
  { name: 'exif-wrong-clock.jpg', label: 'Wrong Clock', w: 400, h: 300,
    exif: { dateTimeOriginal: '2016:01:01 00:00:00', orientation: 1, make: 'Nikon', model: 'D3500', gps: null } }
];

for (const f of FIXTURES) {
  const base = await jpegOf(f.label, f.w, f.h);
  const out = injectExif(base, buildExifApp1(f.exif));
  fs.writeFileSync(path.join(OUT_DIR, f.name), out);
  console.log('wrote', f.name, out.length, 'bytes');
}
await browser.close();
