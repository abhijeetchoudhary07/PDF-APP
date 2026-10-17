/**
 * Page-order expression parser and evaluator.
 *
 * Supported expression forms (case-insensitive, whitespace-tolerant):
 *   • Explicit order:       "1,3,2,4-6"          → pages in specified sequence
 *   • Arithmetic (odd):     "2n-1"               → pages 1,3,5,… (n = 1,2,3,…)
 *   • Arithmetic (even):    "2n"                 → pages 2,4,6,…
 *   • Arithmetic (general): "3n+1"               → pages 4,7,10,… (any an±b)
 *   • Reverse:              "reverse" / "rev"    → all pages in reverse order
 *   • Combinations:         "2n-1 + 2n"          → odd pages, then even pages
 *                           "2n + reverse"       → even pages, then reversed full set
 *                           "reverse + 2n"       → reverse, then even pages
 *                           "1,3 + reverse"      → explicit pages 1,3 then reverse
 *                           "2n-1, 2n"           → comma-separated combinations
 *                           "reverse, 1, 2"      → keyword + page numbers
 *                           "2n-1; 2n"           → semicolon-separated combinations
 *
 * Every expression is validated against a concrete page count. Invalid input
 * explains what is wrong and where (character position and token).
 */

export interface PageOrderResult {
  /** Whether the expression parsed and evaluated successfully. */
  valid: boolean;
  /**
   * 1-indexed page numbers in the requested order.
   * Empty when `valid` is false.
   */
  pageOrder: number[];
  /** Human-readable error message explaining what is wrong and where. */
  error?: string;
}

export class PageOrderExpressionUtil {
  /**
   * Parse an expression string and evaluate it against a document with
   * `totalPages` pages. Returns the resulting 1-indexed page order or a
   * descriptive error.
   */
  static evaluate(expression: string, totalPages: number): PageOrderResult {
    if (!Number.isFinite(totalPages) || totalPages <= 0) {
      return { valid: false, pageOrder: [], error: 'Document has no pages.' };
    }

    if (typeof expression !== 'string' || !expression.trim()) {
      return { valid: false, pageOrder: [], error: 'Expression is empty.' };
    }

    // 1. Split top-level combination segments (separated by "+" or ";")
    const segRes = this.splitSegments(expression.trim());
    if (!segRes.valid) {
      return { valid: false, pageOrder: [], error: segRes.error! };
    }

    const finalPages: number[] = [];

    // 2. Process each segment
    for (const seg of segRes.segments!) {
      const segText = seg.text;
      const segPos = seg.position;

      // Each segment can contain comma-separated elements (e.g. "1, 3, 2n, 4-6")
      const rawTokens = segText.split(',');
      let charOffset = 0;

      for (const rawToken of rawTokens) {
        const trimmedToken = rawToken.trim();
        const tokenPos =
          segPos +
          charOffset +
          (rawToken.indexOf(trimmedToken) >= 0 ? rawToken.indexOf(trimmedToken) : 0);
        charOffset += rawToken.length + 1; // +1 accounts for the comma

        if (trimmedToken === '') {
          continue; // skip trailing or consecutive empty items
        }

        const lower = trimmedToken.toLowerCase();

        // Case A: Keyword "reverse" / "rev"
        if (lower === 'reverse' || lower === 'rev') {
          for (let p = totalPages; p >= 1; p--) {
            finalPages.push(p);
          }
          continue;
        }

        // Case B: Arithmetic expression ("2n", "2n-1", "3n+1", "n", etc.)
        const arithMatch = lower.match(/^(\d*)n\s*([+-]\s*\d+)?$/);
        if (arithMatch) {
          const coeffStr = arithMatch[1];
          const offsetStr = arithMatch[2];

          const coefficient = coeffStr === '' ? 1 : parseInt(coeffStr, 10);
          if (!Number.isFinite(coefficient) || coefficient < 1) {
            return {
              valid: false,
              pageOrder: [],
              error: `Arithmetic expression "${trimmedToken}" at position ${tokenPos}: coefficient of n must be a positive integer (at least 1).`
            };
          }

          let offset = 0;
          if (offsetStr) {
            offset = parseInt(offsetStr.replace(/\s+/g, ''), 10);
            if (!Number.isFinite(offset)) {
              return {
                valid: false,
                pageOrder: [],
                error: `Arithmetic expression "${trimmedToken}" at position ${tokenPos}: offset "${offsetStr.trim()}" is not a valid integer.`
              };
            }
          }

          // Closed-form bounds to prevent infinite loops and unbounded execution:
          // coefficient * n + offset >= 1  =>  n >= (1 - offset) / coefficient
          // coefficient * n + offset <= totalPages => n <= (totalPages - offset) / coefficient
          const nStart = Math.max(1, Math.ceil((1 - offset) / coefficient));
          const nEnd = Math.floor((totalPages - offset) / coefficient);

          let count = 0;
          for (let n = nStart; n <= nEnd; n++) {
            const p = coefficient * n + offset;
            if (p >= 1 && p <= totalPages) {
              finalPages.push(p);
              count++;
            }
          }

          if (count === 0) {
            return {
              valid: false,
              pageOrder: [],
              error: `Arithmetic expression "${trimmedToken}" at position ${tokenPos} produces no pages in the range 1\u2013${totalPages}.`
            };
          }
          continue;
        }

        // If it contains "n" but failed the regex, it was an attempted arithmetic formula
        if (lower.includes('n')) {
          return {
            valid: false,
            pageOrder: [],
            error: `"${trimmedToken}" at position ${tokenPos} looks like an arithmetic expression but is malformed. Expected format: "an+b" or "an-b" (e.g. "2n-1", "3n+2", "2n").`
          };
        }

        // Case C: Page range ("4-6")
        if (trimmedToken.includes('-')) {
          const dashParts = trimmedToken.split('-').map(s => s.trim());
          if (dashParts.length !== 2 || dashParts[0] === '' || dashParts[1] === '') {
            return {
              valid: false,
              pageOrder: [],
              error: `"${trimmedToken}" at position ${tokenPos} is not a valid range. Expected format: "start-end" (e.g. "4-6").`
            };
          }

          const start = Number(dashParts[0]);
          const end = Number(dashParts[1]);

          if (!Number.isInteger(start) || !Number.isFinite(start)) {
            return {
              valid: false,
              pageOrder: [],
              error: `Range start "${dashParts[0]}" in "${trimmedToken}" at position ${tokenPos} is not a valid integer.`
            };
          }

          if (!Number.isInteger(end) || !Number.isFinite(end)) {
            return {
              valid: false,
              pageOrder: [],
              error: `Range end "${dashParts[1]}" in "${trimmedToken}" at position ${tokenPos} is not a valid integer.`
            };
          }

          if (start < 1) {
            return {
              valid: false,
              pageOrder: [],
              error: `Page number ${start} in "${trimmedToken}" at position ${tokenPos} must be 1 or greater.`
            };
          }

          if (start > end) {
            return {
              valid: false,
              pageOrder: [],
              error: `Range "${trimmedToken}" at position ${tokenPos}: start (${start}) is greater than end (${end}). Ranges must be ascending.`
            };
          }

          if (end > totalPages) {
            return {
              valid: false,
              pageOrder: [],
              error: `Range "${trimmedToken}" at position ${tokenPos}: page ${end} exceeds total pages (${totalPages}).`
            };
          }

          for (let p = start; p <= end; p++) {
            finalPages.push(p);
          }
          continue;
        }

        // Case D: Single page number ("4")
        const value = Number(trimmedToken);
        if (!Number.isFinite(value) || !Number.isInteger(value)) {
          return {
            valid: false,
            pageOrder: [],
            error: `"${trimmedToken}" at position ${tokenPos} is not a valid page number.`
          };
        }

        if (value < 1) {
          return {
            valid: false,
            pageOrder: [],
            error: `Page number ${value} at position ${tokenPos} must be 1 or greater.`
          };
        }

        if (value > totalPages) {
          return {
            valid: false,
            pageOrder: [],
            error: `Page ${value} in "${segText}" at position ${tokenPos} exceeds total pages (${totalPages}).`
          };
        }

        finalPages.push(value);
      }
    }

    if (finalPages.length === 0) {
      return {
        valid: false,
        pageOrder: [],
        error: `Expression produces no pages. All computed page numbers fall outside the range 1\u2013${totalPages}.`
      };
    }

    return { valid: true, pageOrder: finalPages };
  }

