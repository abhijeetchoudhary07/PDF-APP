import { PdfSplitConfig } from '../models/pdf-organization.types';

export interface RangeParseResult {
  valid: boolean;
  pages: number[]; // 1-indexed page numbers
  error?: string;
}

export class PdfRangeParserUtil {
  /**
   * Parses a range string like "1-3, 5, 8-10" into an array of 1-indexed page numbers.
   * Validates syntax and page bounds (1 <= page <= maxPages).
   */
  static parseRange(input: string, maxPages: number): RangeParseResult {
    if (!input || !input.trim()) {
      return { valid: true, pages: [] };
    }

    const trimmed = input.trim();
    const parts = trimmed.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const pagesSet = new Set<number>();

    for (const part of parts) {
      if (part.includes('-')) {
        const rangeParts = part.split('-').map(p => p.trim());
        if (rangeParts.length !== 2) {
          return {
            valid: false,
            pages: [],
            error: `Invalid range format "${part}". Use "start-end" (e.g. 1-5).`
          };
        }

        const start = Number(rangeParts[0]);
        const end = Number(rangeParts[1]);

        if (!Number.isInteger(start) || !Number.isInteger(end)) {
          return {
            valid: false,
            pages: [],
            error: `Range "${part}" contains non-integer values.`
          };
        }

        if (start < 1) {
          return {
            valid: false,
            pages: [],
            error: `Page numbers must be 1 or greater. Found: ${start}.`
          };
        }

        if (start > end) {
          return {
            valid: false,
            pages: [],
            error: `Start page (${start}) cannot be greater than end page (${end}) in "${part}".`
          };
        }

        if (end > maxPages) {
          return {
            valid: false,
            pages: [],
            error: `Page ${end} exceeds total pages in document (${maxPages}).`
          };
        }

        for (let i = start; i <= end; i++) {
          pagesSet.add(i);
        }
      } else {
        const pageNum = Number(part);
        if (!Number.isInteger(pageNum)) {
          return {
            valid: false,
            pages: [],
            error: `"${part}" is not a valid page number.`
          };
        }

        if (pageNum < 1) {
          return {
            valid: false,
            pages: [],
            error: `Page numbers must be 1 or greater. Found: ${pageNum}.`
          };
        }

        if (pageNum > maxPages) {
          return {
            valid: false,
            pages: [],
            error: `Page ${pageNum} exceeds total pages in document (${maxPages}).`
          };
        }

        pagesSet.add(pageNum);
      }
    }

    const pages = Array.from(pagesSet).sort((a, b) => a - b);
    return {
      valid: true,
      pages
    };
  }

  /**
   * Formats an array of 1-indexed page numbers into compact range notation.
   * Example: [1, 2, 3, 5, 8, 9, 10] => "1-3, 5, 8-10"
   */
  static formatRange(pages: number[]): string {
    if (!pages || pages.length === 0) return '';
    const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);

    const ranges: string[] = [];
    let rangeStart = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      if (current === prev + 1) {
        prev = current;
      } else {
        if (rangeStart === prev) {
          ranges.push(`${rangeStart}`);
        } else {
          ranges.push(`${rangeStart}-${prev}`);
        }
        rangeStart = current;
        prev = current;
      }
    }

    if (rangeStart === prev) {
      ranges.push(`${rangeStart}`);
    } else {
      ranges.push(`${rangeStart}-${prev}`);
    }

    return ranges.join(', ');
  }

  /**
   * Calculates chunks of 1-indexed page numbers for split modes.
   */
  static calculateSplitChunks(totalPages: number, config: PdfSplitConfig): number[][] {
    if (totalPages <= 0) return [];

    switch (config.mode) {
      case 'extract': {
        if (config.rangeString && config.rangeString.includes(',')) {
          // If multiple comma-separated ranges are provided, each range becomes its own PDF chunk
          const parts = config.rangeString.split(',').map(p => p.trim()).filter(p => p.length > 0);
          const chunks: number[][] = [];
          for (const part of parts) {
            const parsed = this.parseRange(part, totalPages);
            if (parsed.valid && parsed.pages.length > 0) {
              chunks.push(parsed.pages);
            }
          }
          if (chunks.length > 0) return chunks;
        }

        const pages = config.selectedPageNumbers && config.selectedPageNumbers.length > 0
          ? config.selectedPageNumbers.filter(p => p >= 1 && p <= totalPages)
          : Array.from({ length: totalPages }, (_, i) => i + 1);
        return pages.length > 0 ? [pages] : [];
      }

      case 'every-n': {
        const n = Math.max(1, config.everyN || 1);
        const chunks: number[][] = [];
        for (let i = 1; i <= totalPages; i += n) {
          const chunk: number[] = [];
          for (let j = i; j < i + n && j <= totalPages; j++) {
            chunk.push(j);
          }
          chunks.push(chunk);
        }
        return chunks;
      }

      case 'after-selected': {
        const splitAfter = new Set(
          (config.afterPages || []).filter(p => p >= 1 && p < totalPages)
        );
        const chunks: number[][] = [];
        let currentChunk: number[] = [];

        for (let i = 1; i <= totalPages; i++) {
          currentChunk.push(i);
          if (splitAfter.has(i) || i === totalPages) {
            chunks.push(currentChunk);
            currentChunk = [];
          }
        }
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }
        return chunks;
      }

      case 'individual': {
        const chunks: number[][] = [];
        for (let i = 1; i <= totalPages; i++) {
          chunks.push([i]);
        }
        return chunks;
      }

      default:
        return [Array.from({ length: totalPages }, (_, i) => i + 1)];
    }
  }
}
