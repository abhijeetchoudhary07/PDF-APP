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

  /*
   * ==========================================================================
   * Second pass. The suite above covers what the first implementation did;
   * everything below covers the gaps it left — the precise hit geometry, the
   * spread and continuous modes that were dead toggles, the images the reflow
   * view dropped, the outline depth the template could not render, the voice
   * gating, and the lazy window the sidebar never used.
   * ==========================================================================
   */

  describe('L1 — highlight geometry and cancellation', () => {
    /** One item of prose, so a short query sits well inside it. */
    const prosePage = (str: string) => ({
      getViewport: () => ({ width: 600, height: 800 }),
      getTextContent: async () => ({
        items: [{ str, transform: [12, 0, 0, 12, 50, 700], width: 240, height: 12 }]
      })
    });

    it('narrows the highlight to the matched characters, not the whole text item', async () => {
      // 44 characters wide, 240pt on the page: "world" is chars 6-11.
      const text = 'Hello world, this is the application report.';
      const doc = { numPages: 1, getPage: async () => prosePage(text) };

      const result = await readerService.searchDocumentIncremental(doc, 'world');
      expect(result.totalMatches).toBe(1);

      const rects = result.matches[0].rects || [];
      expect(rects.length).toBe(1);

      const perChar = 240 / text.length;
      expect(rects[0].x).toBeCloseTo(50 + perChar * text.indexOf('world'), 4);
      expect(rects[0].width).toBeCloseTo(perChar * 'world'.length, 4);
      // The old behaviour lit the entire 240pt item for a 5-character hit.
      expect(rects[0].width).toBeLessThan(240 * 0.2);
    });

    it('places the box on the matched word rather than at the item origin', async () => {
      const text = 'alpha beta gamma delta epsilon';
      const doc = { numPages: 1, getPage: async () => prosePage(text) };

      const result = await readerService.searchDocumentIncremental(doc, 'epsilon');
      const rect = (result.matches[0].rects || [])[0];

      // "epsilon" ends the line, so its box belongs in the item's last fifth.
      expect(rect.x).toBeGreaterThan(50 + 240 * 0.7);
      expect(rect.x + rect.width).toBeLessThanOrEqual(50 + 240 + 0.01);
    });

    it('returns one rectangle per text item a hit spans', async () => {
      const doc = {
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          getTextContent: async () => ({
            items: [
              // "quarterly" ends one item and "report" begins the next, which
              // is how pdf.js splits a line across font or position runs.
              { str: 'quarterly', transform: [12, 0, 0, 12, 50, 700], width: 60, height: 12 },
              { str: 'report', transform: [12, 0, 0, 12, 115, 700], width: 40, height: 12 }
            ]
          })
        })
      };

      const result = await readerService.searchDocumentIncremental(doc, 'quarterly report');
      expect(result.totalMatches).toBe(1);

      const rects = result.matches[0].rects || [];
      expect(rects.length).toBe(2);
      expect(rects[0].x).toBeCloseTo(50, 4);
      expect(rects[1].x).toBeCloseTo(115, 4);
      // bounds stays the first rectangle for callers that only read it.
      expect(result.matches[0].bounds).toEqual(rects[0]);
    });

    it('flips PDF baselines into CSS tops so a box lands on the right line', async () => {
      const doc = { numPages: 1, getPage: async () => prosePage('target') };
      const result = await readerService.searchDocumentIncremental(doc, 'target');
      // Page height 800, baseline 700, glyph height 12 -> 800 - 700 - 12.
      expect((result.matches[0].rects || [])[0].y).toBeCloseTo(88, 4);
    });

    it('scales every rectangle of a hit to the reader zoom', async () => {
      const doc = {
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          getTextContent: async () => ({
            items: [
              { str: 'split', transform: [12, 0, 0, 12, 50, 700], width: 40, height: 12 },
              { str: 'hit', transform: [12, 0, 0, 12, 95, 700], width: 24, height: 12 }
            ]
          })
        })
      };

      const result = await readerService.searchDocumentIncremental(doc, 'split hit');
      const scaled = readerService.getScaledMatchRects(result.matches[0], 2.0);

      expect(scaled.length).toBe(2);
      expect(scaled[0].x).toBe(100);
      expect(scaled[1].x).toBe(190);
    });

    it('falls back to bounds when a match carries no rect list', () => {
      const legacy = {
        id: 'm_1_0',
        pageNumber: 1,
        matchIndex: 0,
        text: 'x',
        snippetPrefix: '',
        snippetMatch: 'x',
        snippetSuffix: '',
        bounds: { x: 10, y: 20, width: 30, height: 40 }
      };
      expect(readerService.getScaledMatchRects(legacy, 1.5)).toEqual([
        { x: 15, y: 30, width: 45, height: 60 }
      ]);
    });

    it('stops at the next page boundary when the scan is aborted', async () => {
      const visited: number[] = [];
      const controller = new AbortController();

      const doc = {
        numPages: 40,
        getPage: async (pageNum: number) => {
          visited.push(pageNum);
          if (pageNum === 3) controller.abort();
          return {
            getViewport: () => ({ width: 600, height: 800 }),
            getTextContent: async () => ({
              items: [{ str: 'needle here', transform: [12, 0, 0, 12, 50, 700], width: 60, height: 12 }]
            })
          };
        }
      };

      const result = await readerService.searchDocumentIncremental(
        doc,
        'needle',
        undefined,
        controller.signal
      );

      // Three pages read, then the abort is seen before page 4 is fetched.
      expect(visited).toEqual([1, 2, 3]);
      // Not complete: an aborted scan must not read as "searched everything",
      // or the UI reports "no matches" for pages it never looked at.
      expect(result.isComplete).toBe(false);
      expect(result.searchedPages).toBe(3);
      expect(result.totalMatches).toBe(3);
    });

    it('runs to completion when no signal is passed, exactly as before', async () => {
      const doc = {
        numPages: 5,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          getTextContent: async () => ({
            items: [{ str: 'needle', transform: [12, 0, 0, 12, 50, 700], width: 40, height: 12 }]
          })
        })
      };

      const result = await readerService.searchDocumentIncremental(doc, 'needle');
      expect(result.isComplete).toBe(true);
      expect(result.searchedPages).toBe(5);
      expect(result.totalMatches).toBe(5);
    });

    it('derives a glyph height from the text matrix when pdf.js reports zero', async () => {
      const doc = {
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          getTextContent: async () => ({
            // height 0 is real pdf.js output; the old code substituted 12.
            items: [{ str: 'sized', transform: [18, 0, 0, 18, 40, 600], width: 50, height: 0 }]
          })
        })
      };

      const rect = (await readerService.searchDocumentIncremental(doc, 'sized')).matches[0].rects![0];
      expect(rect.height).toBe(18);
      expect(rect.y).toBeCloseTo(800 - 600 - 18, 4);
    });
  });

  describe('L2 — two-page spread and continuous scroll', () => {
    it('pairs spreads from page one so the pairing never shifts', () => {
      expect(readerService.getSpread(1, 10, 'two-page').pages).toEqual([1, 2]);
      expect(readerService.getSpread(2, 10, 'two-page').pages).toEqual([1, 2]);
      expect(readerService.getSpread(3, 10, 'two-page').pages).toEqual([3, 4]);
      expect(readerService.getSpread(4, 10, 'two-page').pages).toEqual([3, 4]);
    });

    it('ends an odd document on a lone page marked partial', () => {
      const spread = readerService.getSpread(7, 7, 'two-page');
      expect(spread.pages).toEqual([7]);
      expect(spread.isPartial).toBe(true);
    });

    it('returns the single current page in single mode', () => {
      const spread = readerService.getSpread(4, 10, 'single');
      expect(spread.pages).toEqual([4]);
      expect(spread.isPartial).toBe(false);
    });

    it('clamps a page outside the document', () => {
      expect(readerService.getSpread(0, 10, 'single').pages).toEqual([1]);
      expect(readerService.getSpread(99, 10, 'single').pages).toEqual([10]);
      // A one-page document has no spread to show.
      expect(readerService.getSpread(1, 1, 'two-page').pages).toEqual([1]);
    });
  });

  describe('L3 — images inline in reading order', () => {
    /*
     * A page with a heading at the top, a figure below it and a paragraph
     * under that. The operator list is the shape pdf.js produces: save,
     * transform, paint, restore.
     */
    const pageWithImage = () => {
      const bitmapData = new Uint8Array(4 * 4 * 4).fill(200);
      return {
        getViewport: () => ({ width: 600, height: 800 }),
        getTextContent: async () => ({
          items: [
            // Heading near the top: CSS top ~= 800 - 760 - 20 = 20.
            { str: 'Chapter One', transform: [20, 0, 0, 20, 50, 760], width: 120, height: 20 },
            // Paragraph low on the page: CSS top ~= 800 - 300 - 12 = 488.
            { str: 'Body text after the figure.', transform: [12, 0, 0, 12, 50, 300], width: 200, height: 12 }
          ]
        }),
        // Image 100 tall with its bottom at y=560, so CSS top = 800-660 = 140:
        // below the heading, above the paragraph.
        getOperatorList: async () => ({
          fnArray: [10, 12, 85, 11],
          argsArray: [null, [120, 0, 0, 100, 50, 560], ['img_0'], null]
        }),
        objs: {
          has: (n: string) => n === 'img_0',
          get: () => ({ width: 4, height: 4, data: bitmapData })
        },
        commonObjs: { has: () => false, get: () => null }
      };
    };

    it('extracts an image with the position its transform gives it', async () => {
      const doc = { numPages: 1, getPage: async () => pageWithImage() };
      const images = await readerService.extractReflowImages(doc, 1);

      expect(images.length).toBe(1);
      expect(images[0].width).toBe(120);
      expect(images[0].height).toBe(100);
      // 800 - (560 + 100): a CSS top, same space the text blocks use.
      expect(images[0].top).toBeCloseTo(140, 4);
      expect(images[0].dataUrl.startsWith('data:image/')).toBe(true);
    });

    it('places the image between the heading above it and the text below', async () => {
      const doc = { numPages: 1, getPage: async () => pageWithImage() };
      const blocks = await readerService.extractReflowContent(doc, 1, true);

      const types = blocks.map(b => b.type);
      expect(types).toEqual(['heading', 'image', 'paragraph']);

      const image = blocks[1];
      expect(image.imageUrl).toBeTruthy();
      expect(image.imageWidth).toBe(120);
      expect(image.imageHeight).toBe(100);
      expect(image.pageNumber).toBe(1);
    });

    it('leaves the text blocks untouched when images are not wanted', async () => {
      const doc = { numPages: 1, getPage: async () => pageWithImage() };

      const withImages = await readerService.extractReflowContent(doc, 1, true);
      const textOnly = await readerService.extractReflowContent(doc, 1, false);
      const legacy = await readerService.extractReflowBlocks(doc, 1);

      expect(textOnly.map(b => b.type)).toEqual(['heading', 'paragraph']);
      // extractReflowBlocks keeps its old output exactly.
      expect(legacy.map(b => b.text)).toEqual(textOnly.map(b => b.text));
      expect(withImages.length).toBe(textOnly.length + 1);
    });

    it('skips decorative hairlines and spacers', async () => {
      const doc = {
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          getTextContent: async () => ({ items: [] }),
          getOperatorList: async () => ({
            fnArray: [12, 85],
            // 500 x 2: a rule, not a figure.
            argsArray: [[500, 0, 0, 2, 50, 400], ['rule']]
          }),
          objs: { has: () => true, get: () => ({ width: 2, height: 2, data: new Uint8Array(16) }) },
          commonObjs: { has: () => false, get: () => null }
        })
      };

      expect(await readerService.extractReflowImages(doc, 1)).toEqual([]);
    });

    it('tracks save and restore so a nested transform does not leak', async () => {
      const data = new Uint8Array(4 * 4 * 4).fill(120);
      const doc = {
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          getTextContent: async () => ({ items: [] }),
          getOperatorList: async () => ({
            fnArray: [
              10,  // save
              12,  // transform: a translation only
              10,  // save
              12,  // transform: the image box, inside the nested state
              85,  // paint
              11,  // restore -> back to the translation
              85,  // paint again, with the inner box discarded
              11   // restore
            ],
            argsArray: [
              null,
              [1, 0, 0, 1, 0, 100],
              null,
              [80, 0, 0, 60, 10, 300],
              ['img_a'],
              null,
              ['img_b'],
              null
            ]
          }),
          objs: { has: () => true, get: () => ({ width: 4, height: 4, data }) },
          commonObjs: { has: () => false, get: () => null }
        })
      };

      const images = await readerService.extractReflowImages(doc, 1);
      // img_b sees only the translation, whose unit square is 1x1, so it is
      // dropped as decorative. Only img_a survives, at the nested box.
      expect(images.length).toBe(1);
      expect(images[0].width).toBe(80);
      expect(images[0].height).toBe(60);
    });

    it('reflows text when the page has no readable images', async () => {
      const doc = {
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          getTextContent: async () => ({
            items: [{ str: 'Only text here.', transform: [12, 0, 0, 12, 50, 700], width: 100, height: 12 }]
          }),
          getOperatorList: async () => { throw new Error('no op list'); }
        })
      };

      const blocks = await readerService.extractReflowContent(doc, 1, true);
      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].text).toBe('Only text here.');
    });

    it('keeps reading order on a two-column fixture with images off', async () => {
      const doc = {
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          getTextContent: async () => ({
            items: [
              { str: 'Left top', transform: [12, 0, 0, 12, 40, 700], width: 80, height: 12 },
              { str: 'Right top', transform: [12, 0, 0, 12, 330, 700], width: 80, height: 12 },
              { str: 'Left bottom', transform: [12, 0, 0, 12, 40, 500], width: 80, height: 12 },
              { str: 'Right bottom', transform: [12, 0, 0, 12, 330, 500], width: 80, height: 12 }
            ]
          })
        })
      };

      const text = (await readerService.extractReflowContent(doc, 1, false))
        .map(b => b.text)
        .join(' | ');
      // Down the left column before crossing to the right.
      expect(text.indexOf('Left bottom')).toBeLessThan(text.indexOf('Right top'));
    });
  });

  describe('L4 — outline nesting at any depth', () => {
    const nested = [
      {
        title: 'Part One',
        pageNumber: 1,
        items: [
          {
            title: 'Chapter A',
            pageNumber: 2,
            items: [
              { title: 'Section A.1', pageNumber: 3 },
              { title: 'Section A.2', pageNumber: 4 }
            ]
          }
        ]
      },
      { title: 'Part Two', pageNumber: 9 }
    ];

    it('shows only the top level when nothing is expanded', () => {
      const rows = readerService.flattenOutline(nested, new Set<string>());
      expect(rows.map(r => r.title)).toEqual(['Part One', 'Part Two']);
      expect(rows[0].hasChildren).toBe(true);
      expect(rows[0].expanded).toBe(false);
      expect(rows[1].hasChildren).toBe(false);
    });

    it('renders a third level once its parents are open', () => {
      // This is the depth the old two-level template could not reach.
      const rows = readerService.flattenOutline(nested, new Set(['0', '0.0']));
      expect(rows.map(r => r.title)).toEqual([
        'Part One', 'Chapter A', 'Section A.1', 'Section A.2', 'Part Two'
      ]);
      expect(rows.map(r => r.depth)).toEqual([0, 1, 2, 2, 0]);
      expect(rows.map(r => r.pageNumber)).toEqual([1, 2, 3, 4, 9]);
    });

    it('keeps a grandchild hidden while its own parent is closed', () => {
      const rows = readerService.flattenOutline(nested, new Set(['0']));
      expect(rows.map(r => r.title)).toEqual(['Part One', 'Chapter A', 'Part Two']);
      expect(rows[1].expanded).toBe(false);
    });

    it('gives every row a path key unique to its position', () => {
      const rows = readerService.flattenOutline(nested, new Set(['0', '0.0']));
      const keys = rows.map(r => r.key);
      expect(keys).toEqual(['0', '0.0', '0.0.0', '0.0.1', '1']);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('collects expandable keys only down to the requested depth', () => {
      expect(readerService.collectExpandableKeys(nested, 0)).toEqual(['0']);
      expect(readerService.collectExpandableKeys(nested, 1)).toEqual(['0', '0.0']);
    });

    it('marks the deepest section that covers the current page', () => {
      const rows = readerService.flattenOutline(nested, new Set(['0', '0.0']));

      expect(readerService.findOutlineRowForPage(rows, 3)!.title).toBe('Section A.1');
      expect(readerService.findOutlineRowForPage(rows, 5)!.title).toBe('Section A.2');
      expect(readerService.findOutlineRowForPage(rows, 10)!.title).toBe('Part Two');
      expect(readerService.findOutlineRowForPage(rows, 1)!.title).toBe('Part One');
    });

    it('handles an empty outline without throwing', () => {
      expect(readerService.flattenOutline([], new Set<string>())).toEqual([]);
      expect(readerService.collectExpandableKeys([], 2)).toEqual([]);
      expect(readerService.findOutlineRowForPage([], 1)).toBeNull();
    });
  });

  describe('L5 — voices and playback handlers', () => {
    it('reports no voices, so the control stays hidden, when the engine is absent', () => {
      expect(readAloudService.isAvailable()).toBe(false);
      expect(readAloudService.hasVoices()).toBe(false);
      expect(readAloudService.listVoices()).toEqual([]);
    });

    it('flattens the platform voice list for the picker', () => {
      const fake = {
        getVoices: () => [
          { name: 'Aditi', lang: 'hi-IN', default: true, localService: true },
          { name: 'Joanna', lang: 'en-US', default: false, localService: false }
        ],
        speak: () => undefined,
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        addEventListener: () => undefined
      };
      vi.stubGlobal('speechSynthesis', fake);
      vi.stubGlobal('SpeechSynthesisUtterance', class {});
      (globalThis as any).window = globalThis;

      const svc = new PdfReadAloudService();
      expect(svc.hasVoices()).toBe(true);

      const voices = svc.listVoices();
      expect(voices.length).toBe(2);
      expect(voices[0]).toEqual({ name: 'Aditi', lang: 'hi-IN', isDefault: true, isLocal: true });
      expect(voices[1].isDefault).toBe(false);
    });

    it('does not advance a sentence when an utterance is cancelled', () => {
      /*
       * The regression this guards: cancel() fires onend for the utterance
       * it kills. With handlers still attached, that onend ran the "advance"
       * branch, so every rate or voice change skipped a sentence.
       */
      const spoken: any[] = [];
      const fake = {
        getVoices: () => [{ name: 'V', lang: 'en', default: true, localService: true }],
        speak: (u: any) => spoken.push(u),
        cancel: () => {
          // What a real engine does to the utterance in flight.
          spoken.forEach(u => u.onend && u.onend());
        },
        pause: () => undefined,
        resume: () => undefined,
        addEventListener: () => undefined
      };
      vi.stubGlobal('speechSynthesis', fake);
      vi.stubGlobal('SpeechSynthesisUtterance', class {
        onend: any = null;
        onerror: any = null;
        rate = 1;
        lang = '';
        voice: any = null;
        constructor(public text: string) {}
      });
      (globalThis as any).window = globalThis;

      const svc = new PdfReadAloudService();
      const sentences = [0, 1, 2].map(i => ({
        index: i,
        text: `Sentence ${i}.`,
        pageNumber: 1,
        startIndex: i * 12,
        endIndex: i * 12 + 12
      }));

      let state: any;
      svc.state$.subscribe(s => (state = s));
      svc.playPage(1, sentences);
      expect(state.currentSentenceIndex).toBe(0);

      svc.setRate(1.5);
      // Still on sentence 0: the rate changed, the position did not.
      expect(state.currentSentenceIndex).toBe(0);
      expect(state.rate).toBe(1.5);

      svc.setVoice('V');
      expect(state.currentSentenceIndex).toBe(0);
    });

    it('steps between sentences without running off either end', () => {
      const fake = {
        getVoices: () => [{ name: 'V', lang: 'en', default: true, localService: true }],
        speak: () => undefined,
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        addEventListener: () => undefined
      };
      vi.stubGlobal('speechSynthesis', fake);
      vi.stubGlobal('SpeechSynthesisUtterance', class {
        onend: any = null;
        onerror: any = null;
        rate = 1;
        lang = '';
        voice: any = null;
        constructor(public text: string) {}
      });
      (globalThis as any).window = globalThis;

      const svc = new PdfReadAloudService();
      const sentences = [0, 1].map(i => ({
        index: i,
        text: `S${i}.`,
        pageNumber: 1,
        startIndex: i * 4,
        endIndex: i * 4 + 4
      }));

      let state: any;
      svc.state$.subscribe(s => (state = s));
      svc.playPage(1, sentences);

      svc.previousSentence();
      expect(state.currentSentenceIndex).toBe(0);

      svc.nextSentence();
      expect(state.currentSentenceIndex).toBe(1);
      expect(state.currentSentence).toBe('S1.');

      // Last sentence: next must not step past the page.
      svc.nextSentence();
      expect(state.currentSentenceIndex).toBe(1);

      svc.previousSentence();
      expect(state.currentSentenceIndex).toBe(0);
    });

    it('clamps the speaking rate to a usable range', () => {
      let state: any;
      readAloudService.state$.subscribe(s => (state = s));

      readAloudService.setRate(9);
      expect(state.rate).toBe(2.5);

      readAloudService.setRate(0.1);
      expect(state.rate).toBe(0.5);
    });
  });

  describe('L6 — lazy thumbnail window', () => {
    it('requests only the rows on screen, plus the overscan', () => {
      // 600px viewport, 100px rows, scrolled to row 20.
      const win = readerService.calculateLazyWindow(2000, 600, 100, 500, 3);

      expect(win.start).toBe(18);
      expect(win.end).toBe(30);
      expect(win.pages.length).toBe(13);
      // 500 pages exist; 13 are asked for.
      expect(win.pages.length).toBeLessThan(500 * 0.05);
      expect(win.pages[0]).toBe(18);
      expect(win.pages[win.pages.length - 1]).toBe(30);
    });

    it('keeps the scroll height honest with spacers either side', () => {
      const win = readerService.calculateLazyWindow(2000, 600, 100, 500, 3);

      expect(win.padBefore).toBe(17 * 100);
      expect(win.padAfter).toBe((500 - 30) * 100);
      // Spacers plus mounted rows equal the full list height, so the
      // scrollbar is the length it would be with all 500 rows present.
      expect(win.padBefore + win.pages.length * 100 + win.padAfter).toBe(500 * 100);
    });

    it('clamps at the top of the list', () => {
      const win = readerService.calculateLazyWindow(0, 600, 100, 500, 3);
      expect(win.start).toBe(1);
      expect(win.padBefore).toBe(0);
      expect(win.pages[0]).toBe(1);
    });

    it('clamps at the bottom of the list', () => {
      const win = readerService.calculateLazyWindow(100000, 600, 100, 500, 3);
      expect(win.end).toBe(500);
      expect(win.padAfter).toBe(0);
      expect(win.pages[win.pages.length - 1]).toBe(500);
    });

    it('survives a zero page count and a zero row height', () => {
      expect(readerService.calculateLazyWindow(0, 600, 100, 0).pages).toEqual([]);
      expect(() => readerService.calculateLazyWindow(0, 600, 0, 10)).not.toThrow();
      // A negative scroll (rubber-banding on iOS) must not go below page 1.
      expect(readerService.calculateLazyWindow(-200, 600, 100, 10).start).toBe(1);
    });

    it('windows a 500-page document in constant time', () => {
      const start = performance.now();
      for (let scroll = 0; scroll < 50000; scroll += 500) {
        const win = readerService.calculateLazyWindow(scroll, 600, 100, 500, 3);
        expect(win.pages.length).toBeLessThanOrEqual(13);
      }
      expect(performance.now() - start).toBeLessThan(50);
    });
  });
});
