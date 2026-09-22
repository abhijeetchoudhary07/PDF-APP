import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImagePreviewComponent } from '../image-preview/image-preview.component';
import { PdfPreviewComponent, OverlayConfig } from '../pdf-preview/pdf-preview.component';
import { AppBadgeComponent } from '../ui/badge/badge.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-document-preview',
  templateUrl: './document-preview.component.html',
  styleUrls: ['./document-preview.component.scss'],
  standalone: true,
  imports: [CommonModule, ImagePreviewComponent, PdfPreviewComponent]
})
export class DocumentPreviewComponent {
  @Input() file?: File;
  @Input() imageUrl?: string;
  @Input() pdfArrayBuffer?: ArrayBuffer;
  @Input() title?: string;
  @Input() overlays?: OverlayConfig;
  @Input() isModal = false;

  @Output() close = new EventEmitter<void>();

  get isPdf(): boolean {
    return (
      this.file?.type === 'application/pdf' ||
      !!this.file?.name.toLowerCase().endsWith('.pdf') ||
      !!this.pdfArrayBuffer
    );
  }

  get isImage(): boolean {
    return (
      !!this.file?.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif)$/i.test(this.file?.name || '') ||
      (!!this.imageUrl && !this.isPdf)
    );
  }
}
