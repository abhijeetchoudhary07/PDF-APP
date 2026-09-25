import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfRenderService } from '../../../../core/services/pdf-render.service';
import { SearchMatch } from '../../../../core/models/pdf-editor.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-reader',
  templateUrl: './pdf-reader.component.html',
  styleUrls: ['./pdf-reader.component.scss'],
  standalone: true,
  imports: [
    AppIconComponent, TranslatePipe, CommonModule, FormsModule]
})
export class PdfReaderComponent implements OnInit, OnDestroy {
  state = inject(PdfEditorStateService);
  renderService = inject(PdfRenderService);

  @Input() showThumbnails = false;
  @Input() showSearch = false;
  @Output() toggleThumbnailsEvent = new EventEmitter<void>();
  @Output() toggleSearchEvent = new EventEmitter<void>();

  // Search State
  searchQuery = '';
  searchResults: SearchMatch[] = [];
  currentMatchIndex = -1;
  isSearching = false;

  // Thumbnails State
  thumbnailUrls: Map<number, string> = new Map();

  // Fullscreen
  isFullscreen = false;

  // Touch tracking for swipe & pinch-to-zoom
  private touchStartX = 0;
  private touchStartY = 0;
  private initialPinchDist = 0;
  private initialZoom = 1.0;

  private subs = new Subscription();

  ngOnInit() {
    this.subs.add(
      this.state.document$.subscribe(doc => {
        if (doc) {
          this.loadThumbnails(doc.id, doc.pageCount);
        } else {
          this.thumbnailUrls.clear();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  // --- Navigation ---

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

  // --- Zoom ---

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

  // --- Text Search ---

  async performSearch() {
    if (!this.searchQuery || this.searchQuery.trim().length === 0) {
      this.searchResults = [];
      this.currentMatchIndex = -1;
      return;
    }

    this.isSearching = true;
    try {
      this.searchResults = await this.renderService.searchText(this.searchQuery);
      if (this.searchResults.length > 0) {
        this.currentMatchIndex = 0;
        this.jumpToMatch(0);
      } else {
        this.currentMatchIndex = -1;
      }
    } finally {
      this.isSearching = false;
    }
  }

  nextMatch() {
    if (this.searchResults.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchResults.length;
    this.jumpToMatch(this.currentMatchIndex);
  }

  prevMatch() {
    if (this.searchResults.length === 0) return;
    this.currentMatchIndex =
      (this.currentMatchIndex - 1 + this.searchResults.length) % this.searchResults.length;
    this.jumpToMatch(this.currentMatchIndex);
  }

  private jumpToMatch(index: number) {
    const match = this.searchResults[index];
    if (match) {
      this.state.setCurrentPage(match.pageNumber);
    }
  }

  closeSearch() {
    this.searchQuery = '';
    this.searchResults = [];
    this.currentMatchIndex = -1;
    this.toggleSearchEvent.emit();
  }

  // --- Thumbnails Loading ---

  private async loadThumbnails(docId: string, pageCount: number) {
    // Lazy render the first 10 thumbnails, others as needed
    const count = Math.min(pageCount, 15);
    for (let p = 1; p <= count; p++) {
      if (!this.thumbnailUrls.has(p)) {
        try {
          const url = await this.renderService.getPageThumbnail(p, docId, 0.2);
          this.thumbnailUrls.set(p, url);
        } catch {
          // ignore thumbnail errors
        }
      }
    }
  }

  // --- Desktop Keyboard Shortcuts ---

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Do not trigger if typing in an input or textarea
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
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        this.state.deleteSelectedElement();
      }
    }
  }

  // --- Mobile Touch Gestures (Swipe & Pinch) ---

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

      // Check for horizontal swipe (> 60px and more horizontal than vertical)
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
