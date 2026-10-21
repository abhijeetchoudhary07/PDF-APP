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
