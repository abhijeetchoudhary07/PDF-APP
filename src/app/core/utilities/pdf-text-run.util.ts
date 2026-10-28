import type { FontStyleName, Rect } from '../models/pdf-editor.types';

/**
 * Reading existing text off a page, in the editor's coordinate space.
 *
 * Shared by K1 (find & replace) and K6 (edit existing text), which were each
 * doing their own version of this and disagreeing about the answer.
 *
 * Two things here are easy to get wrong and both are visible on the output:
 *
 *   • **The y coordinate.** pdf.js reports a run's `transform[5]` as the
 *     glyph *baseline* in PDF user space, measured up from the bottom of the
 *     page. The editor works top-left-down. A cover rectangle derived from
 *     "page height minus baseline minus font size" starts at the cap line, so
 *     it misses every descender — the tails of g, y and p survive underneath
 *     the replacement. `baselineY` and `descent` below are what the writers
 *     use instead.
 *
 *   • **Which font to redraw in.** pdf.js does not hand back the font's name
 *     in the file; `item.fontName` is an internal id like `g_d0_f1`. What it
 *     does give, in `textContent.styles`, is the family it resolved the font
 *     to — `serif`, `sans-serif` or `monospace` — which is exactly the choice
 *     between the three standard-font families pdf-lib can embed.
 */

/** One run of text as it sits on the page, top-left origin, PDF points. */
export interface PageTextRun {
  /** Stable within one extraction pass: page number plus item index. */
  id: string;
  pageNumber: number;
  text: string;
  /** Top-left corner of the run's box. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Distance from the top of the page down to the glyph baseline. */
  baselineY: number;
  fontSize: number;
  /** Ascent and descent as fractions of the font size; descent is negative. */
  ascent: number;
  descent: number;
  fontFamily: FontStyleName;
  /** The family pdf.js resolved, before it was mapped to a standard font. */
  resolvedFamily: string;
  /** False for rotated or skewed runs, which are not safe to redraw. */
  isAxisAligned: boolean;
}

/** pdf.js's resolved CSS family, mapped onto the three embeddable families. */
export function standardFontForFamily(family: string | undefined): FontStyleName {
  const lower = (family || '').toLowerCase();
  if (lower.includes('monospace') || lower.includes('courier') || lower.includes('mono')) {
    return 'Courier';
  }
  if (lower.includes('serif') && !lower.includes('sans')) {
    return 'TimesRoman';
  }
  if (lower.includes('times') || lower.includes('georgia') || lower.includes('garamond')) {
    return 'TimesRoman';
  }
  return 'Helvetica';
}

/**
 * The rectangle that has to be painted over to hide a run completely.
 *
 * Padded by the font's own descent below the baseline and a little above the
 * cap line, because a box of exactly `fontSize` leaves descender tails and
 * accent marks poking out of the top and bottom of the cover.
 */
export function coverRectForRun(run: {
  x: number;
  baselineY: number;
  width: number;
  fontSize: number;
  ascent?: number;
  descent?: number;
}): Rect {
  const ascent = run.ascent && run.ascent > 0 ? run.ascent : 0.75;
  const descent = run.descent && run.descent < 0 ? run.descent : -0.22;

  const above = run.fontSize * ascent;
  const below = run.fontSize * Math.abs(descent);

  return {
    x: run.x - 0.5,
    y: Math.max(0, run.baselineY - above - 0.5),
    width: run.width + 1,
    height: above + below + 1
  };
}

/**
 * Where a substring sits inside a run.
 *
 * The advance width of each glyph is not knowable from `getTextContent` — it
 * reports one width for the whole run — so this divides that width evenly.
 * It is an estimate, and it is used only for highlighting a hit in the match
 * list and for scrolling to it. Nothing destructive is positioned from it:
 * a replacement covers and redraws the whole run, which needs no per-character
 * geometry at all.
 */
export function substringBounds(
  run: { x: number; y: number; width: number; height: number; text: string },
  offset: number,
  length: number
): Rect {
  const chars = run.text.length || 1;
  const perChar = run.width / chars;
  return {
    x: run.x + perChar * offset,
    y: run.y,
    width: Math.max(1, perChar * length),
    height: run.height
  };
}

