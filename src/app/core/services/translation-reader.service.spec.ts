import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { TranslationReaderService } from './translation-reader.service';
import { ScrollLockPageBound, TranslationSession } from '../models/pdf-intelligence.types';

describe('TranslationReaderService', () => {
  let service: TranslationReaderService;

  beforeEach(() => {
    service = TestBed.inject(TranslationReaderService);
  });

  describe('Scroll-lock Index Mapping with Unequal Text Lengths', () => {
    // Unequal page lengths:
    // Source: 3 pages of uniform height 800 (typical PDF canvas)
    // Target: 3 pages of vastly different heights due to translated text variation:
    //   Page 0: 200px (short text)
    //   Page 1: 1800px (very long translated text, ~9x longer)
    //   Page 2: 600px (medium text)
    const sourceBounds: ScrollLockPageBound[] = [
      { pageIndex: 0, offsetTop: 0, height: 800 },
      { pageIndex: 1, offsetTop: 800, height: 800 },
      { pageIndex: 2, offsetTop: 1600, height: 800 }
    ];

    const targetBounds: ScrollLockPageBound[] = [
      { pageIndex: 0, offsetTop: 0, height: 200 },
      { pageIndex: 1, offsetTop: 200, height: 1800 },
      { pageIndex: 2, offsetTop: 2000, height: 600 }
    ];

    it('accurately maps the beginning of Page 0', () => {
      const res = service.computeTargetScrollOffset(0, sourceBounds, targetBounds);
      expect(res.pageIndex).toBe(0);
      expect(res.intraPageRatio).toBe(0);
      expect(res.targetScrollTop).toBe(0);
    });

    it('accurately maps the midpoint of Page 0', () => {
      // 400px in source is halfway through Page 0 (height 800, ratio 0.5)
      // In target, Page 0 height is 200px, so target should be 100px
      const res = service.computeTargetScrollOffset(400, sourceBounds, targetBounds);
      expect(res.pageIndex).toBe(0);
      expect(res.intraPageRatio).toBe(0.5);
      expect(res.targetScrollTop).toBe(100);
    });

    it('accurately locks to Page 1 start despite unequal height difference', () => {
      // Offset 800 is the exact beginning of Page 1
      const res = service.computeTargetScrollOffset(800, sourceBounds, targetBounds);
      expect(res.pageIndex).toBe(1);
      expect(res.intraPageRatio).toBe(0);
      expect(res.targetScrollTop).toBe(200); // Target Page 1 starts at 200
    });

    it('accurately pairs intra-page progress for long unequal text length in Page 1', () => {
      // Offset 1200 in source is halfway through Page 1 (ratio 0.5)
      // Target Page 1 spans 200 to 2000 (height 1800). Halfway is 200 + 900 = 1100.
      const res = service.computeTargetScrollOffset(1200, sourceBounds, targetBounds);
      expect(res.pageIndex).toBe(1);
      expect(res.intraPageRatio).toBe(0.5);
      expect(res.targetScrollTop).toBe(1100);
    });

    it('accurately maps the transition into Page 2', () => {
      // Offset 1600 is start of Page 2
      const res = service.computeTargetScrollOffset(1600, sourceBounds, targetBounds);
      expect(res.pageIndex).toBe(2);
      expect(res.intraPageRatio).toBe(0);
      expect(res.targetScrollTop).toBe(2000); // Target Page 2 starts at 2000
    });

    it('accurately performs reverse mapping from target to source', () => {
      // Target at 1100 (midpoint of long Page 1) mapped back to source
      const reverseRes = service.computeTargetScrollOffset(1100, targetBounds, sourceBounds);
      expect(reverseRes.pageIndex).toBe(1);
      expect(reverseRes.intraPageRatio).toBe(0.5);
      expect(reverseRes.targetScrollTop).toBe(1200);
    });

    it('handles boundary and empty bounds gracefully', () => {
      const resEmpty = service.computeTargetScrollOffset(100, [], []);
      expect(resEmpty.pageIndex).toBe(0);
      expect(resEmpty.targetScrollTop).toBe(100);

      const resNegative = service.computeTargetScrollOffset(-50, sourceBounds, targetBounds);
      expect(resNegative.targetScrollTop).toBe(0);
      expect(resNegative.pageIndex).toBe(0);

      const resBeyond = service.computeTargetScrollOffset(3000, sourceBounds, targetBounds);
      expect(resBeyond.pageIndex).toBe(2);
      expect(resBeyond.intraPageRatio).toBe(1);
      expect(resBeyond.targetScrollTop).toBe(2600); // 2000 + 600
    });
  });

  describe('Layout Fidelity & Text Expansion Ratio', () => {
    it('calculates text expansion ratio accurately', () => {
      const original = 'This is the original English paragraph with brief notes.';
      // Hindi translation expands in character length by ~35%
      const translated = 'यह संक्षिप्त टिप्पणियों के साथ मूल अंग्रेजी पैराग्राफ का अनुवादित रूप है।';
      const ratio = service.calculateExpansionRatio(original, translated);
      expect(ratio).toBeGreaterThan(1.0);
      expect(typeof ratio).toBe('number');
    });

    it('returns 1.0 for empty or zero length text', () => {
      expect(service.calculateExpansionRatio('', '')).toBe(1.0);
    });
  });

  describe('Translation Session Preparation', () => {
    it('creates a complete session with paragraphs, headings, and translation', async () => {
      const pages = [
        {
          pageNumber: 1,
          text: 'Section 1: General Requirements\n\nAll candidates must submit the official application before the deadline.'
        },
        {
          pageNumber: 2,
          text: 'Section 2: Document Verification\n\nCandidates must bring original certificates and verification letters.'
        }
      ];

      const session = await service.prepareTranslationSession(
        { name: 'recruitment-policy.pdf' },
        pages,
        'hi'
      );

      expect(session.fileName).toBe('recruitment-policy.pdf');
      expect(session.pageCount).toBe(2);
      expect(session.targetLanguage).toBe('hi');
      expect(session.pages.length).toBe(2);
      expect(session.pages[0].pageNumber).toBe(1);
      expect(session.pages[0].paragraphs.length).toBeGreaterThan(0);
      expect(session.pages[0].translatedParagraphs.length).toBeGreaterThan(0);
      expect(session.executiveSummary).toBeDefined();
      expect(session.expansionSummary.averageExpansionRate).toBeGreaterThan(0);
    });
  });

  describe('DOCX Export (OpenXML Document Structure)', () => {
    it('produces a valid OpenXML document structure with page breaks matching original document', async () => {
      const sessionPages = [
        {
          pageNumber: 1,
          originalText: 'Original text for page 1.',
          translatedText: 'Translated text for page 1.',
          paragraphs: ['Section 1: Guidelines', 'First paragraph on page 1.'],
          translatedParagraphs: ['अनुभाग 1: दिशानिर्देश', 'पृष्ठ 1 पर पहला पैराग्राफ।'],
          headings: [{ text: 'Section 1: Guidelines', level: 2, pageNumber: 1 }],
          charCountOriginal: 45,
          charCountTranslated: 60,
          expansionRatio: 1.33
        },
        {
          pageNumber: 2,
          originalText: 'Original text for page 2.',
          translatedText: 'Translated text for page 2.',
          paragraphs: ['Section 2: Final Verification', 'Second paragraph on page 2.'],
          translatedParagraphs: ['अनुभाग 2: अंतिम सत्यापन', 'पृष्ठ 2 पर दूसरा पैराग्राफ।'],
          headings: [{ text: 'Section 2: Final Verification', level: 2, pageNumber: 2 }],
          charCountOriginal: 50,
          charCountTranslated: 68,
          expansionRatio: 1.36
        }
      ];

      const docxBlob = await service.exportToDocx({
        fileName: 'policy.pdf',
        title: 'Recruitment Policy Translation',
        targetLanguage: 'hi',
        sourceLanguage: 'English',
        executiveSummary: 'This document specifies official examination criteria and verification.',
        pages: sessionPages,
        includeSummary: true
      });

      // Verify MIME type
      expect(docxBlob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(docxBlob.size).toBeGreaterThan(1000);

      // Verify OpenXML structure using JSZip
      const arrayBuffer = await docxBlob.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Must have [Content_Types].xml and word/document.xml
      expect(zip.file('[Content_Types].xml')).not.toBeNull();
      expect(zip.file('word/document.xml')).not.toBeNull();

      // Read document XML
      const documentXml = await zip.file('word/document.xml')!.async('text');

      // Verify page break elements matching original pages
      expect(documentXml).toContain('w:type="page"');

      // Verify headings and paragraphs are preserved
      expect(documentXml).toContain('Recruitment Policy Translation');
      expect(documentXml).toContain('Executive Summary');
      expect(documentXml).toContain('Page 1');
      expect(documentXml).toContain('Page 2');
    });

    it('preserves bold text formatting in docx paragraphs', async () => {
      const sessionPages = [
        {
          pageNumber: 1,
          originalText: 'Notice: **Strict compliance** is required.',
          translatedText: 'Notice: **Strict compliance** is required.',
          paragraphs: ['Notice: **Strict compliance** is required.'],
          translatedParagraphs: ['Notice: **Strict compliance** is required.'],
          headings: [],
          charCountOriginal: 42,
          charCountTranslated: 42,
          expansionRatio: 1.0
        }
      ];

      const docxBlob = await service.exportToDocx({
        fileName: 'notice.pdf',
        targetLanguage: 'en',
        pages: sessionPages,
        includeSummary: false
      });

      const zip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
      const documentXml = await zip.file('word/document.xml')!.async('text');

      // Word OpenXML represents bold text with <w:b/>
      expect(documentXml).toContain('<w:b/>');
      expect(documentXml).toContain('Strict compliance');
    });
  });

  describe('Translated PDF Output (Page Breaks & Formatting)', () => {
    it('produces formatted PDF with page breaks matching original document', async () => {
      const sessionPages = [
        {
          pageNumber: 1,
          originalText: 'Official recruitment rules and application details.',
          translatedText: 'Official recruitment rules and application details.',
          paragraphs: ['Section 1: Eligibility Rules', 'All applicants must submit before the deadline.'],
          translatedParagraphs: ['Section 1: Eligibility Rules', 'All applicants must submit before the deadline.'],
          headings: [{ text: 'Section 1: Eligibility Rules', level: 2, pageNumber: 1 }],
          charCountOriginal: 51,
          charCountTranslated: 51,
          expansionRatio: 1.0
        },
        {
          pageNumber: 2,
          originalText: 'Verification procedures and final submission guidelines.',
          translatedText: 'Verification procedures and final submission guidelines.',
          paragraphs: ['Section 2: Identity Proof', 'Bring verified certificates and official identity proof.'],
          translatedParagraphs: ['Section 2: Identity Proof', 'Bring verified certificates and official identity proof.'],
          headings: [{ text: 'Section 2: Identity Proof', level: 2, pageNumber: 2 }],
          charCountOriginal: 56,
          charCountTranslated: 56,
          expansionRatio: 1.0
        },
        {
          pageNumber: 3,
          originalText: 'Concluding remarks and contact support details.',
          translatedText: 'Concluding remarks and contact support details.',
          paragraphs: ['Section 3: Contact Details', 'For questions, contact the support desk.'],
          translatedParagraphs: ['Section 3: Contact Details', 'For questions, contact the support desk.'],
          headings: [{ text: 'Section 3: Contact Details', level: 2, pageNumber: 3 }],
          charCountOriginal: 48,
          charCountTranslated: 48,
          expansionRatio: 1.0
        }
      ];

      const pdfBlob = await service.exportToPdf({
        fileName: 'recruitment.pdf',
        targetLanguage: 'hi',
        sourceLanguage: 'English',
        executiveSummary: 'Executive overview of the recruitment process.',
        pages: sessionPages,
        includeSummary: true
      });

      expect(pdfBlob.type).toBe('application/pdf');
      expect(pdfBlob.size).toBeGreaterThan(500);

      const arrayBuffer = await pdfBlob.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      // 1 Cover/Executive summary page + 3 document pages with page breaks = 4 pages
      expect(pdfDoc.getPageCount()).toBe(4);
    });

    it('matches exact page count when executive summary is omitted', async () => {
      const sessionPages = [
        {
          pageNumber: 1,
          originalText: 'Page 1 content',
          translatedText: 'Page 1 content',
          paragraphs: ['Page 1 content'],
          translatedParagraphs: ['Page 1 content'],
          headings: [],
          charCountOriginal: 14,
          charCountTranslated: 14,
          expansionRatio: 1.0
        },
        {
          pageNumber: 2,
          originalText: 'Page 2 content',
          translatedText: 'Page 2 content',
          paragraphs: ['Page 2 content'],
          translatedParagraphs: ['Page 2 content'],
          headings: [],
          charCountOriginal: 14,
          charCountTranslated: 14,
          expansionRatio: 1.0
        }
      ];

      const pdfBlob = await service.exportToPdf({
        fileName: 'two-pages.pdf',
        targetLanguage: 'en',
        pages: sessionPages,
        includeSummary: false
      });

      const pdfDoc = await PDFDocument.load(await pdfBlob.arrayBuffer());
      expect(pdfDoc.getPageCount()).toBe(2);
    });
  });

  describe('10-Page Scroll-Lock Mapping across Unequal Page Heights', () => {
    it('maintains synchronized scroll alignment across all 10 pages', () => {
      // 10 uniform source pages (e.g. 800px standard canvas height)
      const source10Bounds: ScrollLockPageBound[] = Array.from({ length: 10 }, (_, i) => ({
        pageIndex: i,
        offsetTop: i * 800,
        height: 800
      }));

      // 10 target pages with varying translated lengths (20% to 50% expansion)
      const targetHeights = [950, 1100, 1250, 900, 1400, 1050, 1300, 850, 1200, 1150];
      let currentOffset = 0;
      const target10Bounds: ScrollLockPageBound[] = targetHeights.map((h, i) => {
        const bound = { pageIndex: i, offsetTop: currentOffset, height: h };
        currentOffset += h;
        return bound;
      });

      // Test start of Page 3 (index 2)
      const p3Res = service.computeTargetScrollOffset(1600, source10Bounds, target10Bounds);
      expect(p3Res.pageIndex).toBe(2);
      expect(p3Res.intraPageRatio).toBe(0);
      expect(p3Res.targetScrollTop).toBe(target10Bounds[2].offsetTop);

      // Test midpoint of Page 7 (index 6, offset = 6 * 800 + 400 = 5200)
      const p7Res = service.computeTargetScrollOffset(5200, source10Bounds, target10Bounds);
      expect(p7Res.pageIndex).toBe(6);
      expect(p7Res.intraPageRatio).toBe(0.5);
      const expectedP7Target = Math.round(target10Bounds[6].offsetTop + 0.5 * target10Bounds[6].height);
      expect(p7Res.targetScrollTop).toBe(expectedP7Target);

      // Test last page (Page 10, index 9)
      const p10Res = service.computeTargetScrollOffset(7200, source10Bounds, target10Bounds);
      expect(p10Res.pageIndex).toBe(9);
      expect(p10Res.intraPageRatio).toBe(0);
      expect(p10Res.targetScrollTop).toBe(target10Bounds[9].offsetTop);
    });
  });

  describe('Cybersecurity & Input Sanitization', () => {
    it('sanitizes XML control characters to prevent OpenXML corruption', () => {
      const toxicInput = 'Hello\x00World\x08Test\x0BText\x0CSample\x1FData';
      const clean = service.sanitizeXmlString(toxicInput);
      expect(clean).toBe('HelloWorldTestTextSampleData');
      expect(clean).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
    });

    it('neutralizes XXE payloads in DOCX export by escaping text runs', async () => {
      const xxePayload = '<!ENTITY xxe SYSTEM "file:///etc/passwd">&xxe;';
      const sessionPages = [
        {
          pageNumber: 1,
          originalText: xxePayload,
          translatedText: xxePayload,
          paragraphs: [xxePayload],
          translatedParagraphs: [xxePayload],
          headings: [],
          charCountOriginal: xxePayload.length,
          charCountTranslated: xxePayload.length,
          expansionRatio: 1.0
        }
      ];

      const docxBlob = await service.exportToDocx({
        fileName: 'malicious.pdf',
        targetLanguage: 'en',
        executiveSummary: xxePayload,
        pages: sessionPages,
        includeSummary: true
      });

      const zip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
      const documentXml = await zip.file('word/document.xml')!.async('text');

      // DOCX OpenXML escapes XML entities safely as &lt; and &gt;
      expect(documentXml).toContain('&lt;!ENTITY xxe SYSTEM');
      expect(documentXml).not.toContain('<!ENTITY xxe SYSTEM');
    });

    it('splits excessively long unbroken words in wrapText to prevent layout buffer overflow', () => {
      const unbrokenToken = 'A'.repeat(250);
      const lines = service.wrapText(unbrokenToken, 80);
      expect(lines.length).toBe(4); // 80 + 80 + 80 + 10
      expect(lines[0].length).toBe(80);
      expect(lines[1].length).toBe(80);
      expect(lines[2].length).toBe(80);
      expect(lines[3].length).toBe(10);
    });
  });
});
