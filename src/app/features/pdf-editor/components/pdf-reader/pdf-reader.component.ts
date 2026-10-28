import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  HostListener,
  ChangeDetectionStrategy,
  ViewChild,
  ViewChildren,
  QueryList,
  ElementRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfRenderService } from '../../../../core/services/pdf-render.service';
import { PdfReaderFeaturesService } from '../../../../core/services/pdf-reader-features.service';
import { PdfReadAloudService } from '../../../../core/services/pdf-read-aloud.service';
import {
  ReaderPreferences,
  ReaderTheme,
  ReaderScrollMode,
  ReaderPageSpread,
  IncrementalSearchMatch,
  IncrementalSearchResult,
  ReaderOutlineItem,
  ReaderOutlineRow,
  ReflowBlock,
  ReadAloudSentence,
  ReadAloudState,
  ReadAloudVoice,
  ScrubWindow,
  LazyPageWindow,
  LastReadPosition
} from '../../../../core/models/reader-features.types';
import { Rect } from '../../../../core/models/pdf-editor.types';

/** One mounted page of the reader's own multi-page surface (L2). */
interface SurfacePage {
  pageNumber: number;
  width: number;
  height: number;
  rendered: boolean;
}

/** Which panel the mobile options sheet is showing. */
export type ReaderSheet = 'none' | 'view' | 'voice';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-pdf-reader',
  templateUrl: './pdf-reader.component.html',
  styleUrls: ['./pdf-reader.component.scss'],
  standalone: true,
  imports: [AppIconComponent, TranslatePipe, CommonModule, FormsModule]
})
export class PdfReaderComponent implements OnInit, OnDestroy {
  state = inject(PdfEditorStateService);
  renderService = inject(PdfRenderService);
  readerFeatures = inject(PdfReaderFeaturesService);
  readAloudService = inject(PdfReadAloudService);

  @ViewChild('canvasViewport') canvasViewportRef?: ElementRef<HTMLElement>;
  @ViewChild('thumbList') thumbListRef?: ElementRef<HTMLElement>;
  @ViewChild('surfaceScroll') surfaceScrollRef?: ElementRef<HTMLElement>;
  @ViewChildren('surfaceCanvas') surfaceCanvases?: QueryList<ElementRef<HTMLCanvasElement>>;

  @Input() showThumbnails = false;
  @Input() showSearch = false;
  @Output() toggleThumbnailsEvent = new EventEmitter<void>();
  @Output() toggleSearchEvent = new EventEmitter<void>();

  // L1: Search State
  searchQuery = '';
  searchResult: IncrementalSearchResult | null = null;
  currentMatchIndex = -1;
  isSearching = false;
  /*
   * A scan in flight is retired when a new query starts. Without this the
   * previous scan kept writing its hits into `searchResult` while the new one
   * did the same, and the counter jumped between two totals.
   */
  private searchAbort: AbortController | null = null;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  // L2: Reading Modes & Preferences
  preferences: ReaderPreferences = {
    theme: 'normal',
    scrollMode: 'paged',
    pageSpread: 'single',
    fontSize: 16,
    reflowMode: false
  };
  /** The bottom sheet that holds the view options on a phone. */
  activeSheet: ReaderSheet = 'none';

  /*
   * L2 — the reader paints its own pages for two-page spread and continuous
   * scroll. Single + paged stays on the editor's canvas, projected through
   * <ng-content>, so a document with no stored preference opens exactly as it
   * does today and every editing tool keeps working.
   */
  surfacePages: SurfacePage[] = [];
  surfaceWindow: LazyPageWindow | null = null;
  private surfaceRenderToken = 0;
  private estimatedPageHeight = 1100;

  // L3: Text Reflow State
  reflowBlocks: ReflowBlock[] = [];
  isLoadingReflow = false;
  reflowImageCount = 0;

  // L4: Bookmarks Sidebar & Last-Read Position
  outline: ReaderOutlineItem[] = [];
  outlineRows: ReaderOutlineRow[] = [];
  private expandedOutlineKeys = new Set<string>();
  activeSidebarTab: 'thumbnails' | 'outline' = 'thumbnails';
  lastReadPrompt: LastReadPosition | null = null;
  private hasCheckedLastRead = false;

