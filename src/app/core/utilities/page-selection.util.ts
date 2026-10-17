import { PdfPageItem } from '../models/pdf-organization.types';
import { BlankDetectionReport } from '../models/blank-page.types';
import { DuplicateDetectionReport } from '../models/duplicate-page.types';
import {
  PageSizeGroup,
  SelectionHelperKind,
  SelectionHelperMatch,
  SelectionHelperOptions
} from '../models/page-selection.types';

const POINTS_PER_MM = 72 / 25.4;

/**
 * Standard sheet sizes, in portrait points. Matched within SIZE_TOLERANCE_PT
 * so a document generated at 595.276 x 841.89 still reads as A4.
 *
 * These are paper dimensions. Nothing here is named after an institution, an
 * exam board or a form — a group's identity is its measurements.
 */
const STANDARD_SIZES: { name: string; w: number; h: number }[] = [
  { name: 'A3', w: 842, h: 1191 },
  { name: 'A4', w: 595, h: 842 },
  { name: 'A5', w: 420, h: 595 },
  { name: 'A6', w: 298, h: 420 },
  { name: 'Letter', w: 612, h: 792 },
  { name: 'Legal', w: 612, h: 1008 },
  { name: 'Tabloid', w: 792, h: 1224 },
  { name: 'Executive', w: 522, h: 756 }
];

const SIZE_TOLERANCE_PT = 3;

/**
 * Pure predicates behind the organizer's additional selection helpers.
 *
 * Nothing here mutates a page or a selection: each function answers "which
 * pages match", which is what lets the screen show a count before the
 * selection changes.
 */
export class PageSelectionUtil {
  /**
   * The dimensions a reader actually sees.
   *
   * `width`/`height` come from the MediaBox and ignore /Rotate, so a portrait
   * sheet with a quarter turn applied — whether baked into the file or added
   * in the organizer — would otherwise be reported as portrait while it
   * displays as landscape.
   */
  static effectiveSize(page: PdfPageItem): { width: number; height: number } {
    const quarterTurns = Math.abs(
      (((page.originalRotation || 0) + (page.rotation || 0)) % 360) / 90
    );
    const swapped = Math.round(quarterTurns) % 2 === 1;
    return swapped
      ? { width: page.height, height: page.width }
      : { width: page.width, height: page.height };
  }

  static orientationOf(page: PdfPageItem): 'portrait' | 'landscape' | 'square' {
    const { width, height } = this.effectiveSize(page);
    // Within a point of each other is square for selection purposes: a
    // hair's difference is not something a person is choosing between.
    if (Math.abs(width - height) < 1) return 'square';
    return width > height ? 'landscape' : 'portrait';
  }

  /** The standard sheet name matching these dimensions, or undefined. */
  static standardNameFor(widthPt: number, heightPt: number): string | undefined {
    const shortSide = Math.min(widthPt, heightPt);
    const longSide = Math.max(widthPt, heightPt);
    const match = STANDARD_SIZES.find(
      s =>
        Math.abs(s.w - shortSide) <= SIZE_TOLERANCE_PT &&
        Math.abs(s.h - longSide) <= SIZE_TOLERANCE_PT
    );
    return match?.name;
  }

