/**
 * Combining — Part C.
 *
 * Five additions alongside the merge that ships: interleaving two or more
 * documents (C1), inserting pages at an exact position (C2), merging with
 * per-file page subsets and sorting (C3), merging with generated navigation
 * and structure (C4), and the two pre-merge checks that stop a merge from
 * quietly breaking something (C5).
 *
 * The shipped merge path is unchanged and is the default everywhere here: a
 * plan with no subsets and no sort produces exactly the page order the
 * organizer's merge produces today, which `pdf-combine.service.spec.ts`
 * asserts directly.
 */

import { PdfExportResult } from './pdf-organization.types';

/* ════════════════════════════════════════════════════════════════════
 * Shared
 * ════════════════════════════════════════════════════════════════════ */

export type CombineNoticeKind
  /** A source document contributed no pages, because its subset matched none. */
  = 'empty-subset'
  /** A subset expression could not be read, so the whole file was taken. */
  | 'invalid-subset'
  /** Blank pages were inserted. */
  | 'blanks-inserted'
  /** Documents were of unequal length, so the longest one's tail was appended. */
  | 'uneven-interleave'
  /**
   * Text could not be drawn in the built-in font, so those characters were
   * left out of the printed page. The bookmark keeps the full text.
   */
  | 'title-characters-dropped'
  /** An outline was written. */
  | 'outline-written'
  /** A table of contents page was added. */
  | 'toc-added'
  /** Separator sheets were added between sources. */
  | 'separators-added'
  /** A cover page was added. */
  | 'cover-added'
  /** Field names collided and were renamed with a per-file suffix. */
  | 'fields-renamed'
  /** Form fields were flattened before merging. */
  | 'fields-flattened'
  /** Signatures were removed before merging. */
  | 'signatures-stripped'
  /** The interactive layer could not be carried across. */
  | 'annotations-dropped';

export interface CombineNotice {
  kind: CombineNoticeKind;
  count?: number;
  /** A file name, a field name, a character — whatever the message needs. */
  detail?: string;
  pageNumbers?: number[];
}

export interface CombineProgress {
  phase: 'planning' | 'inspecting' | 'writing';
  completed: number;
  total: number;
  percent: number;
}

export interface CombineOutput extends PdfExportResult {
  notices: CombineNotice[];
  /** Total pages across every source, before the plan was applied. */
  sourcePageCount: number;
}

/** A document taking part in a combine, already in memory. */
export interface CombineSource {
  id: string;
  name: string;
  pageCount: number;
  sizeBytes: number;
  /** Last modified, for date sorting. 0 when the platform did not report one. */
  lastModified: number;
  buffer: ArrayBuffer;
}

/** One page of the output, and where it came from. */
export interface CombinePageRef {
  /** Index into the source list, or -1 for a page this tool generates. */
  sourceIndex: number;
  /** 0-indexed page within that source. */
  pageIndex: number;
  /** Set for a page the tool generates rather than copies. */
  generated?: 'blank' | 'cover' | 'toc' | 'separator';
}

/* ════════════════════════════════════════════════════════════════════
 * C1 — alternate & mix (interleave)
 * ════════════════════════════════════════════════════════════════════ */

export interface InterleaveDocOptions {
  /** Take this document's pages from the back — the front/back scanning case. */
  reversed: boolean;
}

export interface InterleavePlan {
  /** The output order, one entry per page. */
  order: CombinePageRef[];
  /** True when the documents were of unequal length. */
  uneven: boolean;
  /** Pages each document contributed, in the same order as the sources. */
  perDocCount: number[];
  totalPageCount: number;
}

/* ════════════════════════════════════════════════════════════════════
 * C2 — insert pages
 * ════════════════════════════════════════════════════════════════════ */

export type InsertSide = 'before' | 'after';

export type InsertContentKind = 'pdf' | 'image' | 'blank';

/** Page size for inserted blanks. `neighbour` matches the page they land next to. */
export type BlankSizeMode = 'neighbour' | 'A4' | 'A5' | 'Letter' | 'Legal';

export interface InsertOptions {
  kind: InsertContentKind;
  /** 1-indexed page to insert relative to. */
  anchorPage: number;
  side: InsertSide;
  /** `blank` only: how many. */
  blankCount: number;
  /** `blank` only: what size they are. */
  blankSize: BlankSizeMode;
  /** `blank` only: landscape instead of portrait, for a non-neighbour size. */
  blankLandscape: boolean;
}

export function defaultInsertOptions(): InsertOptions {
  return {
    kind: 'pdf',
    anchorPage: 1,
    side: 'after',
    blankCount: 1,
    blankSize: 'neighbour',
    blankLandscape: false
  };
}

export interface InsertPlan {
  order: CombinePageRef[];
  /** 0-indexed position in the output where the inserted run starts. */
  insertAt: number;
  insertedCount: number;
  totalPageCount: number;
}