  // L5: Read-Aloud State
  readAloudState: ReadAloudState = {
    isPlaying: false,
    isPaused: false,
    currentSentence: '',
    currentSentenceIndex: -1,
    currentPageNumber: 1,
    rate: 1.0
  };
  activeSentence: ReadAloudSentence | null = null;
  /** Every sentence of the page being read, for the highlight overlay. */
  readAloudSentences: ReadAloudSentence[] = [];
  voices: ReadAloudVoice[] = [];
  selectedVoiceName = '';
  readonly ttsRates = [0.75, 1, 1.25, 1.5, 2];

  // L6: Thumbnail Scrubbing State
  scrubPageNumber = 1;
  scrubWindow: ScrubWindow | null = null;
  scrubPreviewUrl: string | null = null;
  thumbnailUrls: Map<number, string> = new Map();
  isScrubbing = false;
  /** Lazy window over the sidebar thumbnail list. */
  thumbWindow: LazyPageWindow | null = null;
  readonly thumbRowHeight = 112;
  private thumbRequests = new Set<number>();
  private scrubPreviewToken = 0;

  // Fullscreen
  isFullscreen = false;

  // Touch tracking for swipe & pinch-to-zoom
  private touchStartX = 0;
  private touchStartY = 0;
  private initialPinchDist = 0;
  private initialZoom = 1.0;

  private subs = new Subscription();

  /** True while the reader is painting its own pages rather than the editor's. */
  get usesOwnSurface(): boolean {
    return !this.preferences.reflowMode &&
      (this.preferences.pageSpread === 'two-page' || this.preferences.scrollMode === 'continuous');
  }

  get pageCount(): number {
    return this.state.document?.pageCount || 1;
  }

  /** L5 — shown only when the platform actually has a voice to speak with. */
  get isTtsSupported(): boolean {
    return this.readAloudService.isAvailable() && this.voices.length > 0;
  }

  ngOnInit() {
    this.subs.add(
      this.readAloudService.voices$.subscribe(voices => {
        this.voices = voices;
        if (!this.selectedVoiceName && voices.length > 0) {
          const preferred = voices.find(v => v.isDefault) || voices[0];
          this.selectedVoiceName = preferred.name;
        }
      })
    );

    // Document Subscription
    this.subs.add(
      this.state.document$.subscribe(async (doc) => {
        if (doc) {
          this.preferences = this.readerFeatures.getPreferences(doc.id);
          this.scrubPageNumber = this.state.currentPageNumber || 1;
          this.updateScrubWindow(this.scrubPageNumber);
          this.refreshThumbWindow(0);

          // Check last read position once per document open
          if (!this.hasCheckedLastRead) {
            this.hasCheckedLastRead = true;
            const lastPos = this.readerFeatures.getLastReadPosition(doc.id);
            if (lastPos && lastPos.pageNumber > 1 && lastPos.pageNumber <= doc.pageCount) {
              this.lastReadPrompt = lastPos;
            }
          }

          // Extract Outline / Bookmarks
          const pdfDoc = this.renderService.getActivePdfDoc();
          if (pdfDoc) {
            this.outline = await this.readerFeatures.extractOutline(pdfDoc);
            if (this.outline.length === 0) {
              this.activeSidebarTab = 'thumbnails';
            } else {
              // Open the first level: a closed outline reads as an empty one.
              this.expandedOutlineKeys = new Set(
                this.readerFeatures.collectExpandableKeys(this.outline, 0)
              );
            }
            this.rebuildOutlineRows();
          }

          if (this.usesOwnSurface) {
            void this.rebuildSurface();
          }
          if (this.preferences.reflowMode) {
            void this.loadReflowContent(this.state.currentPageNumber);
          }
        } else {
          this.cancelSearch();
          this.thumbnailUrls.clear();
          this.thumbRequests.clear();
          this.outline = [];
          this.outlineRows = [];
          this.searchResult = null;
          this.lastReadPrompt = null;
          this.hasCheckedLastRead = false;
          this.surfacePages = [];
          this.readAloudSentences = [];
          this.renderService.cancelAllSurfaces();
        }
      })
    );

    // Page Change Subscription
    this.subs.add(
      this.state.currentPage$.subscribe(async (pageNum: number) => {
        if (this.state.document && pageNum > 0) {
          this.scrubPageNumber = pageNum;
          this.readerFeatures.saveLastReadPosition(this.state.document.id, pageNum);
          this.updateScrubWindow(pageNum);

          if (this.canvasViewportRef?.nativeElement) {
            this.canvasViewportRef.nativeElement.scrollTop = 0;
          }

          if (this.preferences.reflowMode) {
            await this.loadReflowContent(pageNum);
          } else if (this.usesOwnSurface) {
            await this.rebuildSurface();
          }
        }
      })
    );

    // A zoom change has to repaint the reader's own pages too; the editor
    // canvas handles its own, but these canvases are ours.
    this.subs.add(
      this.state.zoom$.subscribe(() => {
        if (this.usesOwnSurface) {
          void this.renderSurfaceWindow();
        }
      })
    );

    // Read-Aloud Service Subscriptions
    this.subs.add(
      this.readAloudService.state$.subscribe((st) => {
        this.readAloudState = st;
      })
    );

    this.subs.add(
      this.readAloudService.sentenceChange$.subscribe((sent) => {
        this.activeSentence = sent;
      })
    );
  }

