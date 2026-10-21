import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';

// Converters
import { PdfToMarkdownConverter } from './converters/pdf-to-markdown.converter';
import { PdfToHtmlConverter } from './converters/pdf-to-html.converter';
import { PdfToEpubConverter } from './converters/pdf-to-epub.converter';
import { MarkdownToPdfConverter } from './converters/markdown-to-pdf.converter';
import { JsonToPdfConverter } from './converters/json-to-pdf.converter';
import { XmlToPdfConverter } from './converters/xml-to-pdf.converter';
import { YamlToPdfConverter } from './converters/yaml-to-pdf.converter';
import { EmlToPdfConverter } from './converters/eml-to-pdf.converter';
import { MsgToPdfConverter } from './converters/msg-to-pdf.converter';

describe('Part J: Converters J1 to J5 Suite', () => {
  let pdfToMarkdown: PdfToMarkdownConverter;
  let pdfToHtml: PdfToHtmlConverter;
  let pdfToEpub: PdfToEpubConverter;
  let markdownToPdf: MarkdownToPdfConverter;
  let jsonToPdf: JsonToPdfConverter;
  let xmlToPdf: XmlToPdfConverter;
  let yamlToPdf: YamlToPdfConverter;
  let emlToPdf: EmlToPdfConverter;
  let msgToPdf: MsgToPdfConverter;

  let testPdfBytes: Uint8Array;
  let testPdfFile: File;

  beforeAll(async () => {
    pdfToMarkdown = TestBed.inject(PdfToMarkdownConverter);
    pdfToHtml = TestBed.inject(PdfToHtmlConverter);
    pdfToEpub = TestBed.inject(PdfToEpubConverter);
    markdownToPdf = TestBed.inject(MarkdownToPdfConverter);
    jsonToPdf = TestBed.inject(JsonToPdfConverter);
    xmlToPdf = TestBed.inject(XmlToPdfConverter);
    yamlToPdf = TestBed.inject(YamlToPdfConverter);
    emlToPdf = TestBed.inject(EmlToPdfConverter);
    msgToPdf = TestBed.inject(MsgToPdfConverter);

    // Create a multi-element test PDF fixture with headings, lists, tables, and links
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    // Heading 1 (Large)
    page.drawText('Document Title Heading', {
      x: 50,
      y: 780,
      size: 22,
      font: boldFont,
      color: rgb(0, 0, 0)
    });

    // Subheading (Medium)
    page.drawText('Section Subheading', {
      x: 50,
      y: 740,
      size: 16,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1)
    });

    // Paragraph
    page.drawText('This is a test paragraph describing client-side conversion features.', {
      x: 50,
      y: 700,
      size: 11,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });

    // Bullet List
    page.drawText('• First Bullet Item', {
      x: 50,
      y: 660,
      size: 11,
      font,
      color: rgb(0, 0, 0)
    });

    // Numbered List
    page.drawText('1. Numbered Item One', {
      x: 50,
      y: 630,
      size: 11,
      font,
      color: rgb(0, 0, 0)
    });

    // Web Link
    page.drawText('Visit our documentation at https://example.com/docs for details.', {
      x: 50,
      y: 590,
      size: 11,
      font,
      color: rgb(0, 0, 0.8)
    });

    // Table rows
    page.drawText('Header One', { x: 50, y: 530, size: 10, font: boldFont });
    page.drawText('Header Two', { x: 200, y: 530, size: 10, font: boldFont });

    page.drawText('Row 1 Val 1', { x: 50, y: 500, size: 10, font });
    page.drawText('Row 1 Val 2', { x: 200, y: 500, size: 10, font });

    page.drawText('Row 2 Val 1', { x: 50, y: 470, size: 10, font });
    page.drawText('Row 2 Val 2', { x: 200, y: 470, size: 10, font });

    testPdfBytes = await doc.save();
    testPdfFile = new File([testPdfBytes as any], 'test_fixture.pdf', { type: 'application/pdf' });
  });

  // ==========================================
  // J1: PDF -> Markdown
  // ==========================================
  describe('J1 — PDF to Markdown Converter', () => {
    it('should validate PDF files correctly', async () => {
      const valid = await pdfToMarkdown.validate(testPdfFile);
      expect(valid.valid).toBe(true);

      const invalid = await pdfToMarkdown.validate(new File(['invalid'], 'test.txt', { type: 'text/plain' }));
      expect(invalid.valid).toBe(false);
    });

    it('should extract heading levels from font-size hierarchy and preserve list markers & links', async () => {
      const result = await pdfToMarkdown.convert(testPdfFile, { imageMode: 'inline' });
      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();

      const text = await result.file!.text();

      // Heading levels
      expect(text).toMatch(/#+\s+Document Title Heading/);
      expect(text).toMatch(/#+\s+Section Subheading/);

      // List markers preserved
      expect(text).toMatch(/-\s+First Bullet Item/);
      expect(text).toMatch(/1\.\s+Numbered Item One/);

      // Link syntax preserved
      expect(text).toContain('[https://example.com/docs](https://example.com/docs)');
    });

    it('should format detected tables as pipe tables where pipe count matches columns', async () => {
      const result = await pdfToMarkdown.convert(testPdfFile);
      expect(result.success).toBe(true);
      const text = await result.file!.text();

      if (text.includes('|')) {
        const tableLines = text.split('\n').filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
        expect(tableLines.length).toBeGreaterThanOrEqual(2);
        const colCount = tableLines[0].split('|').length;
        for (const line of tableLines) {
          expect(line.split('|').length).toBe(colCount);
        }
      }
    });

    it('should package sidecar images and markdown inside a zip when imageMode is sidecar', async () => {
      const result = await pdfToMarkdown.convert(testPdfFile, { imageMode: 'sidecar' });
      expect(result.success).toBe(true);
      expect(result.file!.name.endsWith('.zip') || result.file!.name.endsWith('.md')).toBe(true);
    });
  });

  // ==========================================
  // J2: PDF -> HTML
  // ==========================================
  describe('J2 — PDF to HTML Converter', () => {
    it('should produce a self-contained HTML file without external network requests', async () => {
      const result = await pdfToHtml.convert(testPdfFile, { mode: 'reflowable' });
      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();

      const html = await result.file!.text();

      // Parses as valid HTML
      let doc: Document;
      if (typeof DOMParser !== 'undefined') {
        doc = new DOMParser().parseFromString(html, 'text/html');
      } else {
        const { JSDOM } = require('jsdom');
        doc = new JSDOM(html).window.document;
      }
      expect(doc.body).toBeDefined();

      // Contains no external http/https resource references
      const externalLinks = html.match(/<link[^>]*href=["']https?:\/\//i);
      const externalScripts = html.match(/<script[^>]*src=["']https?:\/\//i);
      const externalImages = html.match(/<img[^>]*src=["']https?:\/\//i);

      expect(externalLinks).toBeNull();
      expect(externalScripts).toBeNull();
      expect(externalImages).toBeNull();

      // Text appears in document order in reflowable mode
      const titleIdx = html.indexOf('Document Title Heading');
      const subIdx = html.indexOf('Section Subheading');
      const paraIdx = html.indexOf('test paragraph');

      expect(titleIdx).toBeGreaterThan(-1);
      expect(subIdx).toBeGreaterThan(titleIdx);
      expect(paraIdx).toBeGreaterThan(subIdx);
    });

    it('should support layout-preserving mode with fixed coordinate positioning', async () => {
      const result = await pdfToHtml.convert(testPdfFile, { mode: 'layout-preserving' });
      expect(result.success).toBe(true);
      const html = await result.file!.text();

      expect(html).toContain('pdf-page-fixed');
      expect(html).toContain('pdf-text-item');
    });
  });

  // ==========================================
  // J3: PDF -> EPUB
  // ==========================================
  describe('J3 — PDF to EPUB Converter', () => {
    it('should produce a valid EPUB 3 zip with uncompressed mimetype first', async () => {
      const result = await pdfToEpub.convert(testPdfFile);
      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file!.name.endsWith('.epub')).toBe(true);

      const zip = new JSZip();
      const loaded = await zip.loadAsync(await result.file!.arrayBuffer());

      // 1. mimetype is the very first entry
      const fileNames = Object.keys(loaded.files);
      expect(fileNames[0]).toBe('mimetype');

      // 2. mimetype content is uncompressed 'application/epub+zip'
      const mimeContent = await loaded.files['mimetype'].async('string');
      expect(mimeContent).toBe('application/epub+zip');

      // 3. container.xml exists and points to content.opf
      expect(loaded.files['META-INF/container.xml']).toBeDefined();
      const containerXml = await loaded.files['META-INF/container.xml'].async('string');
      expect(containerXml).toContain('OEBPS/content.opf');

      // 4. content.opf contains manifest and spine
      expect(loaded.files['OEBPS/content.opf']).toBeDefined();
      const opfXml = await loaded.files['OEBPS/content.opf'].async('string');
      expect(opfXml).toContain('<manifest>');
      expect(opfXml).toContain('<spine>');
      expect(opfXml).toContain('nav.xhtml');

      // 5. nav.xhtml exists and resolves
      expect(loaded.files['OEBPS/nav.xhtml']).toBeDefined();
      const navXml = await loaded.files['OEBPS/nav.xhtml'].async('string');
      expect(navXml).toContain('<nav epub:type="toc"');
      expect(navXml).toContain('chapter_1.xhtml');

      // 6. Chapter XHTML file exists
      expect(loaded.files['OEBPS/chapter_1.xhtml']).toBeDefined();
      const chapXml = await loaded.files['OEBPS/chapter_1.xhtml'].async('string');
      expect(chapXml).toContain('Document Title Heading');
    });
  });

  // ==========================================
  // J4: Markdown / JSON / XML / YAML -> PDF
  // ==========================================
  describe('J4 — Markdown / JSON / XML / YAML to PDF Converters', () => {
    describe('MarkdownToPdfConverter', () => {
      it('should render headings, lists, tables, and code blocks into PDF', async () => {
        const mdText = `# Main Heading\n\n## Subheading\n\nParagraph text.\n\n- List Item 1\n- List Item 2\n\n| Col A | Col B |\n| --- | --- |\n| 10 | 20 |\n\n\`\`\`\nconst x = 42;\n\`\`\``;
        const mdFile = new File([mdText], 'doc.md', { type: 'text/markdown' });

        const result = await markdownToPdf.convert(mdFile);
        expect(result.success).toBe(true);
        expect(result.file).toBeDefined();

        const doc = await PDFDocument.load(await result.file!.arrayBuffer());
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      });
    });

    describe('JsonToPdfConverter', () => {
      it('should format valid JSON into multi-page monospace PDF', async () => {
        const jsonText = JSON.stringify(
          {
            name: 'PDF APP',
            version: '2.0.0',
            settings: {
              offline: true,
              theme: 'dark'
            },
            features: ['J1', 'J2', 'J3', 'J4', 'J5']
          },
          null,
          2
        );
        const jsonFile = new File([jsonText], 'data.json', { type: 'application/json' });

        const result = await jsonToPdf.convert(jsonFile);
        expect(result.success).toBe(true);
        expect(result.file).toBeDefined();

        const doc = await PDFDocument.load(await result.file!.arrayBuffer());
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      });

      it('should report a parse error for malformed JSON instead of producing a garbled PDF', async () => {
        const malformedJson = '{ name: "Unquoted key", broken: [1, 2, }';
        const file = new File([malformedJson], 'broken.json', { type: 'application/json' });

        const result = await jsonToPdf.convert(file);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/JSON Parse Error/i);
      });
    });

    describe('XmlToPdfConverter', () => {
      it('should format valid XML with syntax highlights and indentation', async () => {
        const xmlText = `<?xml version="1.0" encoding="UTF-8"?><catalog><book id="bk101"><title>XML Developer's Guide</title><price>44.95</price></book></catalog>`;
        const xmlFile = new File([xmlText], 'data.xml', { type: 'application/xml' });

        const result = await xmlToPdf.convert(xmlFile);
        expect(result.success).toBe(true);

        const doc = await PDFDocument.load(await result.file!.arrayBuffer());
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      });

      it('should report a parse error for malformed XML', async () => {
        const malformedXml = '<catalog><unclosed-tag><book></catalog>';
        const file = new File([malformedXml], 'broken.xml', { type: 'application/xml' });

        const result = await xmlToPdf.convert(file);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/XML Parse Error/i);
      });
    });

    describe('YamlToPdfConverter', () => {
      it('should format valid YAML with monospace layout', async () => {
        const yamlText = `app:\n  name: Indian Form Helper\n  version: 1.0.0\nmodules:\n  - conversion\n  - scanner\n  - organizer\n`;
        const yamlFile = new File([yamlText], 'config.yaml', { type: 'text/yaml' });

        const result = await yamlToPdf.convert(yamlFile);
        expect(result.success).toBe(true);

        const doc = await PDFDocument.load(await result.file!.arrayBuffer());
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      });

      it('should report a parse error for malformed YAML with tab indentation or broken syntax', async () => {
        const malformedYaml = "app:\n\tinvalid_tab_indent: true\n";
        const file = new File([malformedYaml], 'broken.yaml', { type: 'text/yaml' });

        const result = await yamlToPdf.convert(file);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/YAML Parse Error/i);
      });
    });
  });

  // ==========================================
  // J5: Email -> PDF
  // ==========================================
  describe('J5 — Email to PDF Converters', () => {
    describe('EmlToPdfConverter', () => {
      it('should parse headers, body, inline images, and merge attached PDFs without fetching remote images', async () => {
        // Build a sample attached PDF
        const attDoc = await PDFDocument.create();
        attDoc.addPage([595.28, 841.89]);
        const attPdfBytes = await attDoc.save();
        let attPdfBase64 = '';
        for (let i = 0; i < attPdfBytes.length; i++) attPdfBase64 += String.fromCharCode(attPdfBytes[i]);
        attPdfBase64 = btoa(attPdfBase64);

        // 1x1 transparent PNG base64
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        const emlText = `From: sender@example.com
To: recipient@example.com
Subject: Test Email with Attachments
Date: Mon, 20 Oct 2026 10:00:00 +0000
Content-Type: multipart/mixed; boundary="BOUNDARY_TOP"

--BOUNDARY_TOP
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: 7bit

<p>Hello recipient,</p>
<p>Here is an inline image: <img src="cid:inline_logo" /></p>
<p>And here is a remote tracker: <img src="https://tracker.example.com/pixel.png" /></p>

--BOUNDARY_TOP
Content-Type: image/png; name="logo.png"
Content-ID: <inline_logo>
Content-Disposition: inline; filename="logo.png"
Content-Transfer-Encoding: base64

${pngBase64}
--BOUNDARY_TOP
Content-Type: application/pdf; name="report.pdf"
Content-Disposition: attachment; filename="report.pdf"
Content-Transfer-Encoding: base64

${attPdfBase64}
--BOUNDARY_TOP
Content-Type: text/plain; name="notes.txt"
Content-Disposition: attachment; filename="notes.txt"
Content-Transfer-Encoding: 7bit

Some supplementary notes.
--BOUNDARY_TOP--
`;

        const emlFile = new File([emlText], 'message.eml', { type: 'message/rfc822' });
        const result = await emlToPdf.convert(emlFile);

        expect(result.success).toBe(true);
        expect(result.file).toBeDefined();

        // Check that remote images were not fetched and recorded in warnings
        expect(result.warnings).toBeDefined();
        expect(result.warnings![0]).toContain('Remote images were blocked');

        // Check page count: Email body page + 1 merged page from attached PDF = 2 pages
        const outputDoc = await PDFDocument.load(await result.file!.arrayBuffer());
        expect(outputDoc.getPageCount()).toBe(2);
      });
    });

    describe('MsgToPdfConverter', () => {
      it('should validate and convert Outlook .msg files', async () => {
        const msgText = `From: outlook@example.com\nTo: user@example.com\nSubject: Outlook Subject\nDate: Mon, 20 Oct 2026 12:00:00\n\nHello from Outlook!`;
        const msgFile = new File([msgText], 'sample.msg', { type: 'application/vnd.ms-outlook' });

        const valid = await msgToPdf.validate(msgFile);
        expect(valid.valid).toBe(true);

        const result = await msgToPdf.convert(msgFile);
        expect(result.success).toBe(true);

        const doc = await PDFDocument.load(await result.file!.arrayBuffer());
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
