import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileService } from '../../../core/services/file.service';
import { StorageService } from '../../../core/services/storage.service';
import { ShareService } from '../../../core/services/share.service';
import { ToastService } from '../../../core/services/toast.service';
import { HistoryService } from '../../../core/services/history.service';
import { ImageMetadataService } from '../../../core/services/image-metadata.service';
import { DateShiftOffset, ExifMetadata, MetadataDateRepairResult } from '../../../core/models/image-metadata.types';
import { SingleFileWorkflowState } from '../../../core/models/file-workflow-state.model';
import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  FileDropzoneComponent,
  AppIconComponent,
  TranslatePipe
} from '../../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-photo-metadata',
  templateUrl: './photo-metadata.page.html',
  styleUrls: ['./photo-metadata.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    FileDropzoneComponent,
    AppIconComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PhotoMetadataPage {
  private fileService = inject(FileService);
  private metadataService = inject(ImageMetadataService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private toast = inject(ToastService);
  private historyService = inject(HistoryService);
  private cdr = inject(ChangeDetectorRef);

  workflowState: SingleFileWorkflowState = 'EMPTY';
  files: File[] = [];
  metadataList: ExifMetadata[] = [];
  selectedIndex = 0;

  isProcessing = false;
  dateShiftOffset: DateShiftOffset = {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  };

  repairResults: MetadataDateRepairResult[] = [];
  cleanFileUrl?: string;
  cleanedBlob?: Blob;

  get currentMeta(): ExifMetadata | undefined {
    return this.metadataList[this.selectedIndex];
  }

  get currentFile(): File | undefined {
    return this.files[this.selectedIndex];
  }

  async handleFileSelected(event: File | File[]) {
    const incoming = Array.isArray(event) ? event : [event];
    if (incoming.length === 0) return;

    this.files = incoming;
    this.selectedIndex = 0;
    this.workflowState = 'CONFIGURING';
    this.metadataList = [];
    this.repairResults = [];
    this.cleanFileUrl = undefined;
    this.cleanedBlob = undefined;

    await this.loadAllMetadata();
  }

  async pickMoreFiles() {
    const picked = await this.fileService.pickMultipleImages();
    if (picked && picked.length > 0) {
      await this.handleFileSelected(picked);
    }
  }

  private async loadAllMetadata() {
    this.isProcessing = true;
    this.metadataList = [];

    for (const f of this.files) {
      const meta = await this.metadataService.extractMetadata(f);
      this.metadataList.push(meta);
    }

    this.isProcessing = false;
    this.cdr.markForCheck();
  }

  selectFileIndex(index: number) {
    if (index >= 0 && index < this.files.length) {
      this.selectedIndex = index;
    }
  }

  async applyDateShift() {
    if (this.files.length === 0) return;

    this.isProcessing = true;
    try {
      this.repairResults = await this.metadataService.batchShiftDates(this.files, this.dateShiftOffset);
      this.toast.success(`Date shift applied to ${this.repairResults.filter(r => r.success).length} images.`);
    } catch (err: any) {
      this.toast.error(err?.message || 'Date shift failed');
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  async stripMetadataCurrent() {
    const file = this.currentFile;
    if (!file) return;

    this.isProcessing = true;
    try {
      this.cleanedBlob = await this.metadataService.stripMetadata(file);
      this.cleanFileUrl = URL.createObjectURL(this.cleanedBlob);
      this.toast.success('EXIF and GPS metadata permanently stripped.');
    } catch (err: any) {
      this.toast.error(err?.message || 'Failed to strip metadata');
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  async saveCleanedFile() {
    if (!this.cleanedBlob || !this.currentFile) return;

    const cleanFile = new File([this.cleanedBlob], `clean_${this.currentFile.name}`, {
      type: this.cleanedBlob.type
    });

    const uri = await this.storageService.saveFile(cleanFile, 'photo_metadata');
    if (uri) {
      await this.historyService.addHistoryItem({
        operation: 'photo_metadata',
        originalFileName: this.currentFile.name,
        outputFileName: cleanFile.name,
        originalSizeBytes: this.currentFile.size,
        outputSizeBytes: cleanFile.size,
        outputPath: uri
      });
      this.toast.success('Cleaned photo saved to Documents.');
    }
  }

  async shareCleanedFile() {
    if (!this.cleanedBlob || !this.currentFile) return;

    const cleanFile = new File([this.cleanedBlob], `clean_${this.currentFile.name}`, {
      type: this.cleanedBlob.type
    });

    await this.shareService.shareFile(cleanFile, 'Cleaned Image (No EXIF)');
  }

  reset() {
    if (this.cleanFileUrl) {
      URL.revokeObjectURL(this.cleanFileUrl);
    }
    this.files = [];
    this.metadataList = [];
    this.repairResults = [];
    this.cleanedBlob = undefined;
    this.cleanFileUrl = undefined;
    this.workflowState = 'EMPTY';
    this.selectedIndex = 0;
  }
}
