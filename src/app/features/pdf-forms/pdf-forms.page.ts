import { Component, OnDestroy, ElementRef, ViewChild, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, ToastController } from '@ionic/angular';
import { FileService } from '../../core/services/file.service';
import { PdfFormService } from '../../core/services/pdf-form.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import {
  PdfFormField,
  PdfFormDocument,
  PdfFormFieldType
} from '../../core/models/pdf-forms.types';
import * as pdfjsLib from 'pdfjs-dist';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppTabsComponent,
  AppIconComponent
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-forms',
  templateUrl: './pdf-forms.page.html',
  styleUrls: ['./pdf-forms.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppTabsComponent
  ],
  providers: [DecimalPipe]
})
export class PdfFormsPage implements OnDestroy {
  private fileService = inject(FileService);
  private pdfFormService = inject(PdfFormService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  @ViewChild('previewCanvas') previewCanvas?: ElementRef<HTMLCanvasElement>;

  document?: PdfFormDocument;
  manualFields: PdfFormField[] = [];
  mode: 'native' | 'manual' = 'native';

  get formTabs() {
    return [
      { id: 'native', label: `AcroForm Fields (${this.document?.fields.length || 0})` },
      { id: 'manual', label: `Manual Fields (${this.manualFields.length})` }
    ];
  }

  currentFieldIndex = 0;
  searchQuery = '';
  flattenOnExport = true;
  isProcessing = false;
  showPreview = false;

  // Preview & Page state
  currentPage = 1;
  totalPages = 1;
  previewUrl?: string;

  // Manual placement tools
  selectedManualType: PdfFormFieldType = 'text';

  ngOnDestroy(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
  }

  get filteredFields(): PdfFormField[] {
    if (!this.document) return [];
    const fields = this.mode === 'native' ? this.document.fields : this.manualFields;
    if (!this.searchQuery.trim()) return fields;
    const q = this.searchQuery.toLowerCase();
    return fields.filter(f => f.name.toLowerCase().includes(q) || (f.label && f.label.toLowerCase().includes(q)));
  }

  get currentField(): PdfFormField | undefined {
    const list = this.filteredFields;
    if (list.length === 0) return undefined;
    return list[this.currentFieldIndex];
  }

  async selectPdf(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (!file) return;

    this.isProcessing = true;
    try {
      const buffer = await file.arrayBuffer();
      this.document = await this.pdfFormService.inspectPdfForForms(buffer, file.name);
      this.totalPages = this.document.pageCount;
      this.currentPage = 1;
      this.manualFields = [];

      if (!this.document.hasNativeForms) {
        this.mode = 'manual';
        const toast = await this.toastCtrl.create({
          message: 'No interactive form fields found. Switched to Manual Field Placement mode.',
          duration: 3000,
          color: 'warning'
        });
        await toast.present();
      } else {
        this.mode = 'native';
      }

      this.currentFieldIndex = 0;
      await this.renderPagePreview();
    } catch (e: any) {
      const alert = await this.alertCtrl.create({
        header: 'Error Opening Form',
        message: e.message || String(e),
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isProcessing = false;
    }
  }

  nextField(): void {
    if (this.currentFieldIndex < this.filteredFields.length - 1) {
      this.currentFieldIndex++;
    }
  }

  prevField(): void {
    if (this.currentFieldIndex > 0) {
      this.currentFieldIndex--;
    }
  }

  async clearAllValues(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Clear All Fields?',
      message: 'This will reset all entered values in this form.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear All',
          role: 'destructive',
          handler: () => {
            if (this.document) {
              for (const f of this.document.fields) {
                if (f.type === 'checkbox') f.value = false;
                else f.value = '';
              }
            }
            for (const f of this.manualFields) {
              if (f.type === 'checkbox') f.value = false;
              else f.value = '';
            }
          }
        }
      ]
    });
    await alert.present();
  }

  addManualField(type: PdfFormFieldType): void {
    const id = `manual_${Date.now()}`;
    const newField: PdfFormField = {
      id,
      name: `${type}_${this.manualFields.length + 1}`,
      label: `Manual ${type.charAt(0).toUpperCase() + type.slice(1)} ${this.manualFields.length + 1}`,
      type,
      value: type === 'checkbox' ? false : '',
      isNative: false,
      coordinates: {
        pageNumber: this.currentPage,
        x: 60,
        y: 100 + this.manualFields.length * 40,
        width: type === 'checkbox' ? 24 : 180,
        height: type === 'checkbox' ? 24 : 28
      }
    };

    this.manualFields.push(newField);
    this.currentFieldIndex = this.manualFields.length - 1;
  }

  removeManualField(id: string): void {
    this.manualFields = this.manualFields.filter(f => f.id !== id);
    if (this.currentFieldIndex >= this.manualFields.length) {
      this.currentFieldIndex = Math.max(0, this.manualFields.length - 1);
    }
  }

  async saveProgress(): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: 'Form progress saved in memory.',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
  }

  async exportPdf(): Promise<void> {
    if (!this.document) return;

    this.isProcessing = true;
    try {
      const result = await this.pdfFormService.exportCompletedForm(
        this.document,
        this.manualFields,
        {
          flatten: this.flattenOnExport,
          outputFileName: `${this.document.name.replace(/\.pdf$/i, '')}_completed.pdf`
        }
      );

      const uri = await this.storageService.saveFile(result.file, 'pdf');
      await this.historyService.addHistoryItem({
        operation: 'pdf_form',
        originalFileName: this.document.name,
        outputFileName: result.file.name,
        originalSizeBytes: this.document.sizeBytes,
        outputSizeBytes: result.sizeBytes,
        outputPath: uri
      });

      const alert = await this.alertCtrl.create({
        header: 'Form Exported Successfully',
        message: `Saved as "${result.file.name}" (${(result.sizeBytes / 1024).toFixed(1)} KB). Fields were ${this.flattenOnExport ? 'flattened to static content' : 'preserved as interactive'}.`,
        buttons: [
          {
            text: 'Share',
            handler: () => {
              if (uri && uri !== 'web-download') {
                this.shareService.shareFile(uri, 'Completed PDF Form');
              }
            }
          },
          { text: 'Done', role: 'cancel' }
        ]
      });
      await alert.present();
    } catch (e: any) {
      const alert = await this.alertCtrl.create({
        header: 'Export Failed',
        message: e.message || String(e),
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isProcessing = false;
    }
  }

  async renderPagePreview(): Promise<void> {
    if (!this.document) return;

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(this.document.arrayBuffer.slice(0))
      } as any);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(this.currentPage);

      const viewport = page.getViewport({ scale: 1.0 });
      if (this.previewCanvas?.nativeElement) {
        const canvas = this.previewCanvas.nativeElement;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport } as any).promise;
        }
      }
    } catch {
      // preview error
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.renderPagePreview();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.renderPagePreview();
    }
  }
}
