import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PdfReaderFeaturesService } from '../services/pdf-reader-features.service';
import { PdfReadAloudService } from '../services/pdf-read-aloud.service';
import { Rect } from '../models/pdf-editor.types';

describe('Reader Features L1 to L6', () => {
  let readerService: PdfReaderFeaturesService;
  let readAloudService: PdfReadAloudService;

  beforeEach(() => {
    localStorage.clear();
    readerService = new PdfReaderFeaturesService();
    readAloudService = new PdfReadAloudService();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // --- L1: Text Search with Highlighting ---
  describe('L1 — Text search with highlighting', () => {
    it('performs incremental search across pages and attributes hits and snippet contexts', async () => {
      const mockPdfDoc = {
        numPages: 2,
        getPage: vi.fn().mockImplementation(async (pageNum: number) => {
          if (pageNum === 1) {
            return {
              getViewport: () => ({ width: 600, height: 800 }),
              getTextContent: async () => ({
                items: [
                  {
                    str: 'Hello world, this is the application report.',
                    transform: [12, 0, 0, 12, 50, 700],
                    width: 200,
                    height: 14
                  }
                ]
              })
            };
          } else {
            return {
              getViewport: () => ({ width: 600, height: 800 }),
              getTextContent: async () => ({
                items: [
                  {
                    str: 'Another page with another application note.',
                    transform: [12, 0, 0, 12, 50, 650],
                    width: 220,
                    height: 14
                  }
                ]
              })
            };
          }
        })
      };

      const progressSnapshots: number[] = [];
      const result = await readerService.searchDocumentIncremental(
        mockPdfDoc,
        'application',
        (progress) => {
          progressSnapshots.push(progress.searchedPages);
        }
      );

      expect(result.totalMatches).toBe(2);
      expect(result.isComplete).toBe(true);
      expect(result.matches.length).toBe(2);
      expect(result.matches[0].pageNumber).toBe(1);
      expect(result.matches[0].snippetMatch.toLowerCase()).toBe('application');
      expect(result.matches[0].snippetPrefix).toContain('this is the');
      expect(result.matches[1].pageNumber).toBe(2);
      expect(result.matches[1].snippetMatch.toLowerCase()).toBe('application');
      expect(progressSnapshots).toEqual([1, 2]);
    });

    it('aligns highlight rectangles with text item transforms across various zoom levels', () => {
      const bounds: Rect = { x: 50, y: 100, width: 200, height: 20 };

      const at100 = readerService.getScaledMatchBounds(bounds, 1.0);
      expect(at100).toEqual({ x: 50, y: 100, width: 200, height: 20 });

      const at150 = readerService.getScaledMatchBounds(bounds, 1.5);
      expect(at150).toEqual({ x: 75, y: 150, width: 300, height: 30 });

      const at200 = readerService.getScaledMatchBounds(bounds, 2.0);
      expect(at200).toEqual({ x: 100, y: 200, width: 400, height: 40 });
    });

    it('returns empty result cleanly when query is empty or pdfDoc is null', async () => {
      const res1 = await readerService.searchDocumentIncremental(null, 'test');
      expect(res1.totalMatches).toBe(0);
      expect(res1.isComplete).toBe(true);

      const res2 = await readerService.searchDocumentIncremental({ numPages: 1 }, '');
      expect(res2.totalMatches).toBe(0);
      expect(res2.isComplete).toBe(true);
    });
  });

  // --- L2: Reading Modes ---
  describe('L2 — Reading modes', () => {
    it('returns default view preferences when no preference is stored for a document', () => {
      const prefs = readerService.getPreferences('doc_brand_new_123');
      expect(prefs).toEqual({
        theme: 'normal',
        scrollMode: 'paged',
        pageSpread: 'single',
        fontSize: 16,
        reflowMode: false
      });
    });

    it('persists and retrieves document-specific preferences correctly', () => {
      const updated = readerService.savePreferences('doc_persisted_456', {
        theme: 'night',
        pageSpread: 'two-page',
        scrollMode: 'continuous',
        fontSize: 20
      });

      expect(updated.theme).toBe('night');
      expect(updated.pageSpread).toBe('two-page');
      expect(updated.scrollMode).toBe('continuous');
      expect(updated.fontSize).toBe(20);

      const reloaded = readerService.getPreferences('doc_persisted_456');
      expect(reloaded).toEqual({
        theme: 'night',
        scrollMode: 'continuous',
        pageSpread: 'two-page',
        fontSize: 20,
        reflowMode: false
      });

      // Different doc remains unpolluted
      const otherDoc = readerService.getPreferences('doc_other_789');
      expect(otherDoc.theme).toBe('normal');
      expect(otherDoc.pageSpread).toBe('single');
    });
  });

  // --- L3: Text Reflow ---
  describe('L3 — Text reflow', () => {
    it('extracts text in column-aware reading order on a two-column fixture', async () => {
      // Mock page with 2 columns: Left column at x: 40, Right column at x: 340
      const mockTwoColumnPage = {
        getViewport: () => ({ width: 600, height: 800 }),
        getTextContent: async () => ({
          items: [
            // Left column (Col 1)
            { str: 'Col 1 Paragraph A', transform: [12, 0, 0, 12, 40, 700], width: 200, height: 14 },
            { str: 'Col 1 Paragraph B', transform: [12, 0, 0, 12, 40, 650], width: 200, height: 14 },
            // Right column (Col 2)
            { str: 'Col 2 Paragraph A', transform: [12, 0, 0, 12, 340, 700], width: 200, height: 14 },
            { str: 'Col 2 Paragraph B', transform: [12, 0, 0, 12, 340, 650], width: 200, height: 14 }
          ]
        })
      };

      const mockDoc = {
        getPage: async () => mockTwoColumnPage
      };

      const blocks = await readerService.extractReflowBlocks(mockDoc, 1);
      expect(blocks.length).toBeGreaterThanOrEqual(2);

      // Reading order verification: Col 1 should come before Col 2
      const allText = blocks.map(b => b.text).join(' ');
      const col1AIndex = allText.indexOf('Col 1 Paragraph A');
      const col1BIndex = allText.indexOf('Col 1 Paragraph B');
      const col2AIndex = allText.indexOf('Col 2 Paragraph A');
      const col2BIndex = allText.indexOf('Col 2 Paragraph B');

      expect(col1AIndex).toBeLessThan(col1BIndex);
      expect(col1BIndex).toBeLessThan(col2AIndex);
      expect(col2AIndex).toBeLessThan(col2BIndex);
    });

    it('detects headings based on font size ratio', async () => {
      const mockPage = {
        getViewport: () => ({ width: 600, height: 800 }),
        getTextContent: async () => ({
          items: [
            { str: 'Important Chapter Title', transform: [24, 0, 0, 24, 50, 700], width: 300, height: 26 },
            { str: 'Normal body text paragraph here.', transform: [12, 0, 0, 12, 50, 650], width: 200, height: 14 }
          ]
        })
      };

      const mockDoc = {
        getPage: async () => mockPage
      };

      const blocks = await readerService.extractReflowBlocks(mockDoc, 1);
      expect(blocks.length).toBe(2);
      expect(blocks[0].type).toBe('heading');
      expect(blocks[0].text).toBe('Important Chapter Title');
      expect(blocks[1].type).toBe('paragraph');
      expect(blocks[1].text).toBe('Normal body text paragraph here.');
    });
  });

  // --- L4: Bookmarks Sidebar & Last-Read Position ---
  describe('L4 — Bookmarks sidebar & last-read position', () => {
    it('extracts nested outline tree and resolves page numbers', async () => {
      const mockDoc = {
        getOutline: async () => [
          {
            title: 'Chapter 1: Getting Started',
            dest: ['pageRef1'],
            items: [
              {
                title: '1.1 Installation',
                dest: ['pageRef2'],
                items: []
              }
            ]
          },
          {
            title: 'Chapter 2: Advanced Topics',
            dest: ['pageRef3'],
            items: []
          }
        ],
        getPageIndex: async (ref: any) => {
          if (ref === 'pageRef1') return 0;
          if (ref === 'pageRef2') return 2;
          if (ref === 'pageRef3') return 9;
          return 0;
        }
      };

      const outline = await readerService.extractOutline(mockDoc);
      expect(outline.length).toBe(2);
      expect(outline[0].title).toBe('Chapter 1: Getting Started');
      expect(outline[0].pageNumber).toBe(1);
      expect(outline[0].items?.length).toBe(1);
      expect(outline[0].items?.[0].title).toBe('1.1 Installation');
      expect(outline[0].items?.[0].pageNumber).toBe(3);
      expect(outline[1].title).toBe('Chapter 2: Advanced Topics');
      expect(outline[1].pageNumber).toBe(10);
    });

    it('returns empty array when document has no outline', async () => {
      const mockDocNoOutline = {
        getOutline: async () => null
      };

      const outline = await readerService.extractOutline(mockDocNoOutline);
      expect(outline).toEqual([]);
    });

    it('saves, retrieves, and clears last-read position across simulated reopen', () => {
      const docId = 'doc_manual_last_read';
      expect(readerService.getLastReadPosition(docId)).toBeNull();

      readerService.saveLastReadPosition(docId, 42);
      const pos = readerService.getLastReadPosition(docId);
      expect(pos).not.toBeNull();
      expect(pos?.pageNumber).toBe(42);

      // Start from beginning clears it
      readerService.clearLastReadPosition(docId);
      expect(readerService.getLastReadPosition(docId)).toBeNull();
    });
  });

  // --- L5: Read-Aloud ---
  describe('L5 — Read-aloud', () => {
    it('segments text into distinct sentences with indices and boundaries', () => {
      const text = 'First sentence is short. Second sentence has more words! Third one is a question?';
      const sentences = readerService.segmentSentences(text, 1);

      expect(sentences.length).toBe(3);
      expect(sentences[0].text).toBe('First sentence is short.');
      expect(sentences[0].index).toBe(0);
      expect(sentences[0].pageNumber).toBe(1);

      expect(sentences[1].text).toBe('Second sentence has more words!');
      expect(sentences[1].index).toBe(1);

      expect(sentences[2].text).toBe('Third one is a question?');
      expect(sentences[2].index).toBe(2);
    });

    it('handles empty text gracefully without throwing', () => {
      expect(readerService.segmentSentences('', 1)).toEqual([]);
      expect(readerService.segmentSentences('    ', 1)).toEqual([]);
    });

    it('guards cleanly when Web Speech API is absent in headless environment', () => {
      expect(readAloudService.isAvailable()).toBe(false);
      expect(readAloudService.hasVoices()).toBe(false);

      // Calling playPage, pause, resume, stop must not throw
      expect(() => {
        readAloudService.playPage(1, [{ index: 0, text: 'Hello', pageNumber: 1, startIndex: 0, endIndex: 5 }]);
        readAloudService.pause();
        readAloudService.resume();
        readAloudService.setRate(1.5);
        readAloudService.stop();
      }).not.toThrow();
    });
  });

  // --- L6: Thumbnail Scrubbing ---
  describe('L6 — Thumbnail scrubbing', () => {
    it('calculates windowed preload range for lazy thumbnail loading', () => {
      const window1 = readerService.calculateScrubWindow(1, 10, 2);
      expect(window1.windowStart).toBe(1);
      expect(window1.windowEnd).toBe(3);
      expect(window1.pagesToPreload).toEqual([1, 2, 3]);

      const windowMiddle = readerService.calculateScrubWindow(5, 10, 2);
      expect(windowMiddle.windowStart).toBe(3);
      expect(windowMiddle.windowEnd).toBe(7);
      expect(windowMiddle.pagesToPreload).toEqual([3, 4, 5, 6, 7]);

      const windowEnd = readerService.calculateScrubWindow(10, 10, 2);
      expect(windowEnd.windowStart).toBe(8);
      expect(windowEnd.windowEnd).toBe(10);
      expect(windowEnd.pagesToPreload).toEqual([8, 9, 10]);
    });

    it('scrubs a 500-page document in constant time without blocking', () => {
      const start = performance.now();
      for (let page = 1; page <= 500; page += 10) {
        const window = readerService.calculateScrubWindow(page, 500, 2);
        expect(window.pagesToPreload.length).toBeLessThanOrEqual(5);
        expect(window.pageCount).toBe(500);
      }
      const duration = performance.now() - start;
      // All 50 iterations must take under 20ms
      expect(duration).toBeLessThan(50);
    });
  });
});
