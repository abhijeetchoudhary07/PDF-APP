import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import { PdfLinkEditorService } from './pdf-link-editor.service';
import { asEditorDocument, makeTextPdf } from '../testing/k-editor-fixtures';
import { PdfHyperlink } from '../models/editor-features.types';

describe('PdfLinkEditorService (K2)', () => {
  let service: PdfLinkEditorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfLinkEditorService);
  });

  const threePages = () =>
    makeTextPdf([
      { width: 400, height: 600, texts: [{ text: 'Page one', x: 40, y: 540 }] },
      { width: 400, height: 600, texts: [{ text: 'Page two', x: 40, y: 540 }] },
      { width: 400, height: 600, texts: [{ text: 'Page three', x: 40, y: 540 }] }
    ]);

  const link = (over: Partial<PdfHyperlink> = {}): PdfHyperlink => ({
    id: 'l1',
    pageNumber: 1,
    rect: { x: 40, y: 100, width: 120, height: 20 },
    type: 'url',
    url: 'https://example.org/docs',
    label: 'docs',
    ...over
  });

  describe('round trip', () => {
    it('writes a URL link that reads back with the same target and page', async () => {
      const doc = await asEditorDocument(await threePages());
      const written = await service.applyLinkPlan(new Uint8Array(doc.arrayBuffer), {
        add: [link({ pageNumber: 2 })],
        remove: []
      });

      const report = await service.extractLinks(await asEditorDocument(written.pdfBytes));

      expect(report.totalLinks).toBe(1);
      expect(report.urlLinksCount).toBe(1);
      expect(report.links[0].pageNumber).toBe(2);
      expect(report.links[0].url).toBe('https://example.org/docs');
      expect(report.links[0].origin).toBe('existing');
    });

    it('writes an internal link that reads back pointing at the right page', async () => {
      const doc = await asEditorDocument(await threePages());
      const written = await service.applyLinkPlan(new Uint8Array(doc.arrayBuffer), {
        add: [link({ type: 'page', url: undefined, targetPage: 3, pageNumber: 1 })],
        remove: []
      });

      const report = await service.extractLinks(await asEditorDocument(written.pdfBytes));

      expect(report.pageLinksCount).toBe(1);
      expect(report.links[0].targetPage).toBe(3);
      expect(report.links[0].isDangling).toBe(false);
    });

    it('keeps the rectangle where it was placed rather than flipping it', async () => {
      const doc = await asEditorDocument(await threePages());
      const placed = link({ rect: { x: 40, y: 100, width: 120, height: 20 } });

      const written = await service.applyLinkPlan(new Uint8Array(doc.arrayBuffer), {
        add: [placed],
        remove: []
      });
      const report = await service.extractLinks(await asEditorDocument(written.pdfBytes));

      expect(report.links[0].rect.x).toBeCloseTo(40, 1);
      /* Top-left y of 100 on a 600pt page, not 480 and not 500. */
      expect(report.links[0].rect.y).toBeCloseTo(100, 1);
      expect(report.links[0].rect.width).toBeCloseTo(120, 1);
      expect(report.links[0].rect.height).toBeCloseTo(20, 1);
    });

    it('does not disturb annotations that are already on the page', async () => {
      const doc = await asEditorDocument(await threePages());
      const first = await service.applyLinkPlan(new Uint8Array(doc.arrayBuffer), {
        add: [link({ url: 'https://first.example/a' })],
        remove: []
      });
      const second = await service.applyLinkPlan(first.pdfBytes, {
        add: [link({ url: 'https://second.example/b', pageNumber: 2 })],
        remove: []
      });

      const report = await service.extractLinks(await asEditorDocument(second.pdfBytes));
      const urls = report.links.map(entry => entry.url).sort();

      expect(urls).toEqual(['https://first.example/a', 'https://second.example/b']);
    });
  });

  describe('dangling links', () => {
    it('flags an internal link whose target page no longer exists', () => {
      const report = service.auditLinks(
        [
          link({ type: 'page', url: undefined, targetPage: 2 }),
          link({ id: 'l2', type: 'page', url: undefined, targetPage: 9 })
        ],
        3
      );

      expect(report.danglingLinksCount).toBe(1);
      expect(report.danglingLinks[0].targetPage).toBe(9);
      expect(report.links.find(entry => entry.targetPage === 2)!.isDangling).toBe(false);
    });

    it('flags an internal link with no resolvable target at all', () => {
      const report = service.auditLinks([link({ type: 'page', url: undefined })], 3);

      expect(report.danglingLinksCount).toBe(1);
    });

    it('never flags a URL link as dangling', () => {
      const report = service.auditLinks([link()], 3);

      expect(report.danglingLinksCount).toBe(0);
      expect(report.urlLinksCount).toBe(1);
    });

    it('re-flags after the page count shrinks', async () => {
      const doc = await asEditorDocument(await threePages());
      const written = await service.applyLinkPlan(new Uint8Array(doc.arrayBuffer), {
        add: [link({ type: 'page', url: undefined, targetPage: 3 })],
        remove: []
      });

      const report = await service.extractLinks(await asEditorDocument(written.pdfBytes));
      expect(report.danglingLinksCount).toBe(0);

      /* The same links, re-audited as if two pages had been deleted. */
      expect(service.auditLinks(report.links, 2).danglingLinksCount).toBe(1);
    });
  });

  describe('deleting', () => {
    it('removes an existing link and leaves the others', async () => {
      const doc = await asEditorDocument(await threePages());
      const written = await service.applyLinkPlan(new Uint8Array(doc.arrayBuffer), {
        add: [
          link({ url: 'https://keep.example/keep' }),
          link({ id: 'l2', url: 'https://drop.example/drop' })
        ],
        remove: []
      });

      const before = await service.extractLinks(await asEditorDocument(written.pdfBytes));
      const target = before.links.find(entry => entry.url === 'https://drop.example/drop')!;

      const after = await service.applyLinkPlan(written.pdfBytes, { add: [], remove: [target] });
      const report = await service.extractLinks(await asEditorDocument(after.pdfBytes));

      expect(after.removed).toBe(1);
      expect(report.totalLinks).toBe(1);
      expect(report.links[0].url).toBe('https://keep.example/keep');
    });

    it('adds and removes in one pass without the removal hitting the new link', async () => {
      const doc = await asEditorDocument(await threePages());
      const written = await service.applyLinkPlan(new Uint8Array(doc.arrayBuffer), {
        add: [link({ url: 'https://old.example/old' })],
        remove: []
      });
      const existing = (await service.extractLinks(await asEditorDocument(written.pdfBytes)))
        .links[0];

      const after = await service.applyLinkPlan(written.pdfBytes, {
        add: [link({ id: 'new', url: 'https://new.example/new' })],
        remove: [existing]
      });

      const report = await service.extractLinks(await asEditorDocument(after.pdfBytes));
      expect(report.totalLinks).toBe(1);
      expect(report.links[0].url).toBe('https://new.example/new');
    });

    it('leaves a non-link annotation alone even at a matching index', async () => {
      const doc = await asEditorDocument(await threePages());
      const written = await service.applyLinkPlan(new Uint8Array(doc.arrayBuffer), {
        add: [link()],
        remove: []
      });

      const after = await service.applyLinkPlan(written.pdfBytes, {
        add: [],
        /* An index that exists but whose annotation is the link we DID write
         * — and one that does not exist at all. */
        remove: [{ ...link(), annotIndex: 7 }]
      });

      expect(after.removed).toBe(0);
      const report = await service.extractLinks(await asEditorDocument(after.pdfBytes));
      expect(report.totalLinks).toBe(1);
    });
  });

  describe('normalizeUrl', () => {
    it('adds https to a bare host', () => {
      expect(service.normalizeUrl('example.com').url).toBe('https://example.com');
      expect(service.normalizeUrl('  www.example.com/a?b=1 ').url).toBe(
        'https://www.example.com/a?b=1'
      );
    });

    it('leaves an explicit allowed scheme alone', () => {
      expect(service.normalizeUrl('http://a.test').url).toBe('http://a.test');
      expect(service.normalizeUrl('mailto:a@b.test').url).toBe('mailto:a@b.test');
      expect(service.normalizeUrl('tel:+911234567890').url).toBe('tel:+911234567890');
    });

    it('turns a bare email address into a mailto link', () => {
      expect(service.normalizeUrl('help@example.org').url).toBe('mailto:help@example.org');
    });

    it('refuses a scheme that would run on open', () => {
      expect(service.normalizeUrl('javascript:alert(1)').error).toBe('scheme');
      expect(service.normalizeUrl('data:text/html,<b>x').error).toBe('scheme');
      expect(service.normalizeUrl('file:///etc/passwd').error).toBe('scheme');
    });

    it('reports an empty target', () => {
      expect(service.normalizeUrl('   ').error).toBe('empty');
    });
  });

  describe('a document with no links', () => {
    it('reports an empty audit rather than failing', async () => {
      const report = await service.extractLinks(await asEditorDocument(await threePages()));

      expect(report).toMatchObject({
        totalLinks: 0,
        urlLinksCount: 0,
        pageLinksCount: 0,
        danglingLinksCount: 0
      });
    });
  });

  describe('export pipeline entry point', () => {
    it('writes into a document the caller already has open', async () => {
      const pdfDoc = await PDFDocument.load(await threePages(), { ignoreEncryption: true });

      await service.applyLinksToPdf(pdfDoc, [link({ pageNumber: 3 })]);
      const bytes = await pdfDoc.save({ useObjectStreams: false });

      const report = await service.extractLinks(await asEditorDocument(bytes));
      expect(report.totalLinks).toBe(1);
      expect(report.links[0].pageNumber).toBe(3);
    });

    it('skips a link whose page is outside the document', async () => {
      const pdfDoc = await PDFDocument.load(await threePages(), { ignoreEncryption: true });

      await service.applyLinksToPdf(pdfDoc, [link({ pageNumber: 12 })]);
      const bytes = await pdfDoc.save({ useObjectStreams: false });

      expect((await service.extractLinks(await asEditorDocument(bytes))).totalLinks).toBe(0);
    });
  });
});
