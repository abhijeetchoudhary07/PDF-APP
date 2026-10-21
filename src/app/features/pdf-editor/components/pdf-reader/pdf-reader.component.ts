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
  ReflowBlock,
  ReadAloudSentence,
  ReadAloudState,
  ScrubWindow,
  LastReadPosition
} from '../../../../core/models/reader-features.types';
import { Rect } from '../../../../core/models/pdf-editor.types';

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

  @Input() showThumbnails = false;
  @Input() showSearch = false;
  @Output() toggleThumbnailsEvent = new EventEmitter<void>();
  @Output() toggleSearchEvent = new EventEmitter<void>();

  // L1: Search State
  searchQuery = '';
  searchResult: IncrementalSearchResult | null = null;
  currentMatchIndex = -1;
  isSearching = false;

  // L2: Reading Modes & Preferences
  preferences: ReaderPreferences = {
    theme: 'normal',
    scrollMode: 'paged',
    pageSpread: 'single',
    fontSize: 16,
    reflowMode: false
  };
  showReadingModesMenu = false;

  // L3: Text Reflow State
  reflowBlocks: ReflowBlock[] = [];
  isLoadingReflow = false;

  // L4: Bookmarks Sidebar & Last-Read Position
  outline: ReaderOutlineItem[] = [];
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
  isTtsSupported = false;

  // L6: Thumbnail Scrubbing State
  scrubPageNumber = 1;
  scrubWindow: ScrubWindow | null = null;
  thumbnailUrls: Map<number, string> = new Map();
  isScrubbing = false;

  // Fullscreen
  isFullscreen = false;

  // Touch tracking for swipe & pinch-to-zoom
  private touchStartX = 0;
  private touchStartY = 0;
  private initialPinchDist = 0;
  private initialZoom = 1.0;

  private subs = new Subscription();

  ngOnInit() {
    this.isTtsSupported = this.readAloudService.isAvailable();

    // Document Subscription
    this.subs.add(
      this.state.document$.subscribe(async (doc) => {
        if (doc) {
          this.preferences = this.readerFeatures.getPreferences(doc.id);
          this.scrubPageNumber = this.state.currentPageNumber || 1;
          this.updateScrubWindow(this.scrubPageNumber);

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
            }
          }
        } else {
          this.thumbnailUrls.clear();
          this.outline = [];
          this.searchResult = null;
          this.lastReadPrompt = null;
          this.hasCheckedLastRead = false;
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
          }
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
    this.subs.unsubscribe();
  }

  // --- L1: Incremental Text Search ---

  async performSearch() {
    if (!this.searchQuery || this.searchQuery.trim().length === 0) {
      this.searchResult = null;
      this.currentMatchIndex = -1;
      return;
    }

    const pdfDoc = this.renderService.getActivePdfDoc();
    if (!pdfDoc) return;

    this.isSearching = true;
    try {
      this.searchResult = await this.readerFeatures.searchDocumentIncremental(
        pdfDoc,
        this.searchQuery,
        (progress) => {
          this.searchResult = progress;
        }
      );

      if (this.searchResult.matches.length > 0) {
        this.currentMatchIndex = 0;
        this.jumpToMatch(0);
      } else {
        this.currentMatchIndex = -1;
      }
    } finally {
      this.isSearching = false;
    }
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
    this.searchQuery = '';
    this.searchResult = null;
    this.currentMatchIndex = -1;
    this.toggleSearchEvent.emit();
  }

  get currentMatchesOnActivePage(): IncrementalSearchMatch[] {
    if (!this.searchResult) return [];
    return this.searchResult.matchesByPage.get(this.state.currentPageNumber) || [];
  }

  getScaledBounds(bounds: Rect | undefined): Rect | null {
    if (!bounds) return null;
    return this.readerFeatures.getScaledMatchBounds(bounds, this.state.zoom);
  }

  // --- L2: Reading Modes & Preferences ---

  toggleReadingModesMenu() {
    this.showReadingModesMenu = !this.showReadingModesMenu;
  }

  setTheme(theme: ReaderTheme) {
    this.preferences.theme = theme;
    const docId = this.state.document?.id || '';
    this.readerFeatures.savePreferences(docId, { theme });
  }

  setScrollMode(scrollMode: ReaderScrollMode) {
    this.preferences.scrollMode = scrollMode;
    const docId = this.state.document?.id || '';
    this.readerFeatures.savePreferences(docId, { scrollMode });
  }

  setPageSpread(pageSpread: ReaderPageSpread) {
    this.preferences.pageSpread = pageSpread;
    const docId = this.state.document?.id || '';
    this.readerFeatures.savePreferences(docId, { pageSpread });
  }

  // --- L3: Text Reflow ---

  async toggleReflow() {
    this.preferences.reflowMode = !this.preferences.reflowMode;
    const docId = this.state.document?.id || '';
    this.readerFeatures.savePreferences(docId, { reflowMode: this.preferences.reflowMode });

    if (this.preferences.reflowMode) {
      await this.loadReflowContent(this.state.currentPageNumber);
    }
  }

  async loadReflowContent(pageNum: number) {
    const pdfDoc = this.renderService.getActivePdfDoc();
    if (!pdfDoc) return;
    this.isLoadingReflow = true;
    try {
      this.reflowBlocks = await this.readerFeatures.extractReflowBlocks(pdfDoc, pageNum);
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
  }

  jumpToOutline(item: ReaderOutlineItem) {
    if (item.pageNumber >= 1 && item.pageNumber <= (this.state.document?.pageCount || 1)) {
      this.state.setCurrentPage(item.pageNumber);
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        this.toggleThumbnailsEvent.emit();
      }
    }
  }

  toggleOutlineItem(item: ReaderOutlineItem, e: Event) {
    e.stopPropagation();
    item.expanded = !item.expanded;
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

      if (sentences.length === 0) return;

      this.readAloudService.playPage(
        pageNum,
        sentences,
        (nextPage) => {
          if (nextPage <= (this.state.document?.pageCount || 1)) {
            this.state.setCurrentPage(nextPage);
            this.startReadAloudOnPage(nextPage);
          } else {
            this.readAloudService.stop();
          }
        },
        undefined,
        this.readAloudState.rate
      );
    } catch (e) {
      console.warn('Read aloud error on page', e);
    }
  }

  changeTtsRate(rate: number) {
    this.readAloudService.setRate(rate);
  }

  stopReadAloud() {
    this.readAloudService.stop();
  }

  // --- L6: Thumbnail Scrubbing ---

  onScrubberInput(e: any) {
    this.isScrubbing = true;
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      this.scrubPageNumber = val;
      this.updateScrubWindow(val);
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

  private async updateScrubWindow(activePage: number) {
    const totalPages = this.state.document?.pageCount || 1;
    this.scrubWindow = this.readerFeatures.calculateScrubWindow(activePage, totalPages, 2);
    const docId = this.state.document?.id || '';
    if (!docId) return;

    for (const p of this.scrubWindow.pagesToPreload) {
      if (!this.thumbnailUrls.has(p)) {
        try {
          const url = await this.renderService.getPageThumbnail(p, docId, 0.15);
          this.thumbnailUrls.set(p, url);
        } catch {}
      }
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
    this.state.prevPage();
  }

  nextPage() {
    this.state.nextPage();
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

  fitWidth() {
    this.state.setFitMode('width');
  }

  fitPage() {
    this.state.setFitMode('page');
  }

  toggleFullscreen() {
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
        this.showReadingModesMenu = false;
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

      if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
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
