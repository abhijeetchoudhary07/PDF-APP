import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { AppButtonComponent } from '../ui/button/button.component';
import { AppBadgeComponent } from '../ui/badge/badge.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-file-preview',
  templateUrl: './file-preview.component.html',
  styleUrls: ['./file-preview.component.scss'],
  standalone: true,
  imports: [CommonModule, AppButtonComponent, AppBadgeComponent],
  providers: [DecimalPipe]
})
export class FilePreviewComponent {
  @Input() file?: File;
  @Input() thumbnailUrl?: string;
  @Input() dimensions?: { width: number; height: number };
  @Input() pageCount?: number;
  @Input() format?: string;
  @Input() badgeText?: string;
  @Input() showPreviewBtn = true;
  @Input() showReplaceBtn = true;
  @Input() showRemoveBtn = true;
  @Input() compact = false;

  @Output() preview = new EventEmitter<void>();
  @Output() replace = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();

  get isPdf(): boolean {
    return (
      this.file?.type === 'application/pdf' ||
      !!this.file?.name.toLowerCase().endsWith('.pdf')
    );
  }

  get isImage(): boolean {
    return (
      !!this.file?.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(this.file?.name || '')
    );
  }

  get formatBadge(): string {
    if (this.format) return this.format;
    if (!this.file) return '';
    if (this.isPdf) return 'PDF';
    const ext = this.file.name.split('.').pop()?.toUpperCase();
    return ext || 'FILE';
  }

  get badgeVariant(): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
    if (this.isPdf) return 'danger';
    if (this.isImage) return 'primary';
    return 'neutral';
  }

  onThumbnailClick(): void {
    if (this.showPreviewBtn) {
      this.preview.emit();
    }
  }
}