  /**
   * Tests whether a "+" character is an arithmetic offset sign (e.g. in "3n+1")
   * as opposed to a combination operator (e.g. in "2n + reverse" or "2n-1 + 2n").
   */
  private static isArithmeticOffset(current: string, rest: string): boolean {
    const trimmedLeft = current.trimEnd();
    // Must end with "n" or "N" (e.g. "2n", "n", "3n")
    if (!/(?:^|\s|\d)n$/i.test(trimmedLeft)) {
      return false;
    }

    // Must be immediately followed by integer digits
    const match = rest.match(/^\s*(\d+)(.*)$/s);
    if (!match) return false;

    const afterDigits = match[2].trimStart();
    // If digits are immediately followed by 'n' (e.g. "2n + 1n"), not an offset
    if (/^n/i.test(afterDigits)) return false;
    // If digits are followed by '-' (e.g. "2n + 1-4"), this is a range, not an offset
    if (afterDigits.startsWith('-')) return false;
    // If digits are followed by ',' (e.g. "2n + 1, 3"), this is a comma list, not an offset
    if (afterDigits.startsWith(',')) return false;

    return true;
  }

  /**
   * Splits an expression into combination segments using "+" or ";".
   * Correctly distinguishes arithmetic signs (like "+1" in "3n+1") from
   * expression combiners.
   */
  private static splitSegments(
    expr: string
  ): { valid: boolean; segments?: { text: string; position: number }[]; error?: string } {
    const parts: { text: string; position: number }[] = [];
    let current = '';
    let segStart = 0;

    for (let i = 0; i <= expr.length; i++) {
      const ch = i < expr.length ? expr[i] : null;
      const isComb = ch === '+' || ch === ';';

      if (i === expr.length || isComb) {
        if (ch === '+') {
          const rest = expr.slice(i + 1);
          if (this.isArithmeticOffset(current, rest)) {
            current += ch;
            continue;
          }
        }

        const text = current.trim();
        if (text.length === 0) {
          if (i < expr.length) {
            return {
              valid: false,
              error: `Empty segment before "${ch}" at position ${i + 1}. Each side of "${ch}" must be a valid expression.`
            };
          }
          if (parts.length > 0) {
            const lastOp = expr.trimEnd().slice(-1);
            return {
              valid: false,
              error: `Trailing "${lastOp}" at end of expression. Each side of "${lastOp}" must be a valid expression.`
            };
          }
          return { valid: false, error: 'Expression is empty.' };
        }

        parts.push({ text, position: segStart + 1 });
        current = '';
        segStart = i + 1;
      } else {
        if (current === '' && ch !== ' ') {
          segStart = i;
        }
        current += ch!;
      }
    }

    if (parts.length === 0) {
      return { valid: false, error: 'Expression is empty.' };
    }

    return { valid: true, segments: parts };
  }
}
