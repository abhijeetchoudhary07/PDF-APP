import { Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfRenderService } from '../../../core/services/pdf-render.service';

export interface OverlayConfig {
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkColor?: string;
  watermarkSize?: number;
  watermarkRotation?: number;
  pageNumberPosition?: 'bottom-center' | 'bottom-right' | 'top-right' | 'bottom-left';
  pageNumberFormat?: string; // e.g., "Page {n}"
  signatureImgUrl?: string;
  signatureRect?: { x: number; y: number; width: number; height: number };
  cropRect?: { x: number; y: number; width: number; height: number };
  redactions?: { x: number; y: number; width: number; height: number }[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-preview',
  templateUrl: './pdf-preview.component.html',
  styleUrls: ['./pdf-preview.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class PdfPreviewComponent implements OnChanges, OnDestroy {
  @ViewChild('pdfCanvas', { static: false }) pdfCanvas?: ElementRef<HTMLCanvasElement>;

  @Input() pdfFile?: File;
  @Input() arrayBuffer?: ArrayBuffer;
  @Input() docId?: string;
  @Input() initialPage = 1;
  @Input() overlays?: OverlayConfig;
  @Input() isModal = false;

  @Output() close = new EventEmitter<void>();
  @Output() pageChange = new EventEmitter<number>();

  currentPage = 1;
  totalPages = 1;
  scale = 1.0;
  isLoading = false;
  error?: string;

  private currentDoc: any = null;

  constructor(private pdfRenderService: PdfRenderService) {}

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['pdfFile'] || changes['arrayBuffer']) {
      await this.loadDocument();
    } else if (changes['initialPage'] && this.initialPage !== this.currentPage) {
      this.currentPage = this.initialPage;
      await this.renderCurrentPage();
    } else if (changes['overlays']) {
      await this.renderCurrentPage();
    }
  }

  ngOnDestroy(): void {
    this.currentDoc = null;
  }

  async loadDocument(): Promise<void> {
    this.isLoading = true;
    this.error = undefined;

    try {
      let buffer: ArrayBuffer;
      if (this.arrayBuffer) {
        buffer = this.arrayBuffer;
      } else if (this.pdfFile) {
        buffer = await this.pdfFile.arrayBuffer();
      } else {
        this.isLoading = false;
        return;
      }

      const id = this.docId || this.pdfFile?.name || 'doc_' + Date.now();
      this.currentDoc = await this.pdfRenderService.loadPdf(buffer, id);
      this.totalPages = this.currentDoc.numPages;
      this.currentPage = Math.min(Math.max(1, this.initialPage), this.totalPages);

      setTimeout(() => this.renderCurrentPage(), 50);
    } catch (err: any) {
      this.error = 'Failed to load PDF document for preview: ' + (err?.message || err);
      this.isLoading = false;
    }
  }

  async renderCurrentPage(): Promise<void> {
    if (!this.pdfCanvas?.nativeElement || !this.currentDoc) return;

    this.isLoading = true;
    try {
      const canvas = this.pdfCanvas.nativeElement;
      await this.pdfRenderService.renderPageToCanvas(this.currentPage, canvas, this.scale);
      this.drawOverlays();
      this.isLoading = false;
    } catch (err: any) {
      this.error = 'Error rendering page: ' + (err?.message || err);
      this.isLoading = false;
    }
  }

  private drawOverlays(): void {
    if (!this.overlays || !this.pdfCanvas?.nativeElement) return;
    const canvas = this.pdfCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = this.scale * (window.devicePixelRatio || 1);

    // 1. Watermark
    if (this.overlays.watermarkText) {
      ctx.save();
      ctx.globalAlpha = this.overlays.watermarkOpacity ?? 0.3;
      ctx.fillStyle = this.overlays.watermarkColor || '#ef4444';
      const fontSize = (this.overlays.watermarkSize || 48) * scale;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const rot = (this.overlays.watermarkRotation ?? -45) * (Math.PI / 180);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rot);
      ctx.fillText(this.overlays.watermarkText, 0, 0);
      ctx.restore();
    }

    // 2. Redactions
    if (this.overlays.redactions && this.overlays.redactions.length > 0) {
      ctx.save();
      ctx.fillStyle = '#000000';
      for (const r of this.overlays.redactions) {
        ctx.fillRect(r.x * scale, r.y * scale, r.width * scale, r.height * scale);
      }
      ctx.restore();
    }

    // 3. Page Number Preview
    if (this.overlays.pageNumberPosition) {
      ctx.save();
      ctx.fillStyle = '#1e293b';
      ctx.font = `${14 * scale}px sans-serif`;
      const text = (this.overlays.pageNumberFormat || 'Page {n}')
        .replace('{n}', String(this.currentPage))
        .replace('{total}', String(this.totalPages));

      const margin = 24 * scale;
      if (this.overlays.pageNumberPosition === 'bottom-center') {
        ctx.textAlign = 'center';
        ctx.fillText(text, canvas.width / 2, canvas.height - margin);
      } else if (this.overlays.pageNumberPosition === 'bottom-right') {
        ctx.textAlign = 'right';
        ctx.fillText(text, canvas.width - margin, canvas.height - margin);
      } else if (this.overlays.pageNumberPosition === 'bottom-left') {
        ctx.textAlign = 'left';
        ctx.fillText(text, margin, canvas.height - margin);
      } else if (this.overlays.pageNumberPosition === 'top-right') {
        ctx.textAlign = 'right';
        ctx.fillText(text, canvas.width - margin, margin + 14 * scale);
      }
      ctx.restore();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.pageChange.emit(this.currentPage);
      this.renderCurrentPage();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.pageChange.emit(this.currentPage);
      this.renderCurrentPage();
    }
  }

  zoomIn(): void {
    if (this.scale < 2.5) {
      this.scale = Math.min(2.5, Math.round((this.scale + 0.25) * 100) / 100);
      this.renderCurrentPage();
    }
  }

  zoomOut(): void {
    if (this.scale > 0.5) {
      this.scale = Math.max(0.5, Math.round((this.scale - 0.25) * 100) / 100);
      this.renderCurrentPage();
    }
  }

  resetZoom(): void {
    this.scale = 1.0;
    this.renderCurrentPage();
  }
}
