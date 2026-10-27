import { Rect } from './pdf-editor.types';

export type ReaderTheme = 'normal' | 'night' | 'sepia';
export type ReaderScrollMode = 'paged' | 'continuous';
export type ReaderPageSpread = 'single' | 'two-page';

export interface ReaderPreferences {
  theme: ReaderTheme;
  scrollMode: ReaderScrollMode;
  pageSpread: ReaderPageSpread;
  fontSize: number; // For reflow view, default 16
  reflowMode: boolean;
}

export interface IncrementalSearchMatch {
  id: string;
  pageNumber: number;
  matchIndex: number;
  text: string;
  snippetPrefix: string;
  snippetMatch: string;
  snippetSuffix: string;
  bounds?: Rect;
  /**
   * L1 — every rectangle the hit covers, narrowed to the matched characters.
   * `bounds` stays the first one so existing callers are unaffected.
   */
  rects?: Rect[];
}

export interface IncrementalSearchResult {
  query: string;
  totalMatches: number;
  matchesByPage: Map<number, IncrementalSearchMatch[]>;
  matches: IncrementalSearchMatch[];
  isComplete: boolean;
  searchedPages: number;
  totalPages: number;
}

export interface ReaderOutlineItem {
  title: string;
  pageNumber: number;
  dest?: any;
  items?: ReaderOutlineItem[];
  expanded?: boolean;
}

export interface ReflowBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'image';
  text?: string;
  imageUrl?: string;
  pageNumber: number;
  fontSize?: number;
  /** L3 — intrinsic size of an image block, so it scales instead of jumping. */
  imageWidth?: number;
  imageHeight?: number;
}

export interface ReadAloudSentence {
  index: number;
  text: string;
  pageNumber: number;
  startIndex: number;
  endIndex: number;
  bounds?: Rect;
}

export interface ReadAloudState {
  isPlaying: boolean;
  isPaused: boolean;
  currentSentence: string;
  currentSentenceIndex: number;
  currentPageNumber: number;
  voiceName?: string;
  rate: number;
}

export interface ScrubWindow {
  pageCount: number;
  windowStart: number;
  windowEnd: number;
  activePage: number;
  pagesToPreload: number[];
}

export interface LastReadPosition {
  pageNumber: number;
  timestamp: number;
}

/*
 * ---------------------------------------------------------------------------
 * L1-L6 second pass. Everything below is additive: the interfaces above keep
 * their shape, and the new optional fields on them default to today's values.
 * ---------------------------------------------------------------------------
 */

/**
 * L1 — one highlight rectangle for a hit.
 *
 * A match is a run of characters, not a text item, so a long item holding a
 * short query needs a box narrowed to the matched characters, and a match that
 * runs across an item boundary needs one box per item it touches. `bounds` on
 * IncrementalSearchMatch stays the first item's rectangle for callers that
 * already read it; `rects` is the precise set.
 */
export interface SearchHighlightRect extends Rect {
  /** 1-based page the rectangle belongs to. */
  pageNumber: number;
}

/** L1 — how far a search got, for the progress line while it runs. */
export interface SearchProgress {
  searchedPages: number;
  totalPages: number;
  totalMatches: number;
}

/** L2 — which pages a spread shows, left to right. */
export interface ReaderSpread {
  /** Pages in display order; one entry in single mode, one or two in spread mode. */
  pages: number[];
  /** True when the spread is a lone page because the document ran out. */
  isPartial: boolean;
}

/**
 * L6 / L2 — the slice of a long page list that is worth rendering.
 *
 * Used both for the sidebar thumbnail list and for the continuous-scroll page
 * surface: in a 500-page document neither may mount every page.
 */
export interface LazyPageWindow {
  /** First page to mount, 1-based inclusive. */
  start: number;
  /** Last page to mount, 1-based inclusive. */
  end: number;
  /** Pages in the window, in order — what the caller should request. */
  pages: number[];
  /** Pixels of spacer to leave above the window so the scrollbar stays honest. */
  padBefore: number;
  /** Pixels of spacer to leave below it. */
  padAfter: number;
}

/** L5 — a platform voice, flattened for the picker. */
export interface ReadAloudVoice {
  name: string;
  lang: string;
  isDefault: boolean;
  isLocal: boolean;
}

/** L3 — one extracted image, positioned so it can be placed in reading order. */
export interface ReflowImage {
  dataUrl: string;
  /** Device-space y of the image's top edge, used only for ordering. */
  top: number;
  width: number;
  height: number;
}

/**
 * L4 — one visible row of the outline sidebar.
 *
 * The tree is flattened into rows before rendering. An Angular template
 * cannot recurse into itself without a dedicated component, and the previous
 * markup hard-coded two levels, so every grandchild in a nested outline was
 * invisible. Flattening keeps arbitrary depth and makes the visible set
 * directly assertable in a test.
 */
export interface ReaderOutlineRow {
  /** Stable path key, e.g. "0.2.1" — also the expand/collapse identity. */
  key: string;
  title: string;
  pageNumber: number;
  /** 0 for a top-level entry. */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}
