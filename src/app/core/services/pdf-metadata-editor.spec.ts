import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfMetadataEditorService } from './pdf-metadata-editor.service';
import { PdfPrivacyService } from './pdf-privacy.service';
import { PdfMetadata } from '../models/pdf-metadata.types';
import '../utilities/pdfjs-worker';

describe('PdfMetadataEditorService — Info Dictionary & XMP Stream Synchronization', () => {
  let service: PdfMetadataEditorService;
  let privacyService: PdfPrivacyService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PdfMetadataEditorService, PdfPrivacyService]
    });
    service = TestBed.inject(PdfMetadataEditorService);
    privacyService = TestBed.inject(PdfPrivacyService);
  });

  describe('Sanitizer & Date Formatting', () => {
    it('sanitizes null bytes and control characters while preserving valid Unicode', () => {
      const dirty = 'Document\u0000 Title\u0007 With\u001F Controls \u092D\u093E\u0930\u0924';
      const clean = service.sanitizeString(dirty);
      expect(clean).toBe('Document Title With Controls भारत');
    });

    it('formats and parses standard PDF date format (D:YYYYMMDDHHmmSSOHH\'mm\')', () => {
      const now = new Date(2026, 9, 29, 14, 30, 45); // Oct 29, 2026 14:30:45
      const pdfDate = service.formatPdfDate(now);
      expect(pdfDate).toMatch(/^D:20261029143045[+\-Z]/);

      const parsed = service.parsePdfDate(pdfDate);
      expect(parsed).toBeDefined();
      expect(parsed?.getUTCFullYear()).toBe(2026);
    });

    it('formats ISO 8601 date for XMP metadata streams', () => {
      const now = new Date(2026, 9, 29, 14, 30, 45);
      const xmpDate = service.formatXmpDate(now);
      expect(xmpDate).toMatch(/^2026-10-29T14:30:45[+\-]/);
    });
  });

  describe('Dual Synchronization (Info Dictionary & XMP Stream)', () => {
    it('sets standard metadata fields and reads them back accurately through both pdf-lib and pdfjs-dist', async () => {
      // 1. Create a clean test PDF
      const doc = await PDFDocument.create();
      const page = doc.addPage([500, 300]);
      page.drawText('Sample PDF content for metadata testing', { x: 50, y: 200, size: 12 });
      const initialBytes = await doc.save();

      // 2. Define metadata to set
      const creationDate = new Date(2026, 5, 15, 10, 0, 0);
      const modDate = new Date(2026, 9, 29, 12, 30, 0);

      const targetMetadata: PdfMetadata = {
        title: 'Enterprise Architecture Blueprint 2026',
        author: 'Chief Solutions Architect',
        subject: 'Confidential System Design',
        keywords: ['architecture', 'security', 'enterprise', 'pdf-spec'],
        creator: 'Visual Studio Code & Angular Workstation',
        producer: 'pdf-lib & Antigravity Dual Engine',
        creationDate,
        modificationDate: modDate
      };

      // 3. Apply metadata
      const result = await service.applyMetadata(initialBytes, targetMetadata);
      expect(result.pdfBytes.length).toBeGreaterThan(0);

      // 4. Inspect via pdf-lib
      const readDoc = await PDFDocument.load(result.pdfBytes, { updateMetadata: false });
      expect(readDoc.getTitle()).toBe('Enterprise Architecture Blueprint 2026');
      expect(readDoc.getAuthor()).toBe('Chief Solutions Architect');
      expect(readDoc.getSubject()).toBe('Confidential System Design');
      expect(readDoc.getCreator()).toBe('Visual Studio Code & Angular Workstation');
      expect(readDoc.getProducer()).toBe('pdf-lib & Antigravity Dual Engine');
      expect(readDoc.getKeywords()).toContain('architecture');
      expect(result.inspection.metadata.keywords).toEqual(['architecture', 'security', 'enterprise', 'pdf-spec']);

      // 5. Inspect via pdfjs-dist (validating both Info dictionary and XMP stream parse)
      const pdfjsDoc = await pdfjsLib.getDocument({ data: result.pdfBytes.slice(0) }).promise;
      const pdfjsMeta = await pdfjsDoc.getMetadata();

      expect(pdfjsMeta.info.Title).toBe('Enterprise Architecture Blueprint 2026');
      expect(pdfjsMeta.info.Author).toBe('Chief Solutions Architect');
      expect(pdfjsMeta.info.Subject).toBe('Confidential System Design');
      expect(pdfjsMeta.info.Creator).toBe('Visual Studio Code & Angular Workstation');
      expect(pdfjsMeta.info.Producer).toBe('pdf-lib & Antigravity Dual Engine');

      // 6. Inspect raw XMP stream packet content
      expect(result.inspection.hasXmpStream).toBe(true);
      expect(result.inspection.rawXmpXml).toContain('<dc:title>');
      expect(result.inspection.rawXmpXml).toContain('Enterprise Architecture Blueprint 2026');
      expect(result.inspection.rawXmpXml).toContain('<dc:creator>');
      expect(result.inspection.rawXmpXml).toContain('Chief Solutions Architect');
      expect(result.inspection.rawXmpXml).toContain('<dc:description>');
      expect(result.inspection.rawXmpXml).toContain('Confidential System Design');
      expect(result.inspection.rawXmpXml).toContain('<dc:subject>');
      expect(result.inspection.rawXmpXml).toContain('<rdf:li>architecture</rdf:li>');
      expect(result.inspection.rawXmpXml).toContain('<pdf:Keywords>architecture, security, enterprise, pdf-spec</pdf:Keywords>');
      expect(result.inspection.rawXmpXml).toContain('<pdf:Producer>pdf-lib &amp; Antigravity Dual Engine</pdf:Producer>');
    });
  });

  describe('Non-Latin Script & Unicode Round-Trip Integrity (Hindi / Marathi)', () => {
    it('round-trips Devanagari Hindi and Marathi Unicode characters without corruption or mojibake', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 300]);
      const initialBytes = await doc.save();

      const hindiMarathiMetadata: PdfMetadata = {
        title: 'भारतीय संविधान एवं प्रशासनिक प्रतिवेदन २०२६',
        author: 'डॉ. अभिजीत चौधरी (वरिष्ठ संशोधन अधिकारी)',
        subject: 'महाराष्ट्र शासन राजपत्र आणि अधिकृत सूचना',
        keywords: ['संविधान', 'प्रशासन', 'महाराष्ट्र', 'डिजिटल भारत'],
        creator: 'भारतीय फॉर्म सहायक अनुप्रयोग',
        producer: 'स्थानिक पीडीएफ इंजिन'
      };

      const result = await service.applyMetadata(initialBytes, hindiMarathiMetadata);

      // Verify via inspection service
      const inspection = await service.readMetadata(result.pdfBytes);
      expect(inspection.metadata.title).toBe('भारतीय संविधान एवं प्रशासनिक प्रतिवेदन २०२६');
      expect(inspection.metadata.author).toBe('डॉ. अभिजीत चौधरी (वरिष्ठ संशोधन अधिकारी)');
      expect(inspection.metadata.subject).toBe('महाराष्ट्र शासन राजपत्र आणि अधिकृत सूचना');
      expect(inspection.metadata.keywords).toContain('संविधान');
      expect(inspection.metadata.keywords).toContain('डिजिटल भारत');

      // Verify XMP XML contains the uncorrupted UTF-8 strings
      expect(inspection.rawXmpXml).toContain('भारतीय संविधान एवं प्रशासनिक प्रतिवेदन २०२६');
      expect(inspection.rawXmpXml).toContain('डॉ. अभिजीत चौधरी (वरिष्ठ संशोधन अधिकारी)');
      expect(inspection.rawXmpXml).toContain('महाराष्ट्र शासन राजपत्र आणि अधिकृत सूचना');

      // Verify pdfjs-dist extracts the Unicode without corruption
      const pdfjsDoc = await pdfjsLib.getDocument({ data: result.pdfBytes.slice(0) }).promise;
      const pdfjsMeta = await pdfjsDoc.getMetadata();
      expect(pdfjsMeta.info.Title).toBe('भारतीय संविधान एवं प्रशासनिक प्रतिवेदन २०२६');
      expect(pdfjsMeta.info.Author).toBe('डॉ. अभिजीत चौधरी (वरिष्ठ संशोधन अधिकारी)');
    });
  });

  describe('Privacy Sanitizer Independence', () => {
    it('ensures Privacy Sanitizer bulk strip behavior remains 100% untouched and functional', async () => {
      // 1. Create a PDF with full metadata
      const doc = await PDFDocument.create();
      doc.addPage([500, 300]);
      const baseBytes = await doc.save();

      const initial = await service.applyMetadata(baseBytes, {
        title: 'Pre-Sanitized Document',
        author: 'Sensitive Personnel',
        subject: 'Internal Memo',
        keywords: ['secret', 'internal']
      });

      expect(initial.inspection.metadata.title).toBe('Pre-Sanitized Document');
      expect(initial.inspection.hasXmpStream).toBe(true);

      // 2. Run existing Privacy Sanitizer
      const sanitized = await privacyService.sanitizePdf(initial.pdfBytes, {
        removeMetadata: true,
        removeComments: true,
        removeAttachments: true,
        removeForms: false,
        removeScripts: true,
        removeHiddenContent: true
      });

      // 3. Inspect sanitized output: Metadata and XMP stream must be completely stripped
      const recheck = await service.readMetadata(sanitized.sanitizedBlob);
      expect(recheck.metadata.title).toBeFalsy();
      expect(recheck.metadata.author).toBeFalsy();
      expect(recheck.metadata.subject).toBeFalsy();
      expect(recheck.metadata.keywords?.length || 0).toBe(0);
      expect(recheck.hasXmpStream).toBe(false);
    });
  });

  describe('Metadata Comparison Utility', () => {
    it('accurately identifies modified and unchanged metadata fields for side-by-side drawer', () => {
      const original: PdfMetadata = {
        title: 'Original Title',
        author: 'Original Author',
        keywords: ['tag1']
      };

      const updated: PdfMetadata = {
        title: 'New Corrected Title',
        author: 'Original Author',
        keywords: ['tag1', 'tag2']
      };

      const comparison = service.compareMetadata(original, updated);
      const titleItem = comparison.find(c => c.fieldKey === 'title');
      const authorItem = comparison.find(c => c.fieldKey === 'author');
      const keywordsItem = comparison.find(c => c.fieldKey === 'keywords');

      expect(titleItem?.isModified).toBe(true);
      expect(titleItem?.originalValue).toBe('Original Title');
      expect(titleItem?.updatedValue).toBe('New Corrected Title');

      expect(authorItem?.isModified).toBe(false);

      expect(keywordsItem?.isModified).toBe(true);
      expect(keywordsItem?.updatedValue).toContain('tag1, tag2');
    });
  });

  describe('Real Test Data Scenarios', () => {
    it('populates metadata cleanly onto a PDF with completely missing metadata', async () => {
      // Create empty PDF without any metadata
      const doc = await PDFDocument.create();
      doc.addPage([400, 250]);
      const emptyBytes = await doc.save();

      // Verify it has no metadata initially
      const initialInspection = await service.readMetadata(emptyBytes);
      expect(initialInspection.metadata.title).toBeFalsy();
      expect(initialInspection.hasXmpStream).toBe(false);

      // Apply metadata
      const res = await service.applyMetadata(emptyBytes, {
        title: 'Fresh Title',
        author: 'Fresh Author',
        keywords: ['tag1', 'tag2']
      });

      expect(res.inspection.metadata.title).toBe('Fresh Title');
      expect(res.inspection.metadata.author).toBe('Fresh Author');
      expect(res.inspection.metadata.keywords).toEqual(['tag1', 'tag2']);
      expect(res.inspection.hasXmpStream).toBe(true);

      // Verify pdfjs-dist reads back cleanly
      const pdfjsDoc = await pdfjsLib.getDocument({ data: res.pdfBytes.slice(0) }).promise;
      const pdfjsMeta = await pdfjsDoc.getMetadata();
      expect(pdfjsMeta.info.Title).toBe('Fresh Title');
      expect(pdfjsMeta.info.Author).toBe('Fresh Author');
    });

    it('replaces bloated existing XMP metadata with a compact, synchronized packet', async () => {
      // 1. Create a PDF with bloated custom XMP stream
      const doc = await PDFDocument.create();
      doc.addPage([500, 300]);
      const bloatedXmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:custom="http://example.com/custom/">
      <photoshop:Headline>Bloated Unnecessary Photoshop Metadata</photoshop:Headline>
      <photoshop:Credit>Excessive Internal Metadata Packet</photoshop:Credit>
      <custom:Payload>${'A'.repeat(10000)}</custom:Payload>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
      const context = doc.context;
      const xmpBytes = new TextEncoder().encode(bloatedXmp);
      const metadataDict = context.obj({
        Type: 'Metadata',
        Subtype: 'XML',
        Length: xmpBytes.length
      });
      const metadataStream = PDFRawStream.of(metadataDict, xmpBytes);
      const metadataRef = doc.context.register(metadataStream);
      doc.catalog.set(PDFName.of('Metadata'), metadataRef);
      const bloatedBytes = await doc.save();

      // Read bloated PDF
      const bloatedInspection = await service.readMetadata(bloatedBytes);
      expect(bloatedInspection.hasXmpStream).toBe(true);

      // Apply clean metadata
      const cleanResult = await service.applyMetadata(bloatedBytes, {
        title: 'Slim & Sanitized Title',
        author: 'Auditor',
        keywords: ['clean', 'synchronized']
      });

      // Verify bloated payload is replaced
      expect(cleanResult.inspection.rawXmpXml).not.toContain('Excessive Internal Metadata Packet');
      expect(cleanResult.inspection.rawXmpXml).toContain('Slim &amp; Sanitized Title');
      expect(cleanResult.inspection.rawXmpXml).toContain('Auditor');
      expect(cleanResult.inspection.metadata.keywords).toEqual(['clean', 'synchronized']);
    });

    it('handles Unicode metadata with emojis and symbols without corrupting file structure', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([500, 300]);
      const baseBytes = await doc.save();

      const unicodeMeta: PdfMetadata = {
        title: 'Document with Emojis 📄 🚀 🇮🇳 & Mathematical Symbols ∑ ∏ ∫',
        author: 'Developer 👨‍💻',
        subject: 'Rocket Mission 🛰️',
        keywords: ['emoji-test', 'unicode-🚀', 'india-🇮🇳']
      };

      const result = await service.applyMetadata(baseBytes, unicodeMeta);

      const inspection = await service.readMetadata(result.pdfBytes);
      expect(inspection.metadata.title).toContain('📄 🚀 🇮🇳');
      expect(inspection.metadata.title).toContain('∑ ∏ ∫');
      expect(inspection.metadata.author).toContain('👨‍💻');
      expect(inspection.metadata.keywords).toContain('unicode-🚀');

      // Verify in pdfjs-dist
      const pdfjsDoc = await pdfjsLib.getDocument({ data: result.pdfBytes.slice(0) }).promise;
      const pdfjsMeta = await pdfjsDoc.getMetadata();
      expect(pdfjsMeta.info.Title).toContain('📄 🚀 🇮🇳');
    });

    it('operates non-destructively: preserves underlying pages, dimensions, and drawn vector/text content', async () => {
      const doc = await PDFDocument.create();
      const page1 = doc.addPage([600, 400]);
      page1.drawText('Page 1 Core Secret Content', { x: 50, y: 350, size: 14 });
      const page2 = doc.addPage([300, 300]);
      page2.drawText('Page 2 Vector Diagram Data', { x: 30, y: 200, size: 10 });
      const baseBytes = await doc.save();

      const updated = await service.applyMetadata(baseBytes, {
        title: 'Non-Destructive Metadata Update',
        author: 'Preservation Engine'
      });

      // Read back via pdf-lib and pdfjs-dist
      const checkDoc = await PDFDocument.load(updated.pdfBytes);
      expect(checkDoc.getPageCount()).toBe(2);
      expect(checkDoc.getPage(0).getWidth()).toBe(600);
      expect(checkDoc.getPage(0).getHeight()).toBe(400);
      expect(checkDoc.getPage(1).getWidth()).toBe(300);
      expect(checkDoc.getPage(1).getHeight()).toBe(300);

      // Verify text content is completely intact in pdfjs
      const pdfjsDoc = await pdfjsLib.getDocument({ data: updated.pdfBytes.slice(0) }).promise;
      const p1 = await pdfjsDoc.getPage(1);
      const text1 = await p1.getTextContent();
      const str1 = text1.items.map((i: any) => i.str).join(' ');
      expect(str1).toContain('Page 1 Core Secret Content');

      const p2 = await pdfjsDoc.getPage(2);
      const text2 = await p2.getTextContent();
      const str2 = text2.items.map((i: any) => i.str).join(' ');
      expect(str2).toContain('Page 2 Vector Diagram Data');
    });
  });

  describe('Cybersecurity Stress-Testing (XSS, XML Injection & Control Characters)', () => {
    it('neutralizes XSS and XML breakout tags (</dc:title><script>alert(1)</script>) in XMP packet and Info dict', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 200]);
      const baseBytes = await doc.save();

      const attackMetadata: PdfMetadata = {
        title: '</dc:title><script>alert("XSS")</script><dc:title>',
        author: '<img src=x onerror=alert(1)>',
        subject: '"><svg onload=alert(document.cookie)>',
        keywords: ['"><script>alert(2)</script>', 'normal-tag']
      };

      const result = await service.applyMetadata(baseBytes, attackMetadata);

      // Verify XMP packet properly escapes all HTML/XML breakout tags
      expect(result.inspection.rawXmpXml).not.toContain('<script>alert("XSS")</script>');
      expect(result.inspection.rawXmpXml).toContain('&lt;/dc:title&gt;&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
      expect(result.inspection.rawXmpXml).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(result.inspection.rawXmpXml).toContain('&quot;&gt;&lt;svg onload=alert(document.cookie)&gt;');

      // Verify PDF parses without crashing
      const pdfjsDoc = await pdfjsLib.getDocument({ data: result.pdfBytes.slice(0) }).promise;
      expect(pdfjsDoc.numPages).toBe(1);
    });

    it('neutralizes XML Entity Expansion (Billion Laughs / XXE: <!DOCTYPE, <!ENTITY>) from metadata fields', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 200]);
      const baseBytes = await doc.save();

      const xxePayload: PdfMetadata = {
        title: '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ELEMENT lolz (#PCDATA)><!ENTITY lol1 "&lol;&lol;">]> &lol1;',
        author: '<!ENTITY xxe SYSTEM "file:///etc/passwd"> &xxe;',
        subject: '<![CDATA[Raw Unescaped Payload]]>'
      };

      const result = await service.applyMetadata(baseBytes, xxePayload);

      // Verify DOCTYPE and ENTITY declarations were completely stripped/neutralized
      expect(result.inspection.rawXmpXml).not.toContain('<!DOCTYPE');
      expect(result.inspection.rawXmpXml).not.toContain('<!ENTITY');
      expect(result.inspection.rawXmpXml).not.toContain('<![CDATA[');

      // Verify document opens cleanly
      const checkDoc = await PDFDocument.load(result.pdfBytes);
      expect(checkDoc.getPageCount()).toBe(1);
    });

    it('strips null-byte injection (\\0) and control characters from PDF string literals', async () => {
      const dirty = 'Confidential\u0000Report\u0001With\u0008Control\u001FChars';
      const clean = service.sanitizeString(dirty);
      expect(clean).toBe('ConfidentialReportWithControlChars');
      expect(clean).not.toContain('\u0000');

      const doc = await PDFDocument.create();
      doc.addPage([400, 200]);
      const baseBytes = await doc.save();

      const result = await service.applyMetadata(baseBytes, {
        title: 'Title\u0000NullByteInjected',
        author: 'Author\u0007BellCharacter'
      });

      expect(result.inspection.metadata.title).toBe('TitleNullByteInjected');
      expect(result.inspection.metadata.author).toBe('AuthorBellCharacter');
      expect(result.inspection.rawXmpXml).not.toContain('\u0000');
    });

    it('handles unescaped parentheses in Info dictionary string literals cleanly', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 200]);
      const baseBytes = await doc.save();

      const parensMetadata: PdfMetadata = {
        title: 'Specification (Project Titan) [v2.0] (Draft (Confidential))',
        author: 'Jane Doe (Lead Architect)',
        subject: 'Internal Evaluation (Do Not Distribute)'
      };

      const result = await service.applyMetadata(baseBytes, parensMetadata);

      // Verify readMetadata can read it back cleanly
      const inspection = await service.readMetadata(result.pdfBytes);
      expect(inspection.metadata.title).toBe('Specification (Project Titan) [v2.0] (Draft (Confidential))');
      expect(inspection.metadata.author).toBe('Jane Doe (Lead Architect)');
      expect(inspection.metadata.subject).toBe('Internal Evaluation (Do Not Distribute)');

      // Verify pdfjs-dist reads back the exact parentheses without truncating
      const pdfjsDoc = await pdfjsLib.getDocument({ data: result.pdfBytes.slice(0) }).promise;
      const pdfjsMeta = await pdfjsDoc.getMetadata();
      expect(pdfjsMeta.info.Title).toBe('Specification (Project Titan) [v2.0] (Draft (Confidential))');
      expect(pdfjsMeta.info.Author).toBe('Jane Doe (Lead Architect)');
    });

    it('replaces multiline whitespace and newlines with clean spaces for single-line metadata fields', async () => {
      const multiline = 'First Line\r\nSecond Line\tThird Line';
      const singleLine = service.sanitizeSingleLineString(multiline);
      expect(singleLine).toBe('First Line Second Line Third Line');
      expect(singleLine).not.toContain('\n');
      expect(singleLine).not.toContain('\r');
    });
  });
});
