import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PageOrderExpressionUtil } from '../utilities/page-order-expression.util';
import { PdfPageManagerService } from '../services/pdf-page-manager.service';

// ── Helper: create a minimal in-memory PDF with N blank pages ──────

async function createTestPdfFile(numPages: number, name = 'test.pdf'): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < numPages; i++) {
    doc.addPage([595, 842]);
  }
  const bytes = await doc.save();
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

// ════════════════════════════════════════════════════════════════════
//  Unit tests for the pure expression parser / evaluator
// ════════════════════════════════════════════════════════════════════

describe('PageOrderExpressionUtil', () => {
  const TOTAL = 6; // 6-page fixture throughout

  // ── Explicit order ────────────────────────────────────────────────

  describe('explicit order expressions', () => {
    it('should reorder pages by comma-separated list', () => {
      const r = PageOrderExpressionUtil.evaluate('1,3,2,4,5,6', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 2, 4, 5, 6]);
    });

    it('should expand dash-ranges in declaration order', () => {
      const r = PageOrderExpressionUtil.evaluate('1,3,2,4-6', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 2, 4, 5, 6]);
    });

    it('should handle a single page number', () => {
      const r = PageOrderExpressionUtil.evaluate('4', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([4]);
    });

    it('should handle a single range', () => {
      const r = PageOrderExpressionUtil.evaluate('2-5', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([2, 3, 4, 5]);
    });

    it('should allow duplicate page numbers (user intent)', () => {
      const r = PageOrderExpressionUtil.evaluate('1,1,2,2', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 1, 2, 2]);
    });

    it('should allow whitespace around commas and dashes', () => {
      const r = PageOrderExpressionUtil.evaluate('  1 , 3 , 2 , 4 - 6 ', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 2, 4, 5, 6]);
    });

    it('should handle trailing comma gracefully', () => {
      const r = PageOrderExpressionUtil.evaluate('1,2,3,', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 2, 3]);
    });

    it('should handle a one-page range (e.g. "3-3")', () => {
      const r = PageOrderExpressionUtil.evaluate('3-3', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([3]);
    });
  });

  // ── Arithmetic expressions ────────────────────────────────────────

  describe('arithmetic expressions', () => {
    it('should produce odd pages with "2n-1"', () => {
      const r = PageOrderExpressionUtil.evaluate('2n-1', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 5]);
    });

    it('should produce even pages with "2n"', () => {
      const r = PageOrderExpressionUtil.evaluate('2n', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([2, 4, 6]);
    });

    it('should handle "n" as identity (all pages in order)', () => {
      const r = PageOrderExpressionUtil.evaluate('n', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle "3n+1" for every-third-starting-at-4', () => {
      const r = PageOrderExpressionUtil.evaluate('3n+1', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([4]); // 3·1+1=4, 3·2+1=7 > 6
    });

    it('should handle "2n+1" (odd ≥ 3)', () => {
      const r = PageOrderExpressionUtil.evaluate('2n+1', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([3, 5]); // 2·1+1=3, 2·2+1=5, 2·3+1=7 > 6
    });

    it('should be case-insensitive (2N-1)', () => {
      const r = PageOrderExpressionUtil.evaluate('2N-1', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 5]);
    });

    it('should handle large negative offset without hanging', () => {
      // 2n-1000 → first positive value at n=501 → p=2, but p > TOTAL for n>=504
      // Must NOT hang or loop excessively.
      const r = PageOrderExpressionUtil.evaluate('2n-1000', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([2, 4, 6]);
    });

    it('should reject "0n" (zero coefficient)', () => {
      const r = PageOrderExpressionUtil.evaluate('0n', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('at least 1');
    });

    it('should reject "0n+3" (zero coefficient with offset)', () => {
      const r = PageOrderExpressionUtil.evaluate('0n+3', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('at least 1');
    });
  });

  // ── Reverse ───────────────────────────────────────────────────────

  describe('reverse expression', () => {
    it('should reverse all pages', () => {
      const r = PageOrderExpressionUtil.evaluate('reverse', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([6, 5, 4, 3, 2, 1]);
    });

    it('should be case-insensitive', () => {
      const r = PageOrderExpressionUtil.evaluate('REVERSE', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([6, 5, 4, 3, 2, 1]);
    });

    it('should handle "Reverse" with mixed case', () => {
      const r = PageOrderExpressionUtil.evaluate('Reverse', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([6, 5, 4, 3, 2, 1]);
    });

    it('should accept "rev" shorthand', () => {
      const r = PageOrderExpressionUtil.evaluate('rev', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([6, 5, 4, 3, 2, 1]);
    });
  });

  // ── Combinations ──────────────────────────────────────────────────

  describe('combination expressions (using +, commas, or semicolons)', () => {
    it('should concatenate odd then even pages ("2n-1 + 2n")', () => {
      const r = PageOrderExpressionUtil.evaluate('2n-1 + 2n', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 5, 2, 4, 6]);
    });

    it('should concatenate even then reverse ("2n + reverse")', () => {
      const r = PageOrderExpressionUtil.evaluate('2n + reverse', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([2, 4, 6, 6, 5, 4, 3, 2, 1]);
    });

    it('should concatenate reverse then even ("reverse + 2n")', () => {
      const r = PageOrderExpressionUtil.evaluate('reverse + 2n', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([6, 5, 4, 3, 2, 1, 2, 4, 6]);
    });

    it('should concatenate even then odd ("2n + 2n-1")', () => {
      const r = PageOrderExpressionUtil.evaluate('2n + 2n-1', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([2, 4, 6, 1, 3, 5]);
    });

    it('should concatenate explicit then reverse ("1,3 + reverse")', () => {
      const r = PageOrderExpressionUtil.evaluate('1,3 + reverse', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 6, 5, 4, 3, 2, 1]);
    });

    it('should concatenate reverse then explicit ("reverse + 1,2")', () => {
      const r = PageOrderExpressionUtil.evaluate('reverse + 1,2', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([6, 5, 4, 3, 2, 1, 1, 2]);
    });

    it('should concatenate even then comma list ("2n + 1, 3")', () => {
      const r = PageOrderExpressionUtil.evaluate('2n + 1, 3', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([2, 4, 6, 1, 3]);
    });

    it('should handle three-way combination ("1 + reverse + 6")', () => {
      const r = PageOrderExpressionUtil.evaluate('1 + reverse + 6', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 6, 5, 4, 3, 2, 1, 6]);
    });

    it('should not confuse arithmetic "+" with combination "+"', () => {
      // "3n+1 + 2n-1" = arithmetic(3n+1) THEN arithmetic(2n-1)
      const r = PageOrderExpressionUtil.evaluate('3n+1 + 2n-1', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([4, 1, 3, 5]); // 3n+1→[4], 2n-1→[1,3,5]
    });

    it('should support comma-separated combinations ("2n-1, 2n")', () => {
      const r = PageOrderExpressionUtil.evaluate('2n-1, 2n', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 5, 2, 4, 6]);
    });

    it('should support keyword with comma list ("reverse, 1, 2")', () => {
      const r = PageOrderExpressionUtil.evaluate('reverse, 1, 2', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([6, 5, 4, 3, 2, 1, 1, 2]);
    });

    it('should support mixed explicit and arithmetic with comma ("1, 3, 2n")', () => {
      const r = PageOrderExpressionUtil.evaluate('1, 3, 2n', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 2, 4, 6]);
    });

    it('should support semicolon-separated combinations ("2n-1; 2n")', () => {
      const r = PageOrderExpressionUtil.evaluate('2n-1; 2n', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 3, 5, 2, 4, 6]);
    });
  });

  // ── Out-of-range errors ───────────────────────────────────────────

  describe('out-of-range page numbers', () => {
    it('should reject page number exceeding total', () => {
      const r = PageOrderExpressionUtil.evaluate('1,7', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('7');
      expect(r.error).toContain('exceeds total pages');
    });

    it('should reject range end exceeding total', () => {
      const r = PageOrderExpressionUtil.evaluate('4-8', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('8');
      expect(r.error).toContain('exceeds total pages');
    });

    it('should reject page 0', () => {
      const r = PageOrderExpressionUtil.evaluate('0,1,2', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('1 or greater');
    });

    it('should reject negative page number', () => {
      const r = PageOrderExpressionUtil.evaluate('-1', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toBeDefined();
    });
  });

  // ── Duplicate page handling ───────────────────────────────────────

  describe('duplicate pages', () => {
    it('should allow duplicates in explicit lists (not an error)', () => {
      const r = PageOrderExpressionUtil.evaluate('1,2,1,2', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 2, 1, 2]);
    });

    it('should allow duplicates across combination segments', () => {
      const r = PageOrderExpressionUtil.evaluate('1,2 + 1,2', TOTAL);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1, 2, 1, 2]);
    });
  });

  // ── Malformed / invalid expressions ───────────────────────────────

  describe('malformed expressions', () => {
    it('should reject empty string', () => {
      const r = PageOrderExpressionUtil.evaluate('', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('empty');
    });

    it('should reject whitespace-only string', () => {
      const r = PageOrderExpressionUtil.evaluate('   ', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('empty');
    });

    it('should reject alphabetic garbage', () => {
      const r = PageOrderExpressionUtil.evaluate('abc', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toBeDefined();
    });

    it('should reject reversed range (5-2)', () => {
      const r = PageOrderExpressionUtil.evaluate('5-2', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('greater than end');
    });

    it('should reject malformed arithmetic like "2n*3"', () => {
      const r = PageOrderExpressionUtil.evaluate('2n*3', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('malformed');
    });

    it('should reject empty segment before + operator', () => {
      const r = PageOrderExpressionUtil.evaluate('+ 1,2', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('Empty segment');
    });

    it('should reject trailing + operator', () => {
      const r = PageOrderExpressionUtil.evaluate('1,2 +', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('Trailing');
    });

    it('should give a descriptive error for zero-page documents', () => {
      const r = PageOrderExpressionUtil.evaluate('1,2', 0);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('no pages');
    });

    it('should reject arithmetic producing no pages in range', () => {
      // 10n produces page 10, 20, 30… — all exceed TOTAL=6
      const r = PageOrderExpressionUtil.evaluate('10n', TOTAL);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('no pages');
    });

    it('should never produce a generic "invalid" error — always descriptive', () => {
      const cases = ['', '   ', 'xyz', '5-2', '0', '-1', '1,99', '2n*3', '+ 1', '1 +'];
      for (const expr of cases) {
        const r = PageOrderExpressionUtil.evaluate(expr, TOTAL);
        expect(r.valid).toBe(false);
        // Error must be at least 10 chars (not just "invalid")
        expect(r.error!.length).toBeGreaterThan(10);
        // Must not be the word "invalid" by itself
        expect(r.error!.toLowerCase()).not.toBe('invalid');
      }
    });
  });

  // ── Edge: single-page document ────────────────────────────────────

  describe('single-page document', () => {
    it('should evaluate "1" correctly', () => {
      const r = PageOrderExpressionUtil.evaluate('1', 1);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1]);
    });

    it('should evaluate "reverse" as identity for 1 page', () => {
      const r = PageOrderExpressionUtil.evaluate('reverse', 1);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1]);
    });

    it('should evaluate "2n-1" to [1] for 1 page (only n=1 ⇒ p=1)', () => {
      const r = PageOrderExpressionUtil.evaluate('2n-1', 1);
      expect(r.valid).toBe(true);
      expect(r.pageOrder).toEqual([1]);
    });

    it('should reject "2n" for 1 page (first result is 2, out of range)', () => {
      const r = PageOrderExpressionUtil.evaluate('2n', 1);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('no pages');
    });
  });
});

// ════════════════════════════════════════════════════════════════════
//  Integration tests: service methods on a 6-page fixture
// ════════════════════════════════════════════════════════════════════

describe('PdfPageManagerService — page-order expressions', () => {
  let service: PdfPageManagerService;

  beforeEach(async () => {
    service = new PdfPageManagerService();
    const file = await createTestPdfFile(6, 'fixture.pdf');
    await service.loadDocument(file);
    // Sanity: 6 pages loaded, display numbers 1–6
    expect(service.pages.length).toBe(6);
    expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // ── Preview ───────────────────────────────────────────────────────

  describe('previewPageOrderExpression', () => {
    it('should return the expected page order without mutating pages', () => {
      const originalIds = service.pages.map(p => p.id);

      const preview = service.previewPageOrderExpression('reverse');
      expect(preview.valid).toBe(true);
      expect(preview.pageOrder).toEqual([6, 5, 4, 3, 2, 1]);

      // Pages must NOT have changed
      expect(service.pages.map(p => p.id)).toEqual(originalIds);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should return an error for invalid expressions', () => {
      const preview = service.previewPageOrderExpression('1,9');
      expect(preview.valid).toBe(false);
      expect(preview.error).toContain('exceeds total pages');
    });

    it('should not push anything onto the undo stack', () => {
      expect(service.historyLength).toBe(0);
      service.previewPageOrderExpression('reverse');
      expect(service.historyLength).toBe(0);
    });
  });

  // ── Apply ─────────────────────────────────────────────────────────

  describe('applyPageOrderExpression', () => {
    it('should reorder pages per explicit list', () => {
      const result = service.applyPageOrderExpression('1,3,2,4-6');
      expect(result.valid).toBe(true);
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([0, 2, 1, 3, 4, 5]);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should reorder pages per arithmetic odd (2n-1)', () => {
      const result = service.applyPageOrderExpression('2n-1');
      expect(result.valid).toBe(true);
      // Pages at original positions 1,3,5 → source indices 0,2,4
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([0, 2, 4]);
      expect(service.pages.length).toBe(3);
    });

    it('should reorder pages per arithmetic even (2n)', () => {
      const result = service.applyPageOrderExpression('2n');
      expect(result.valid).toBe(true);
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([1, 3, 5]);
      expect(service.pages.length).toBe(3);
    });

    it('should reverse all pages', () => {
      const result = service.applyPageOrderExpression('reverse');
      expect(result.valid).toBe(true);
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([5, 4, 3, 2, 1, 0]);
      expect(service.pages.length).toBe(6);
    });

    it('should handle combination "2n-1 + 2n" (odd then even)', () => {
      const result = service.applyPageOrderExpression('2n-1 + 2n');
      expect(result.valid).toBe(true);
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([0, 2, 4, 1, 3, 5]);
      expect(service.pages.length).toBe(6);
    });

    it('should handle combination "2n + reverse" (even then reverse)', () => {
      const result = service.applyPageOrderExpression('2n + reverse');
      expect(result.valid).toBe(true);
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([1, 3, 5, 5, 4, 3, 2, 1, 0]);
      expect(service.pages.length).toBe(9);
    });

    it('should ensure duplicate pages receive unique IDs', () => {
      const result = service.applyPageOrderExpression('1, 1, 2, 2');
      expect(result.valid).toBe(true);
      expect(service.pages.length).toBe(4);
      const ids = service.pages.map(p => p.id);
      const uniqueIds = new Set(ids);
      // Every single page item in activePages must have a unique ID
      expect(uniqueIds.size).toBe(4);
      // Source pages must be [0, 0, 1, 1]
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([0, 0, 1, 1]);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4]);
    });

    it('should prune selectedPageIds when pages are filtered out', () => {
      // Select page 1 and page 2
      service.selectPage(service.pages[0].id); // Page 1
      service.selectPage(service.pages[1].id); // Page 2
      expect(service.selectedCount).toBe(2);

      // Apply "2n" (keeps pages 2, 4, 6; removes page 1)
      service.applyPageOrderExpression('2n');
      expect(service.selectedCount).toBe(1); // Page 1 deselected, Page 2 kept
      expect(service.getSelectedPages().map(p => p.sourcePageIndex)).toEqual([1]);
    });

    it('should not mutate pages on invalid expression', () => {
      const originalIds = service.pages.map(p => p.id);
      const result = service.applyPageOrderExpression('1,8');
      expect(result.valid).toBe(false);
      expect(service.pages.map(p => p.id)).toEqual(originalIds);
      expect(service.historyLength).toBe(0); // no operation recorded
    });

    it('should update displayNumbers sequentially after apply', () => {
      service.applyPageOrderExpression('6,5,4');
      // Only 3 pages remain, display numbers must be 1,2,3
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3]);
    });
  });

  // ── Preview matches apply ─────────────────────────────────────────

  describe('preview matches applied result', () => {
    const expressions = [
      '1,3,2,4-6',
      '2n-1',
      '2n',
      'reverse',
      '2n-1 + 2n',
      '2n + reverse',
      'reverse + 2n',
      '2n + 2n-1',
      '2n + 1, 3',
      '2n-1, 2n',
      'reverse, 1, 2',
      '1, 3, 2n',
      '6,5,4,3,2,1',
      '1,2,3',
      '1, 1, 2, 2'
    ];

    for (const expr of expressions) {
      it(`preview matches apply for "${expr}"`, async () => {
        // Fresh service for each expression
        const svc = new PdfPageManagerService();
        const file = await createTestPdfFile(6, 'match.pdf');
        await svc.loadDocument(file);

        const preview = svc.previewPageOrderExpression(expr);
        const applied = svc.applyPageOrderExpression(expr);

        expect(preview.valid).toBe(applied.valid);
        expect(preview.pageOrder).toEqual(applied.pageOrder);

        // And the actual page source indices match the preview order
        if (preview.valid) {
          const expectedSourceIndices = preview.pageOrder.map(n => n - 1);
          expect(svc.pages.map(p => p.sourcePageIndex)).toEqual(expectedSourceIndices);
        }
      });
    }
  });

  // ── Undo/Redo integration ─────────────────────────────────────────

  describe('undo/redo', () => {
    it('should undo an applied expression to restore original order', () => {
      const originalSourceIndices = service.pages.map(p => p.sourcePageIndex);
      const originalIds = service.pages.map(p => p.id);

      service.applyPageOrderExpression('reverse');
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual([5, 4, 3, 2, 1, 0]);
      expect(service.canUndo).toBe(true);

      service.undo();
      expect(service.pages.map(p => p.sourcePageIndex)).toEqual(originalSourceIndices);
      expect(service.pages.map(p => p.id)).toEqual(originalIds);
      expect(service.pages.map(p => p.displayNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should redo a previously undone expression', () => {
      service.applyPageOrderExpression('reverse');
      const reversedIds = service.pages.map(p => p.id);

      service.undo();
      expect(service.canRedo).toBe(true);

      service.redo();
      expect(service.pages.map(p => p.id)).toEqual(reversedIds);
    });

    it('should be a single undoable operation (not multiple)', () => {
      expect(service.historyLength).toBe(0);
      service.applyPageOrderExpression('2n-1 + 2n');
      expect(service.historyLength).toBe(1);
    });

    it('should clear redo stack when a new expression is applied after undo', () => {
      service.applyPageOrderExpression('reverse');
      service.undo();
      expect(service.canRedo).toBe(true);

      service.applyPageOrderExpression('2n-1');
      expect(service.canRedo).toBe(false);
    });

    it('should restore correct page count after undoing a filtering expression', () => {
      // "2n" selects only 3 of 6 pages
      service.applyPageOrderExpression('2n');
      expect(service.pages.length).toBe(3);

      service.undo();
      expect(service.pages.length).toBe(6);
    });
  });
});
