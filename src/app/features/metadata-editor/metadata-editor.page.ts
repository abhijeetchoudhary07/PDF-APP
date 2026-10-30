import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController, AlertController } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { PdfMetadataEditorService } from '../../core/services/pdf-metadata-editor.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { FileService } from '../../core/services/file.service';
import {
  PdfMetadata,
  PdfMetadataComparisonItem,
  PdfMetadataInspectionResult
} from '../../core/models/pdf-metadata.types';

import {
  AppHeaderComponent,
  AppIconComponent,
  AppBadgeComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-metadata-editor',
  templateUrl: './metadata-editor.page.html',
  styleUrls: ['./metadata-editor.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppIconComponent,
    AppBadgeComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class MetadataEditorPage implements OnInit {
  private metadataService = inject(PdfMetadataEditorService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private fileService = inject(FileService);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // File & Inspection State
  currentFile: File | null = null;
  currentPdfBytes: Uint8Array | null = null;
  fileName: string = '';
  fileSize: number = 0;
  totalPages: number = 0;
  isLoading = false;

  // Metadata Form State
  originalMetadata: PdfMetadata = {};
  formData: {
    title: string;
    author: string;
    subject: string;
    keywords: string[];
    creator: string;
    producer: string;
    creationDate: string; // ISO string for input[type="datetime-local"] or formatted
    modificationDate: string;
  } = {
    title: '',
    author: '',
    subject: '',
    keywords: [],
    creator: '',
    producer: '',
    creationDate: '',
    modificationDate: ''
  };

  newKeywordInput: string = '';
  hasXmpStream: boolean = false;

  // Comparison Drawer State
  isComparisonDrawerOpen = false;
  comparisonItems: PdfMetadataComparisonItem[] = [];

  // Saving State
  isSaving = false;
  savedFileUrl: string | null = null;

  ngOnInit() {
    if (typeof history !== 'undefined' && history.state?.file instanceof File) {
      this.handleFileSelected(history.state.file);
    }
  }

  async handleFileSelected(file: File) {
    this.currentFile = file;
    this.fileName = file.name;
    this.fileSize = file.size;
    this.savedFileUrl = null;
    this.isLoading = true;
    this.cdr.markForCheck();

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer.slice(0));

      const inspection = await this.metadataService.readMetadata(bytes);
      this.currentPdfBytes = bytes;
      this.originalMetadata = { ...inspection.metadata };
      this.hasXmpStream = inspection.hasXmpStream;
      this.totalPages = inspection.pageCount;

      this.populateFormFromMetadata(inspection.metadata);
    } catch {
      this.showToast('Failed to inspect PDF metadata', 'danger');
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  populateFormFromMetadata(meta: PdfMetadata) {
    this.formData = {
      title: meta.title || '',
      author: meta.author || '',
      subject: meta.subject || '',
      keywords: meta.keywords ? [...meta.keywords] : [],
      creator: meta.creator || '',
      producer: meta.producer || '',
      creationDate: meta.creationDate ? this.toLocalInputString(meta.creationDate) : '',
      modificationDate: meta.modificationDate ? this.toLocalInputString(meta.modificationDate) : ''
    };
  }

  // Tag / Keyword Management
  addKeyword() {
    const raw = this.newKeywordInput.trim();
    if (!raw) return;

    const parts = this.metadataService.parseKeywordsString(raw);
    for (const part of parts) {
      if (!this.formData.keywords.includes(part)) {
        this.formData.keywords.push(part);
      }
    }
    this.newKeywordInput = '';
    this.hapticTick();
    this.cdr.markForCheck();
  }

  removeKeyword(index: number) {
    if (index >= 0 && index < this.formData.keywords.length) {
      this.formData.keywords.splice(index, 1);
      this.hapticTick();
      this.cdr.markForCheck();
    }
  }

  onKeywordKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addKeyword();
    }
  }

  // Quick Action Buttons
  copyFromOriginal() {
    this.populateFormFromMetadata(this.originalMetadata);
    this.hapticTick();
    this.showToast('Restored metadata from original document', 'success');
    this.cdr.markForCheck();
  }

  clearAllFields() {
    this.formData = {
      title: '',
      author: '',
      subject: '',
      keywords: [],
      creator: '',
      producer: '',
      creationDate: '',
      modificationDate: ''
    };
    this.hapticTick();
    this.showToast('Cleared all metadata fields', 'warning');
    this.cdr.markForCheck();
  }

  setCurrentCreationDate() {
    this.formData.creationDate = this.toLocalInputString(new Date());
    this.hapticTick();
    this.cdr.markForCheck();
  }

  setCurrentModificationDate() {
    this.formData.modificationDate = this.toLocalInputString(new Date());
    this.hapticTick();
    this.cdr.markForCheck();
  }

  // Comparison Drawer
  openComparisonDrawer() {
    const updatedMeta = this.buildMetadataFromForm();
    this.comparisonItems = this.metadataService.compareMetadata(this.originalMetadata, updatedMeta);
    this.isComparisonDrawerOpen = true;
    this.hapticTick();
    this.cdr.markForCheck();
  }

  closeComparisonDrawer() {
    this.isComparisonDrawerOpen = false;
    this.cdr.markForCheck();
  }

  get modifiedCount(): number {
    const updatedMeta = this.buildMetadataFromForm();
    const items = this.metadataService.compareMetadata(this.originalMetadata, updatedMeta);
    return items.filter(i => i.isModified).length;
  }

  // Save Document
  async saveUpdatedDocument() {
    if (!this.currentPdfBytes) return;

    this.isSaving = true;
    this.cdr.markForCheck();

    try {
      const updatedMeta = this.buildMetadataFromForm();
      const result = await this.metadataService.applyMetadata(
        this.currentPdfBytes,
        updatedMeta,
        { updateModificationDate: true }
      );

      const uri = await this.storageService.saveFile(result.updatedFile, 'pdf_metadata_editor');
      this.savedFileUrl = uri || null;
      this.currentPdfBytes = result.pdfBytes;
      this.originalMetadata = { ...result.inspection.metadata };
      this.hasXmpStream = result.inspection.hasXmpStream;

      await this.hapticNotification(NotificationType.Success);
      this.showToast('PDF saved with updated metadata!', 'success');
    } catch {
      await this.hapticNotification(NotificationType.Error);
      this.showToast('Failed to save updated PDF document', 'danger');
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  async shareSavedFile() {
    if (!this.savedFileUrl) return;
    try {
      await this.shareService.shareFile(this.savedFileUrl, this.fileName);
    } catch {
      this.showToast('Failed to share file', 'danger');
    }
  }

  resetWorkflow() {
    this.currentFile = null;
    this.currentPdfBytes = null;
    this.fileName = '';
    this.originalMetadata = {};
    this.formData = {
      title: '',
      author: '',
      subject: '',
      keywords: [],
      creator: '',
      producer: '',
      creationDate: '',
      modificationDate: ''
    };
    this.isComparisonDrawerOpen = false;
    this.savedFileUrl = null;
    this.cdr.markForCheck();
  }

  private buildMetadataFromForm(): PdfMetadata {
    return {
      title: this.formData.title.trim(),
      author: this.formData.author.trim(),
      subject: this.formData.subject.trim(),
      keywords: [...this.formData.keywords],
      creator: this.formData.creator.trim(),
      producer: this.formData.producer.trim(),
      creationDate: this.formData.creationDate ? new Date(this.formData.creationDate) : undefined,
      modificationDate: this.formData.modificationDate ? new Date(this.formData.modificationDate) : undefined
    };
  }

  private toLocalInputString(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${y}-${m}-${d}T${h}:${min}`;
  }

  private async hapticTick() {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }

  private async hapticNotification(type: NotificationType) {
    try {
      await Haptics.notification({ type });
    } catch {}
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    try {
      const toast = await this.toastCtrl.create({
        message,
        duration: 2500,
        position: 'bottom',
        color
      });
      await toast.present();
    } catch {}
  }
}
