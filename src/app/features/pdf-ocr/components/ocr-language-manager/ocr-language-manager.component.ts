import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { OcrModelManagerService } from '../../../../core/services/ocr-model-manager.service';
import { OcrModelMetadata } from '../../../../core/models/ocr.models';
import { ToastService } from '../../../../core/services/toast.service';
import {
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  AppModalComponent,
  TranslatePipe
} from '../../../../shared/components/ui';

@Component({
  selector: 'app-ocr-language-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    FormsModule,
    AppButtonComponent,
    AppBadgeComponent,
    AppIconComponent,
    AppModalComponent,
    TranslatePipe
  ],
  templateUrl: './ocr-language-manager.component.html',
  styleUrls: ['./ocr-language-manager.component.scss']
})
export class OcrLanguageManagerComponent implements OnInit, OnDestroy {
  private modelManager = inject(OcrModelManagerService);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  @Input() isOpen = false;
  @Input() showConfirmModal = false;
  @Input() confirmModel?: OcrModelMetadata;

  @Output() closed = new EventEmitter<void>();
  @Output() confirmClosed = new EventEmitter<void>();
  @Output() modelDownloaded = new EventEmitter<string>();

  models: OcrModelMetadata[] = [];
  storageUsedMB = '0';
  isDownloadingMap: Record<string, boolean> = {};
  isClearing = false;

  private sub?: Subscription;

  ngOnInit(): void {
    this.models = this.modelManager.getAllModels();
    this.sub = this.modelManager.models$.subscribe(updated => {
      this.models = updated;
      this.updateStorage();
      this.cdr.detectChanges();
    });
    this.updateStorage();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async updateStorage(): Promise<void> {
    const bytes = await this.modelManager.getStorageUsed();
    this.storageUsedMB = (bytes / (1024 * 1024)).toFixed(1);
    this.cdr.detectChanges();
  }

  closeSheet(): void {
    this.isOpen = false;
    this.closed.emit();
  }

  closeConfirmModal(): void {
    this.showConfirmModal = false;
    this.confirmClosed.emit();
  }

  async confirmDownload(): Promise<void> {
    if (!this.confirmModel) return;
    const model = this.confirmModel;
    this.closeConfirmModal();
    await this.startDownload(model);
  }

  async startDownload(model: OcrModelMetadata): Promise<void> {
    if (model.isBundled || model.status === 'offline_ready') return;

    this.isDownloadingMap[model.code] = true;
    this.cdr.detectChanges();

    try {
      await this.modelManager.downloadModel(model.code, pct => {
        model.downloadProgress = pct;
        this.cdr.detectChanges();
      });
      this.toastService.show(
        'success',
        `${model.name} downloaded successfully for permanent offline use.`
      );
      this.modelDownloaded.emit(model.code);
      await this.updateStorage();
    } catch (err: any) {
      this.toastService.show(
        'error',
        err?.message || `Failed to download ${model.name} model.`
      );
    } finally {
      this.isDownloadingMap[model.code] = false;
      this.cdr.detectChanges();
    }
  }

  async freeUpSpace(): Promise<void> {
    this.isClearing = true;
    this.cdr.detectChanges();

    try {
      const res = await this.modelManager.freeUpSpace();
      const freedMB = (res.freedBytes / (1024 * 1024)).toFixed(1);
      this.toastService.show(
        'success',
        `Storage cleared (${freedMB} MB freed). Cached language models removed.`
      );
      await this.updateStorage();
    } catch (err: any) {
      this.toastService.show('error', err?.message || 'Failed to clear storage.');
    } finally {
      this.isClearing = false;
      this.cdr.detectChanges();
    }
  }

  trackByCode(_idx: number, item: OcrModelMetadata): string {
    return item.code;
  }
}