  /**
   * Groups pages by their effective dimensions, largest group first so the
   * default pick is the document's dominant sheet size. Ties break on the
   * first page in document order, so the list is stable across calls.
   */
  static groupBySize(pages: PdfPageItem[]): PageSizeGroup[] {
    const groups = new Map<string, PageSizeGroup & { firstIndex: number }>();

    pages.forEach((page, index) => {
      const { width, height } = this.effectiveSize(page);
      const widthPt = Math.round(width);
      const heightPt = Math.round(height);
      const key = `${widthPt}x${heightPt}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          widthPt,
          heightPt,
          widthMm: Math.round((widthPt / POINTS_PER_MM) * 10) / 10,
          heightMm: Math.round((heightPt / POINTS_PER_MM) * 10) / 10,
          standardName: this.standardNameFor(widthPt, heightPt),
          orientation:
            Math.abs(widthPt - heightPt) < 1
              ? 'square'
              : widthPt > heightPt
                ? 'landscape'
                : 'portrait',
          pageIds: [],
          displayNumbers: [],
          count: 0,
          firstIndex: index
        };
        groups.set(key, group);
      }

      group.pageIds.push(page.id);
      group.displayNumbers.push(page.displayNumber);
      group.count++;
    });

    return Array.from(groups.values())
      .sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)
      .map(({ firstIndex, ...group }) => group);
  }

  static matchLandscape(pages: PdfPageItem[]): PdfPageItem[] {
    return pages.filter(p => this.orientationOf(p) === 'landscape');
  }

  static matchPortrait(pages: PdfPageItem[]): PdfPageItem[] {
    return pages.filter(p => this.orientationOf(p) === 'portrait');
  }

  /**
   * The pages a blank scan flagged.
   *
   * Driven off the scan report rather than re-deriving anything: BlankPageService
   * owns what counts as blank, including the sensitivity the person chose and any
   * candidate they individually deselected.
   */
  static matchBlank(pages: PdfPageItem[], report: BlankDetectionReport | null): PdfPageItem[] {
    if (!report) return [];
    const flagged = new Set(report.blankCandidates.map(c => c.pageId));
    return pages.filter(p => flagged.has(p.id));
  }

  /**
   * The pages a duplicate scan grouped.
   *
   * 'redundant' (the default) matches every occurrence after the first in each
   * group — the pages keep-first would drop. 'all' matches every page in every
   * group, originals included, for when the person wants to review them side by
   * side rather than delete.
   */
  static matchDuplicates(
    pages: PdfPageItem[],
    report: DuplicateDetectionReport | null,
    scope: 'redundant' | 'all' = 'redundant'
  ): PdfPageItem[] {
    if (!report) return [];

    const matched = new Set<string>();
    for (const group of [...report.exactGroups, ...report.nearGroups]) {
      for (const item of group.pages) {
        if (scope === 'all' || !item.isFirst) {
          matched.add(item.pageId);
        }
      }
    }

    return pages.filter(p => matched.has(p.id));
  }

  /**
   * Runs one helper and reports what it matched, without changing anything.
   *
   * A helper that cannot run says why — a blank or duplicate helper with no
   * scan behind it returns `unavailableReason` and an empty match rather than
   * quietly clearing the selection.
   */
  static match(
    kind: SelectionHelperKind,
    pages: PdfPageItem[],
    context: {
      blankReport?: BlankDetectionReport | null;
      duplicateReport?: DuplicateDetectionReport | null;
      options?: SelectionHelperOptions;
    } = {}
  ): SelectionHelperMatch {
    const base = { kind, scannedCount: pages.length };

    const asMatch = (matched: PdfPageItem[], extra: Partial<SelectionHelperMatch> = {}) => ({
      ...base,
      pageIds: matched.map(p => p.id),
      displayNumbers: matched.map(p => p.displayNumber),
      matchedCount: matched.length,
      ...extra
    });

    switch (kind) {
      case 'landscape':
        return asMatch(this.matchLandscape(pages));

      case 'portrait':
        return asMatch(this.matchPortrait(pages));

      case 'blank': {
        if (!context.blankReport) {
          return {
            ...base,
            pageIds: [],
            displayNumbers: [],
            matchedCount: 0,
            unavailableReason: 'Run a blank page scan first.'
          };
        }
        return asMatch(this.matchBlank(pages, context.blankReport));
      }

      case 'duplicates': {
        if (!context.duplicateReport) {
          return {
            ...base,
            pageIds: [],
            displayNumbers: [],
            matchedCount: 0,
            unavailableReason: 'Run a duplicate page scan first.'
          };
        }
        return asMatch(
          this.matchDuplicates(
            pages,
            context.duplicateReport,
            context.options?.duplicateScope ?? 'redundant'
          )
        );
      }

      case 'size': {
        const groups = this.groupBySize(pages);
        if (groups.length === 0) {
          return {
            ...base,
            pageIds: [],
            displayNumbers: [],
            matchedCount: 0,
            unavailableReason: 'No pages to group.'
          };
        }
        const wanted = context.options?.sizeGroupKey;
        const group = wanted ? groups.find(g => g.key === wanted) : groups[0];
        if (!group) {
          return {
            ...base,
            pageIds: [],
            displayNumbers: [],
            matchedCount: 0,
            unavailableReason: 'That page size is no longer in this document.'
          };
        }
        return {
          ...base,
          pageIds: [...group.pageIds],
          displayNumbers: [...group.displayNumbers],
          matchedCount: group.count,
          sizeGroup: group
        };
      }

      default:
        return {
          ...base,
          pageIds: [],
          displayNumbers: [],
          matchedCount: 0,
          unavailableReason: 'Unknown selection helper.'
        };
    }
  }
}
