import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent } from '../ui/button/button.component';
import { AppBadgeComponent } from '../ui/badge/badge.component';
import { FilePreviewComponent } from '../file-preview/file-preview.component';
import { TranslationService } from '../../../core/services/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

export type DropzoneState = 'empty' | 'selected' | 'processing' | 'success' | 'error';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-file-dropzone',
  templateUrl: './file-dropzone.component.html',
  styleUrls: ['./file-dropzone.component.scss'],
  standalone: true,
  imports: [CommonModule, AppButtonComponent, FilePreviewComponent, TranslatePipe]
})
export class FileDropzoneComponent {
  @Input() icon = 'cloud-upload';
  @Input() title?: string;
  @Input() description?: string;
  @Input() accept = '*/*';
  @Input() multiple = false;
  @Input() isLoading = false;
  @Input() loadingMessage?: string;
  @Input() buttonText?: string;

  // Rich State Support
  @Input() state: DropzoneState = 'empty';
  @Input() selectedFile?: File;
  @Input() dimensions?: { width: number; height: number };
  @Input() pageCount?: number;
  @Input() progress = 0;
  @Input() stageText?: string;
  @Input() errorMessage?: string;
  @Input() successMessage?: string;
  @Input() previewUrl?: string;

  @Output() fileSelected = new EventEmitter<File>();
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() removeFile = new EventEmitter<void>();
  @Output() preview = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() retry = new EventEmitter<void>();

  constructor(private translationService: TranslationService) {}

  get displayTitle(): string {
    return this.title || this.translationService.translate('dropzone.defaultTitle');
  }

  get displayDescription(): string {
    return this.description || this.translationService.translate('dropzone.defaultDesc');
  }

  get displayButtonText(): string {
    return this.buttonText || this.translationService.translate('dropzone.browseFiles');
  }

  get displayLoadingMessage(): string {
    return this.loadingMessage || this.translationService.translate('dropzone.readingFile');
  }

  get displayStageText(): string {
    return this.stageText || this.translationService.translate('dropzone.processing');
  }

  isDragging = false;
  isDragRejected = false;

  get effectiveState(): DropzoneState {
    if (this.isLoading) return 'processing';
    if (this.errorMessage) return 'error';
    if (this.selectedFile) return 'selected';
    return this.state;
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = true;

    // Check mime type rejection if accept is restricted
    if (this.accept && this.accept !== '*/*' && e.dataTransfer?.items) {
      const items = Array.from(e.dataTransfer.items);
      const hasAccepted = items.some(item => {
        if (item.kind !== 'file') return true;
        const acceptedTypes = this.accept.split(',').map(t => t.trim().toLowerCase());
        return acceptedTypes.some(t => {
          if (t.endsWith('/*')) {
            const prefix = t.replace('/*', '');
            return item.type.startsWith(prefix);
          }
          return item.type === t;
        });
      });
      this.isDragRejected = !hasAccepted;
    } else {
      this.isDragRejected = false;
    }
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = false;
    this.isDragRejected = false;
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = false;
    this.isDragRejected = false;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleSelectedFiles(files);
    }
  }

  onFileInputChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleSelectedFiles(input.files);
      input.value = '';
    }
  }

  private handleSelectedFiles(fileList: FileList) {
    if (this.multiple) {
      this.filesSelected.emit(Array.from(fileList));
    } else {
      this.selectedFile = fileList[0];
      this.fileSelected.emit(fileList[0]);
    }
  }

  onRemove() {
    this.selectedFile = undefined;
    this.removeFile.emit();
  }
}