/* The pdf.js text item shape this module reads. */
interface PdfJsTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
  dir?: string;
}

interface PdfJsTextStyle {
  fontFamily?: string;
  ascent?: number;
  descent?: number;
  vertical?: boolean;
}

/**
 * Every non-empty text run on one already-loaded pdf.js page.
 *
 * `pageHeight` is the page's height in points, which is what turns pdf.js's
 * bottom-up baseline into the editor's top-down `y`.
 */
export function textRunsFromTextContent(
  textContent: { items: unknown[]; styles?: Record<string, PdfJsTextStyle> },
  pageNumber: number,
  pageHeight: number
): PageTextRun[] {
  const runs: PageTextRun[] = [];
  const styles = textContent.styles || {};

  for (let index = 0; index < textContent.items.length; index++) {
    const item = textContent.items[index] as PdfJsTextItem;
    if (!item || typeof item.str !== 'string' || item.str.trim() === '') continue;

    const transform = item.transform && item.transform.length >= 6
      ? item.transform
      : [1, 0, 0, 1, 0, 0];

    const [a, b, c, d, e, f] = transform;

    /*
     * The font size is the length of the matrix's vertical basis vector, not
     * `d` on its own: a rotated run has its size spread across `c` and `d`,
     * and taking `d` alone reports a 20pt run turned on its side as 0pt.
     */
    const fontSize = Math.hypot(c, d) || Math.hypot(a, b) || 12;
    const isAxisAligned = Math.abs(b) < 0.001 && Math.abs(c) < 0.001 && d > 0;

    const style = (item.fontName && styles[item.fontName]) || {};
    const ascent = typeof style.ascent === 'number' && style.ascent > 0 ? style.ascent : 0.75;
    const descent = typeof style.descent === 'number' && style.descent < 0 ? style.descent : -0.22;

    const baselineY = pageHeight - f;
    const width = item.width && item.width > 0 ? item.width : item.str.length * fontSize * 0.5;
    const top = baselineY - fontSize * ascent;

    runs.push({
      id: `run_p${pageNumber}_i${index}`,
      pageNumber,
      text: item.str,
      x: e,
      y: Math.max(0, top),
      width,
      height: fontSize * (ascent + Math.abs(descent)),
      baselineY,
      fontSize,
      ascent,
      descent,
      fontFamily: standardFontForFamily(style.fontFamily),
      resolvedFamily: style.fontFamily || 'sans-serif',
      isAxisAligned
    });
  }

  return runs;
}

/**
 * Builds the search regex for a query.
 *
 * Exported because K1's engine and its spec both need to agree on what
 * "whole word" means, and because a query like `C++ (v2)` has to be matched
 * literally rather than compiled as a pattern.
 */
export function buildSearchRegex(
  query: string,
  options: { caseSensitive?: boolean; wholeWord?: boolean } = {}
): RegExp {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = options.caseSensitive ? 'g' : 'gi';

  if (!options.wholeWord) return new RegExp(escaped, flags);

  /*
   * `\b` is wrong at either end when the query itself starts or ends with a
   * non-word character: `\b\(v2\)\b` can never match, because there is no
   * word boundary before `(`. Lookarounds around word characters hold in both
   * cases.
   */
  const startsWithWord = /^\w/.test(query);
  const endsWithWord = /\w$/.test(query);
  const prefix = startsWithWord ? '(?<!\\w)' : '';
  const suffix = endsWithWord ? '(?!\\w)' : '';
  return new RegExp(`${prefix}${escaped}${suffix}`, flags);
}

/** Every match of `regex` in `text`, with zero-length loops guarded. */
export function matchOffsets(regex: RegExp, text: string): { offset: number; matched: string }[] {
  const out: { offset: number; matched: string }[] = [];
  regex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    out.push({ offset: match.index, matched: match[0] });
    if (match.index === regex.lastIndex) regex.lastIndex++;
    if (out.length > 5000) break;
  }

  return out;
}