  ngOnDestroy() {
    this.readAloudService.stop();
    this.cancelSearch();
    this.renderService.cancelAllSurfaces();
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.subs.unsubscribe();
  }

  // --- L1: Incremental Text Search ---

  /** Typing restarts the scan; the previous one is retired, not left running. */
  onSearchQueryInput() {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    if (!this.searchQuery || this.searchQuery.trim().length < 2) {
      this.cancelSearch();
      this.searchResult = null;
      this.currentMatchIndex = -1;
      return;
    }
    this.searchDebounce = setTimeout(() => void this.performSearch(), 350);
  }

  async performSearch() {
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
      this.searchDebounce = null;
    }

    if (!this.searchQuery || this.searchQuery.trim().length === 0) {
      this.cancelSearch();
      this.searchResult = null;
      this.currentMatchIndex = -1;
      return;
    }

    const pdfDoc = this.renderService.getActivePdfDoc();
    if (!pdfDoc) return;

    this.cancelSearch();
    const controller = new AbortController();
    this.searchAbort = controller;

    this.isSearching = true;
    this.currentMatchIndex = -1;
    let jumped = false;

    try {
      const result = await this.readerFeatures.searchDocumentIncremental(
        pdfDoc,
        this.searchQuery,
        (progress) => {
          if (controller.signal.aborted) return;
          this.searchResult = progress;
          // Go to the first hit as soon as there is one, rather than making
          // the reader wait for a 500-page scan to finish.
          if (!jumped && progress.matches.length > 0) {
            jumped = true;
            this.currentMatchIndex = 0;
            this.jumpToMatch(0);
          }
        },
        controller.signal
      );

      if (controller.signal.aborted) return;
      this.searchResult = result;
      if (result.matches.length > 0 && this.currentMatchIndex < 0) {
        this.currentMatchIndex = 0;
        this.jumpToMatch(0);
      } else if (result.matches.length === 0) {
        this.currentMatchIndex = -1;
      }
    } finally {
      if (this.searchAbort === controller) {
        this.searchAbort = null;
        this.isSearching = false;
      }
    }
  }

  private cancelSearch() {
    if (this.searchAbort) {
      this.searchAbort.abort();
      this.searchAbort = null;
    }
    this.isSearching = false;
  }

  jumpToMatch(index: number) {
    if (!this.searchResult || !this.searchResult.matches[index]) return;
    this.currentMatchIndex = index;
    const match = this.searchResult.matches[index];
    if (match.pageNumber !== this.state.currentPageNumber) {
      this.state.setCurrentPage(match.pageNumber);
    }
  }

  nextMatch() {
    if (!this.searchResult || this.searchResult.matches.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchResult.matches.length;
    this.jumpToMatch(this.currentMatchIndex);
  }

  prevMatch() {
    if (!this.searchResult || this.searchResult.matches.length === 0) return;
    this.currentMatchIndex =
      (this.currentMatchIndex - 1 + this.searchResult.matches.length) %
      this.searchResult.matches.length;
    this.jumpToMatch(this.currentMatchIndex);
  }

  closeSearch() {
    this.cancelSearch();
    this.searchQuery = '';
    this.searchResult = null;
    this.currentMatchIndex = -1;
    this.toggleSearchEvent.emit();
  }

  get currentMatchesOnActivePage(): IncrementalSearchMatch[] {
    if (!this.searchResult) return [];
    return this.searchResult.matchesByPage.get(this.state.currentPageNumber) || [];
  }

  get activeMatchId(): string | null {
    return this.searchResult?.matches?.[this.currentMatchIndex]?.id || null;
  }

  /** Every rectangle of a hit at the reader's zoom — a hit can span items. */
  matchRects(match: IncrementalSearchMatch): Rect[] {
    return this.readerFeatures.getScaledMatchRects(match, this.state.zoom);
  }

  getScaledBounds(bounds: Rect | undefined): Rect | null {
    if (!bounds) return null;
    return this.readerFeatures.getScaledMatchBounds(bounds, this.state.zoom);
  }

  // --- L2: Reading Modes & Preferences ---

  openSheet(sheet: ReaderSheet) {
    this.activeSheet = this.activeSheet === sheet ? 'none' : sheet;
  }

  closeSheet() {
    this.activeSheet = 'none';
  }

  /** Kept for the existing button binding and the Escape handler. */
  toggleReadingModesMenu() {
    this.openSheet('view');
  }

  get showReadingModesMenu(): boolean {
    return this.activeSheet === 'view';
  }

  async setTheme(theme: ReaderTheme) {
    this.preferences.theme = theme;
    const docId = this.state.document?.id || '';
    this.readerFeatures.savePreferences(docId, { theme });
  }

  async setScrollMode(scrollMode: ReaderScrollMode) {
    const wasOwn = this.usesOwnSurface;
    this.preferences.scrollMode = scrollMode;
    const docId = this.state.document?.id || '';
    this.readerFeatures.savePreferences(docId, { scrollMode });
    this.dismissSheetForLayoutChange();
    await this.onSurfaceModeChanged(wasOwn);
  }

  async setPageSpread(pageSpread: ReaderPageSpread) {
    const wasOwn = this.usesOwnSurface;
    this.preferences.pageSpread = pageSpread;
    const docId = this.state.document?.id || '';
    this.readerFeatures.savePreferences(docId, { pageSpread });
    this.dismissSheetForLayoutChange();
    await this.onSurfaceModeChanged(wasOwn);
  }

  /**
   * Closes the sheet after a choice that rearranges the page.
   *
   * On a phone the sheet covers most of the screen, so picking "two pages"
   * and being left staring at the sheet tells you nothing about what you
   * just chose. Appearance and tuning controls -- theme, zoom, speed, voice
   * -- deliberately do not close it: those are adjusted in a run, and their
   * effect shows in the strip of page still visible above.
   */
  private dismissSheetForLayoutChange() {
    const isPhone = typeof window !== 'undefined' && window.innerWidth < 600;
    if (isPhone && this.activeSheet === 'view') {
      this.activeSheet = 'none';
    }
  }

  private async onSurfaceModeChanged(wasOwn: boolean) {
    if (this.usesOwnSurface) {
      await this.rebuildSurface();
    } else if (wasOwn) {
      this.renderService.cancelAllSurfaces();
      this.surfacePages = [];
      this.surfaceWindow = null;
    }
  }

  /**
   * L2 — works out which pages the reader's own surface should hold.
   *
   * Two-page spread mounts exactly the spread. Continuous mounts a window
   * around the scroll position: a 500-page document cannot hold 500 canvases,
   * so the list is virtualised with spacers standing in for what is not
   * mounted.
   */
  async rebuildSurface() {
    const total = this.pageCount;
    if (total < 1) return;

    if (this.preferences.scrollMode === 'continuous') {
      const el = this.surfaceScrollRef?.nativeElement;
      const scrollTop = el?.scrollTop || 0;
      const viewportHeight = el?.clientHeight || 800;
      const step = this.preferences.pageSpread === 'two-page' ? 2 : 1;
      const rowHeight = this.estimatedPageHeight + 16;

      const window = this.readerFeatures.calculateLazyWindow(
        scrollTop,
        viewportHeight,
        rowHeight * step,
        Math.ceil(total / step),
        1
      );
      this.surfaceWindow = window;

      const pages: number[] = [];
      for (const row of window.pages) {
        const first = (row - 1) * step + 1;
        for (let i = 0; i < step && first + i <= total; i++) {
          pages.push(first + i);
        }
      }
      this.surfacePages = pages.map(p => this.toSurfacePage(p));
    } else {
      const spread = this.readerFeatures.getSpread(
        this.state.currentPageNumber,
        total,
        this.preferences.pageSpread
      );
      this.surfaceWindow = null;
      this.surfacePages = spread.pages.map(p => this.toSurfacePage(p));
    }

    await this.renderSurfaceWindow();
  }

  private toSurfacePage(pageNumber: number): SurfacePage {
    const existing = this.surfacePages.find(p => p.pageNumber === pageNumber);
    if (existing) return existing;
    return { pageNumber, width: 0, height: 0, rendered: false };
  }

  /**
   * Paints the mounted pages, newest request wins.
   *
   * Each canvas is painted through `renderPageToSurface`, which keeps one
   * in-flight task per canvas instead of one for the whole service, so the
   * pages of a spread do not cancel each other.
   */
  private async renderSurfaceWindow() {
    if (!this.usesOwnSurface || this.surfacePages.length === 0) return;

    const token = ++this.surfaceRenderToken;
    // Let Angular mount the canvases this cycle added before asking for them.
    await new Promise(res => setTimeout(res, 0));
    if (token !== this.surfaceRenderToken) return;

    const canvases = this.surfaceCanvases?.toArray() || [];
    const scale = await this.surfaceScale();

    for (let i = 0; i < this.surfacePages.length; i++) {
      if (token !== this.surfaceRenderToken) return;
      const slot = this.surfacePages[i];
      const canvas = canvases[i]?.nativeElement;
      if (!canvas) continue;

      try {
        const result = await this.renderService.renderPageToSurface(
          slot.pageNumber,
          canvas,
          scale
        );
        slot.width = result.width;
        slot.height = result.height;
        slot.rendered = true;
        // Keeps the virtual list's spacers close to the real page height.
        if (result.height > 0) {
          this.estimatedPageHeight = result.height;
        }
      } catch {
        // A page that will not paint leaves its placeholder showing.
      }
    }
  }

  /**
   * The scale the reader's own pages paint at.
   *
   * These surfaces are new, so they have no legacy default to preserve and
   * fit the width of the device instead of opening at 100% -- a 595pt page
   * at 100% on a 360px phone is cut off on both sides. Rendering at the fit
   * scale rather than painting big and shrinking in CSS also keeps the
   * canvas memory down, which matters on a mid-range Android device with a
   * continuous list of pages mounted.
   *
   * A zoom the reader has set by hand wins: `state.zoom` away from 1.0 means
   * the reader asked for a size, and an automatic fit must not undo that.
   */
  private async surfaceScale(): Promise<number> {
    const zoom = this.state.zoom;
    if (Math.abs(zoom - 1) > 0.01) return zoom;

    const host = this.surfaceScrollRef?.nativeElement;
    const pdfDoc = this.renderService.getActivePdfDoc();
    if (!host || !pdfDoc) return zoom;

    try {
      const page = await pdfDoc.getPage(this.state.currentPageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      if (!viewport.width) return zoom;

      const columns = this.preferences.pageSpread === 'two-page' && host.clientWidth >= 600
        ? 2
        : 1;
      // 8px of padding each side, plus the gap between a spread's pages.
      const gutters = 16 + (columns - 1) * 12;
      const available = Math.max(1, (host.clientWidth - gutters) / columns);

      return Math.max(0.2, Math.min(4, available / viewport.width));
    } catch {
      return zoom;
    }
  }

  /** Continuous scroll drives both the mounted window and the page counter. */
  async onSurfaceScroll() {
    if (this.preferences.scrollMode !== 'continuous' || !this.usesOwnSurface) return;

    const el = this.surfaceScrollRef?.nativeElement;
    if (!el) return;

    const step = this.preferences.pageSpread === 'two-page' ? 2 : 1;
    const rowHeight = (this.estimatedPageHeight + 16) * step;
    const row = Math.floor((el.scrollTop + el.clientHeight / 2) / rowHeight);
    const centrePage = Math.max(1, Math.min(this.pageCount, row * step + 1));

    if (centrePage !== this.state.currentPageNumber) {
      // Updates the counter and last-read position without re-mounting:
      // rebuildSurface below owns the mounted set.
      this.scrubPageNumber = centrePage;
      const docId = this.state.document?.id || '';
      this.readerFeatures.saveLastReadPosition(docId, centrePage);
    }

    const needsRebuild = !this.surfaceWindow ||
      !this.surfacePages.some(p => p.pageNumber === centrePage);
    if (needsRebuild) {
      await this.rebuildSurface();
    }
  }

  // --- L3: Text Reflow ---

  async toggleReflow() {
    const wasOwn = this.usesOwnSurface;
    this.preferences.reflowMode = !this.preferences.reflowMode;
    const docId = this.state.document?.id || '';
    this.readerFeatures.savePreferences(docId, { reflowMode: this.preferences.reflowMode });

    this.dismissSheetForLayoutChange();

    if (this.preferences.reflowMode) {
      if (wasOwn) {
        this.renderService.cancelAllSurfaces();
        this.surfacePages = [];
      }
      await this.loadReflowContent(this.state.currentPageNumber);
    } else if (this.usesOwnSurface) {
      await this.rebuildSurface();
    }
  }

  async loadReflowContent(pageNum: number) {
    const pdfDoc = this.renderService.getActivePdfDoc();
    if (!pdfDoc) return;
    this.isLoadingReflow = true;
    try {
      // extractReflowContent interleaves the page's images into the reading
      // order; without it the view silently dropped every figure.
      this.reflowBlocks = await this.readerFeatures.extractReflowContent(pdfDoc, pageNum, true);
      this.reflowImageCount = this.reflowBlocks.filter(b => b.type === 'image').length;
    } finally {
      this.isLoadingReflow = false;
    }
  }

  changeFontSize(delta: number) {
    const next = Math.max(12, Math.min(32, (this.preferences.fontSize || 16) + delta));
    this.preferences.fontSize = next;
    const docId = this.state.document?.id || '';
    this.readerFeatures.savePreferences(docId, { fontSize: next });
  }

  // --- L4: Bookmarks & Last-Read Position ---

  setSidebarTab(tab: 'thumbnails' | 'outline') {
    this.activeSidebarTab = tab;
    if (tab === 'thumbnails') {
      this.refreshThumbWindow(this.thumbListRef?.nativeElement?.scrollTop || 0);
    }
  }

  private rebuildOutlineRows() {
    this.outlineRows = this.readerFeatures.flattenOutline(
      this.outline,
      this.expandedOutlineKeys
    );
  }

  jumpToOutlineRow(row: ReaderOutlineRow) {
    if (row.pageNumber >= 1 && row.pageNumber <= this.pageCount) {
      this.state.setCurrentPage(row.pageNumber);
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        this.toggleThumbnailsEvent.emit();
      }
    }
  }

  toggleOutlineRow(row: ReaderOutlineRow, e: Event) {
    e.stopPropagation();
    if (this.expandedOutlineKeys.has(row.key)) {
      this.expandedOutlineKeys.delete(row.key);
    } else {
      this.expandedOutlineKeys.add(row.key);
    }
    this.rebuildOutlineRows();
  }

  isCurrentSection(row: ReaderOutlineRow): boolean {
    const current = this.readerFeatures.findOutlineRowForPage(
      this.outlineRows,
      this.state.currentPageNumber
    );
    return !!current && current.key === row.key;
  }

  resumeLastRead() {
    if (this.lastReadPrompt) {
      this.state.setCurrentPage(this.lastReadPrompt.pageNumber);
    }
    this.lastReadPrompt = null;
  }

  startFromBeginning() {
    const docId = this.state.document?.id || '';
    this.readerFeatures.clearLastReadPosition(docId);
    this.state.setCurrentPage(1);
    this.lastReadPrompt = null;
  }

  dismissLastReadPrompt() {
    this.lastReadPrompt = null;
  }

  // --- L5: Read-Aloud ---

  async toggleReadAloud() {
    if (this.readAloudState.isPlaying) {
      this.readAloudService.pause();
    } else if (this.readAloudState.isPaused) {
      this.readAloudService.resume();
    } else {
      await this.startReadAloudOnPage(this.state.currentPageNumber);
    }
  }

  async startReadAloudOnPage(pageNum: number) {
    const pdfDoc = this.renderService.getActivePdfDoc();
    if (!pdfDoc) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = (content.items || [])
        .map((i: any) => ('str' in i ? i.str : ''))
        .join(' ');
      const sentences = this.readerFeatures.segmentSentences(text, pageNum);
      this.readAloudSentences = sentences;

      if (sentences.length === 0) {
        // Nothing to read on this page; carry on to the next rather than
        // leaving a dead Play button.
        if (pageNum < this.pageCount) {
          this.state.setCurrentPage(pageNum + 1);
          await this.startReadAloudOnPage(pageNum + 1);
        }
        return;
      }

      this.readAloudService.playPage(
        pageNum,
        sentences,
        (nextPage) => {
          if (nextPage <= this.pageCount) {
            this.state.setCurrentPage(nextPage);
            void this.startReadAloudOnPage(nextPage);
          } else {
            this.readAloudService.stop();
          }
        },
        this.selectedVoiceName || undefined,
        this.readAloudState.rate
      );
    } catch (e) {
      console.warn('Read aloud error on page', e);
    }
  }

  changeTtsRate(rate: number) {
    this.readAloudService.setRate(rate);
  }

  selectVoice(name: string) {
    this.selectedVoiceName = name;
    this.readAloudService.setVoice(name);
  }

  nextSentence() {
    this.readAloudService.nextSentence();
  }

  previousSentence() {
    this.readAloudService.previousSentence();
  }

  stopReadAloud() {
    this.readAloudService.stop();
    this.readAloudSentences = [];
    this.activeSentence = null;
  }

  /** L5 — highlights the sentence being spoken in the reflow column. */
  isSentenceActive(block: ReflowBlock): boolean {
    if (!this.activeSentence || !block.text) return false;
    if (this.activeSentence.pageNumber !== block.pageNumber) return false;
    const spoken = this.activeSentence.text.trim();
    return spoken.length > 0 && block.text.indexOf(spoken) !== -1;
  }

  // --- L6: Thumbnail Scrubbing ---

  onScrubberInput(e: any) {
    this.isScrubbing = true;
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      this.scrubPageNumber = val;
      this.updateScrubWindow(val);
      void this.loadScrubPreview(val);
    }
  }

  onScrubberChange(e: any) {
    this.isScrubbing = false;
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      this.state.setCurrentPage(val);
      this.updateScrubWindow(val);
    }
  }

  /**
   * The page under the thumb, as a picture.
   *
   * Tokenised so a fast drag paints only the page it lands near: the renders
   * it skipped past are discarded on arrival instead of flashing through.
   */
  private async loadScrubPreview(pageNumber: number) {
    const docId = this.state.document?.id || '';
    if (!docId) return;

    const token = ++this.scrubPreviewToken;
    try {
      const url = await this.renderService.renderPageImage(pageNumber, docId, 0.3);
      if (token === this.scrubPreviewToken) {
        this.scrubPreviewUrl = url;
      }
    } catch {
      if (token === this.scrubPreviewToken) {
        this.scrubPreviewUrl = null;
      }
    }
  }

  private async updateScrubWindow(activePage: number) {
    const totalPages = this.pageCount;
    this.scrubWindow = this.readerFeatures.calculateScrubWindow(activePage, totalPages, 2);
    await this.requestThumbnails(this.scrubWindow.pagesToPreload);
  }

  /** The sidebar list mounts only what is scrolled into view. */
  onThumbListScroll() {
    this.refreshThumbWindow(this.thumbListRef?.nativeElement?.scrollTop || 0);
  }

  private refreshThumbWindow(scrollTop: number) {
    const el = this.thumbListRef?.nativeElement;
    const viewportHeight = el?.clientHeight || 600;
    this.thumbWindow = this.readerFeatures.calculateLazyWindow(
      scrollTop,
      viewportHeight,
      this.thumbRowHeight,
      this.pageCount,
      3
    );
    void this.requestThumbnails(this.thumbWindow.pages);
  }

  /**
   * Renders the thumbnails that are missing, one at a time.
   *
   * Pages already asked for are tracked so a scroll that re-enters the same
   * window does not queue the same render again, and the loop yields between
   * pages so dragging the list stays smooth on a mid-range phone.
   */
  private async requestThumbnails(pages: number[]) {
    const docId = this.state.document?.id || '';
    if (!docId) return;

    for (const p of pages) {
      if (this.thumbnailUrls.has(p) || this.thumbRequests.has(p)) continue;
      this.thumbRequests.add(p);
      try {
        const url = await this.renderService.renderPageImage(p, docId, 0.22);
        this.thumbnailUrls.set(p, url);
      } catch {
        // Leaves the placeholder in place for this page.
      } finally {
        this.thumbRequests.delete(p);
      }
      await new Promise(res => setTimeout(res, 0));
    }
  }

  // --- Navigation & Zoom ---

  onPageInputChange(val: any) {
    const pageNum = parseInt(val, 10);
    if (!isNaN(pageNum)) {
      this.state.setCurrentPage(pageNum);
    }
  }

  prevPage() {
    const step = this.preferences.pageSpread === 'two-page' ? 2 : 1;
    this.state.setCurrentPage(Math.max(1, this.state.currentPageNumber - step));
  }

  nextPage() {
    const step = this.preferences.pageSpread === 'two-page' ? 2 : 1;
    this.state.setCurrentPage(Math.min(this.pageCount, this.state.currentPageNumber + step));
  }

  selectPage(pageNum: number) {
    this.state.setCurrentPage(pageNum);
  }

  zoomIn() {
    this.state.zoomIn();
  }

  zoomOut() {
    this.state.zoomOut();
  }

  /**
   * Fits the page to the viewport by setting the zoom the fit works out to.
   *
   * `setFitMode` alone does nothing: `fitMode$` has no subscriber anywhere in
   * the app, so both of these buttons moved a value nobody read and the page
   * did not budge. It is still set, so the state stays coherent for anything
   * that reads it later, but the zoom is what actually performs the fit.
   *
   * Nothing here changes a default -- the document still opens at the zoom it
   * always did. It only makes a control that was already on screen do what
   * its label says.
   */
  async applyFit(mode: 'width' | 'page') {
    this.state.setFitMode(mode);

    const pdfDoc = this.renderService.getActivePdfDoc();
    const host = this.canvasViewportRef?.nativeElement;
    if (!pdfDoc || !host) return;

    try {
      const page = await pdfDoc.getPage(this.state.currentPageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      if (!viewport.width || !viewport.height) return;

      // The gutter the viewport's own padding takes, so the page is not
      // fitted to a width it then overflows.
      const styles = getComputedStyle(host);
      const padX = parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      const padY = parseFloat(styles.paddingTop || '0') + parseFloat(styles.paddingBottom || '0');

      const availableWidth = Math.max(1, host.clientWidth - padX);
      const availableHeight = Math.max(1, host.clientHeight - padY);

      const widthScale = availableWidth / viewport.width;
      const target = mode === 'width'
        ? widthScale
        : Math.min(widthScale, availableHeight / viewport.height);

      // setZoom clamps to the editor's own 20%-400% range.
      this.state.setZoom(target);
    } catch {
      // A page that will not report its size simply leaves the zoom alone.
    }
  }

  fitWidth() {
    void this.applyFit('width');
  }

  fitPage() {
    void this.applyFit('page');
  }

  toggleFullscreen() {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        this.isFullscreen = true;
      }).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          this.isFullscreen = false;
        }).catch(() => {});
      }
    }
  }

  // --- Keyboard Shortcuts ---

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (event.key === 'Escape') {
        this.closeSearch();
      }
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        this.toggleSearchEvent.emit();
      } else if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault();
        if (event.shiftKey) {
          this.state.redo();
        } else {
          this.state.undo();
        }
      } else if (event.key === 'y' || event.key === 'Y') {
        event.preventDefault();
        this.state.redo();
      } else if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        this.zoomIn();
      } else if (event.key === '-') {
        event.preventDefault();
        this.zoomOut();
      }
    } else {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        this.nextPage();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        this.prevPage();
      } else if (event.key === 'Escape') {
        this.closeSearch();
        this.closeSheet();
      }
    }
  }

  // --- Touch Gestures (Swipe & Pinch) ---

  onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      this.initialPinchDist = this.getTouchDistance(e.touches);
      this.initialZoom = this.state.zoom;
    }
  }

  onTouchMove(e: TouchEvent) {
    if (e.touches.length === 2 && this.initialPinchDist > 0) {
      const currentDist = this.getTouchDistance(e.touches);
      const scaleDelta = currentDist / this.initialPinchDist;
      this.state.setZoom(this.initialZoom * scaleDelta);
    }
  }

  onTouchEnd(e: TouchEvent) {
    if (e.changedTouches.length === 1 && this.touchStartX > 0) {
      const deltaX = e.changedTouches[0].clientX - this.touchStartX;
      const deltaY = e.changedTouches[0].clientY - this.touchStartY;

      // A page swipe only makes sense where a page is a discrete unit; in
      // continuous scroll the gesture belongs to the scroller.
      const swipesPages = this.preferences.scrollMode !== 'continuous';

      if (swipesPages && Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX < 0) {
          this.nextPage();
        } else {
          this.prevPage();
        }
      }
      this.touchStartX = 0;
      this.touchStartY = 0;
    }
    this.initialPinchDist = 0;
  }

  private getTouchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
