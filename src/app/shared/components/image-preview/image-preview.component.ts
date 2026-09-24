import { Component, EventEmitter, HostListener, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { AppButtonComponent } from '../ui/button/button.component';
import { AppBadgeComponent } from '../ui/badge/badge.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-image-preview',
  templateUrl: './image-preview.component.html',
  styleUrls: ['./image-preview.component.scss'],
  standalone: true,
  imports: [CommonModule, AppBadgeComponent],
  providers: [DecimalPipe]
})
export class ImagePreviewComponent {
  @Input() src!: string;
  @Input() alt = 'Image preview';
  @Input() title?: string;
  @Input() dimensions?: { width: number; height: number };
  @Input() fileSize?: number;
  @Input() format?: string;
  @Input() zoomable = true;
  @Input() isModal = false;

  @Output() closed = new EventEmitter<void>();

  zoomLevel = 1; // 1 = 100%
  readonly MIN_ZOOM = 0.25;
  readonly MAX_ZOOM = 4;

  zoomIn(): void {
    if (this.zoomLevel < this.MAX_ZOOM) {
      this.zoomLevel = Math.min(this.MAX_ZOOM, Math.round((this.zoomLevel + 0.25) * 100) / 100);
    }
  }

  zoomOut(): void {
    if (this.zoomLevel > this.MIN_ZOOM) {
      this.zoomLevel = Math.max(this.MIN_ZOOM, Math.round((this.zoomLevel - 0.25) * 100) / 100);
    }
  }

  resetZoom(): void {
    this.zoomLevel = 1;
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.isModal) {
      this.closed.emit();
    }
  }
}