/* ════════════════════════════════════════════════════════════════════
 * C3 — merge: page subsets and sorting
 * ════════════════════════════════════════════════════════════════════ */

export type MergeSortField = 'none' | 'name' | 'date' | 'size';
export type MergeSortDirection = 'asc' | 'desc';

/** One row of the merge list. */
export interface MergeRow {
  sourceId: string;
  /**
   * Pages to take, as a range expression ("1-3, 7"). Empty takes the whole
   * file, which is what today's merge does and stays the default.
   */
  subset: string;
}

export interface MergeOptions {
  rows: MergeRow[];
  sortBy: MergeSortField;
  sortDirection: MergeSortDirection;
}

export function defaultMergeOptions(): MergeOptions {
  return { rows: [], sortBy: 'none', sortDirection: 'asc' };
}

export interface MergePlanEntry {
  sourceIndex: number;
  sourceId: string;
  sourceName: string;
  /** 1-indexed pages taken from this source, in output order. */
  pageNumbers: number[];
  /** 1-indexed position of this source's first page in the merged output. */
  firstOutputPage: number;
  /** True when the subset expression could not be read and the file was taken whole. */
  subsetInvalid?: boolean;
}

export interface MergePlan {
  entries: MergePlanEntry[];
  order: CombinePageRef[];
  totalPageCount: number;
  notices: CombineNotice[];
}

/* ════════════════════════════════════════════════════════════════════
 * C4 — merge: bookmarks, TOC, cover & separators
 * ════════════════════════════════════════════════════════════════════ */

export interface MergeStructureOptions {
  /** One bookmark per source file, pointing at its first page. */
  bookmarks: boolean;
  /** A generated contents page listing the sources and their page numbers. */
  tableOfContents: boolean;
  /** A generated cover page. */
  coverPage: boolean;
  /** Title printed on the generated cover. Empty uses the output file name. */
  coverTitle: string;
  /** A blank sheet carrying the file name between sources. */
  separators: boolean;
}

/** All four off: the shipped merge behaviour, unchanged. */
export function defaultMergeStructureOptions(): MergeStructureOptions {
  return {
    bookmarks: false,
    tableOfContents: false,
    coverPage: false,
    coverTitle: '',
    separators: false
  };
}

/** One line of the generated contents page, and one bookmark target. */
export interface StructureEntry {
  title: string;
  /** 1-indexed page in the finished output. */
  outputPage: number;
  pageCount: number;
}

export interface MergeStructurePlan {
  /** The output composition, including every generated page. */
  order: CombinePageRef[];
  entries: StructureEntry[];
  totalPageCount: number;
  /** 1-indexed position of the contents page, when there is one. */
  tocPage?: number;
  coverPage?: number;
}

/* ════════════════════════════════════════════════════════════════════
 * C5 — merge: form fields and signatures
 * ════════════════════════════════════════════════════════════════════ */

export type FieldCollisionResolution = 'rename' | 'flatten' | 'cancel';
export type SignatureResolution = 'strip' | 'cancel';

/** One field name that appears in more than one source. */
export interface FieldCollision {
  fieldName: string;
  /** Indices into the source list that each declare this name. */
  sourceIndexes: number[];
  sourceNames: string[];
}

export interface SignatureFinding {
  sourceIndex: number;
  sourceName: string;
  /** Signature field names found on this document. */
  fieldNames: string[];
  /** True when the document also carries a document-level permissions entry. */
  hasDocumentPermissions: boolean;
  /** True when at least one signature field actually holds a signature. */
  hasSignedValue: boolean;
}

/**
 * The pre-merge report. A clean document gives `clean: true` and the screen
 * goes straight through to the merge without showing anything.
 */
export interface MergePreflightReport {
  clean: boolean;
  /** Field names per source, for the detail view. */
  fieldsBySource: Array<{ sourceIndex: number; sourceName: string; fieldNames: string[] }>;
  collisions: FieldCollision[];
  signatures: SignatureFinding[];
  /** Total fields across every source. */
  totalFieldCount: number;
}

export interface MergeResolution {
  fields: FieldCollisionResolution;
  signatures: SignatureResolution;
}

export function defaultMergeResolution(): MergeResolution {
  return { fields: 'rename', signatures: 'strip' };
}

/* ════════════════════════════════════════════════════════════════════
 * Screen state
 * ════════════════════════════════════════════════════════════════════ */

/** The Combine Studio's modes. */
export type CombineMode = 'merge' | 'interleave' | 'insert';

export const COMBINE_MODES: CombineMode[] = ['merge', 'interleave', 'insert'];

export function isCombineMode(value: string): value is CombineMode {
  return (COMBINE_MODES as string[]).includes(value);
}
