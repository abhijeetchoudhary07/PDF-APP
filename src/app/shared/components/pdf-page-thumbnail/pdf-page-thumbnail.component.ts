import { AppSkeletonComponent } from '../ui/skeleton/skeleton.component';
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';


@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-page-thumbnail',
  templateUrl: './pdf-page-thumbnail.component.html',
  styleUrls: ['./pdf-page-thumbnail.component.scss'],
  standalone: true,
  imports: [
    AppSkeletonComponent
]
})
export class PdfPageThumbnailComponent {
  @Input() pageNumber!: number;
  @Input() thumbnailUrl?: string;
  @Input() isLoading = false;
  @Input() isError = false;
  @Input() isSelected = false;
  @Input() isDeleted = false;
  @Input() rotation = 0; // 0, 90, 180, 270
  @Input() isDraggable = false;
  @Input() isDragging = false;
  @Input() isDragOver = false;
  @Input() showActions = true;
  @Input() badgeText?: string;

  @Output() selectPage = new EventEmitter<number>();
  @Output() rotatePage = new EventEmitter<number>();
  @Output() deletePage = new EventEmitter<number>();
  @Output() previewPage = new EventEmitter<number>();
  @Output() retry = new EventEmitter<number>();

  onCardClick(e: MouseEvent): void {
    // Avoid triggering when clicking buttons
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    this.selectPage.emit(this.pageNumber);
  }

  onRotateClick(e: MouseEvent): void {
    e.stopPropagation();
    this.rotatePage.emit(this.pageNumber);
  }

  onDeleteClick(e: MouseEvent): void {
    e.stopPropagation();
    this.deletePage.emit(this.pageNumber);
  }

  onPreviewClick(e: MouseEvent): void {
    e.stopPropagation();
    this.previewPage.emit(this.pageNumber);
  }

  onRetryClick(e: MouseEvent): void {
    e.stopPropagation();
    this.retry.emit(this.pageNumber);
  }
}
