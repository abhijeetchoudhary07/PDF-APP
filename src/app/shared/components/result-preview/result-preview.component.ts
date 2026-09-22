import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { AppButtonComponent } from '../ui/button/button.component';
import { AppBadgeComponent } from '../ui/badge/badge.component';
import { BeforeAfterPreviewComponent } from '../before-after-preview/before-after-preview.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

export interface PreviewData {
  name: string;
  type: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  pages?: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-result-preview',
  templateUrl: './result-preview.component.html',
  styleUrls: ['./result-preview.component.scss'],
  standalone: true,
  imports: [CommonModule, AppButtonComponent, BeforeAfterPreviewComponent, TranslatePipe],
  providers: [DecimalPipe]
})
export class ResultPreviewComponent implements OnInit, OnChanges {
  @Input() beforeData?: PreviewData;
  @Input() afterData?: PreviewData;
  @Input() file?: File;
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() beforeUrl?: string;
  @Input() afterUrl?: string;
  @Input() outputFilename?: string;
  @Input() showWarning?: string; // For "Impossible Targets" warning
  @Input() showVisualComparison = true;

  @Output() onSave = new EventEmitter<void>();
  @Output() onShare = new EventEmitter<void>();
  @Output() onChangeSettings = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  @Output() shared = new EventEmitter<void>();
  @Output() reset = new EventEmitter<void>();

  ngOnInit(): void {
    this.initData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.initData();
  }

  private initData(): void {
    if (this.file && !this.afterData) {
      this.afterData = {
        name: this.file.name,
        type: this.file.type || 'application/pdf',
        sizeBytes: this.file.size
      };
    }
  }

  handleSave(): void {
    this.onSave.emit();
    this.saved.emit();
  }

  handleShare(): void {
    this.onShare.emit();
    this.shared.emit();
  }

  handleReset(): void {
    this.onChangeSettings.emit();
    this.reset.emit();
  }

  get compressionPercentage(): number {
    if (!this.beforeData || !this.afterData) return 0;
    if (this.afterData.sizeBytes >= this.beforeData.sizeBytes) return 0;
    return ((this.beforeData.sizeBytes - this.afterData.sizeBytes) / this.beforeData.sizeBytes) * 100;
  }

  get hasVisualPreview(): boolean {
    return this.showVisualComparison && (!!this.beforeUrl || !!this.afterUrl);
  }
}

