import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppProgressComponent
} from '../../shared/components/ui';
import { ConversionService } from '../../core/conversion/conversion.service';
import { IConverter } from '../../core/conversion/converter.interface';
import { ConversionProgress, ConversionResult } from '../../core/conversion/conversion.types';
import { ZipToPdfConverter, ZipFileInfo } from '../../core/conversion/converters/zip-to-pdf.converter';
import * as pdfjsLib from 'pdfjs-dist';
import { ToastService } from '../../core/services/toast.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-converter',
  templateUrl: './converter.page.html',
  styleUrls: ['./converter.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppProgressComponent
  ],
  providers: [DecimalPipe]
})
export class ConverterPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private conversionService = inject(ConversionService);
  private zipConverter = inject(ZipToPdfConverter);
  private toast = inject(ToastService);

  converterId: string = '';
  converter?: IConverter;

  // State
  selectedFile?: File;
  textInput: string = '';
  isProcessing: boolean = false;
  progress: ConversionProgress = { percent: 0, stage: '' };
  result?: ConversionResult;
  errorMessage?: string;

  // Configurable options
  options: {
    dpi: number;
    format: 'A4' | 'Letter';
    orientation: 'Portrait' | 'Landscape';
    margin: number;
    fontSize: number;
    fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier';
    aspectRatio: '16x9' | '4x3';
    singleSheet: boolean;
    convertAllSheets: boolean;
    hasHeaderRow: boolean;
    delimiter: string;
    preserveHeadings: boolean;
  } = {
    dpi: 150,
    format: 'A4',
    orientation: 'Portrait',
    margin: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    aspectRatio: '16x9',
    singleSheet: false,
    convertAllSheets: true,
    hasHeaderRow: true,
    delimiter: '',
    preserveHeadings: true
  };

  // PDF to PNG page selection
  pdfPageCount: number = 0;
  pagesArray: number[] = [];
  selectedPages: boolean[] = [];

  // ZIP to PDF inspection
  zipEntries: ZipFileInfo[] = [];
  selectedZipEntries: boolean[] = [];

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      this.converterId = params.get('converterId') || '';
      this.converter = this.conversionService.getConverter(this.converterId);
      this.resetState();

      // Configure sensible default orientation based on tool
      if (['excel-to-pdf', 'csv-to-pdf', 'ppt-to-pdf'].includes(this.converterId)) {
        this.options.orientation = 'Landscape';
      }
    });
  }

  ngOnDestroy() {
    this.conversionService.cleanupUrls();
  }

  resetState() {
    this.selectedFile = undefined;
    this.textInput = '';
    this.isProcessing = false;
    this.progress = { percent: 0, stage: '' };
    this.result = undefined;
    this.errorMessage = undefined;
    this.pdfPageCount = 0;
    this.pagesArray = [];
    this.selectedPages = [];
    this.zipEntries = [];
    this.selectedZipEntries = [];
  }

  async onFileSelected(event: any) {
    const file = event.target?.files?.[0];
    if (!file) return;

    this.selectedFile = file;
    this.result = undefined;
    this.errorMessage = undefined;

    // Validate
    if (this.converter) {
      const validation = await this.converter.validate(file);
      if (!validation.valid) {
        this.errorMessage = validation.error;
        return;
      }
    }

    // Special inspection for PDF -> PNG (read page count)
    if (this.converterId === 'pdf-to-png') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
        const pdf = await loadingTask.promise;
        this.pdfPageCount = pdf.numPages;
        this.pagesArray = Array.from({ length: this.pdfPageCount }, (_, i) => i + 1);
        this.selectedPages = new Array(this.pdfPageCount).fill(true);
      } catch (e) {
        console.warn('Could not read PDF page count:', e);
      }
    }

    // Special inspection for ZIP -> PDF
    if (this.converterId === 'zip-to-pdf') {
      try {
        this.zipEntries = await this.zipConverter.inspectZip(file);
        this.selectedZipEntries = this.zipEntries.map(e => e.supported);
      } catch (e) {
        console.warn('Could not inspect ZIP:', e);
      }
    }
  }

  toggleSelectAllPages(select: boolean) {
    this.selectedPages = new Array(this.pdfPageCount).fill(select);
  }

  toggleSelectAllZip(select: boolean) {
    this.selectedZipEntries = this.zipEntries.map(e => (e.supported ? select : false));
  }

  async startConversion() {
    if (!this.converter) return;

    // Handle text-only converters if no file was uploaded
    let fileToConvert = this.selectedFile;
    if (!fileToConvert && this.converter.metadata.supportsTextInput && this.textInput.trim()) {
      const ext = this.converter.metadata.sourceFormats[0] || '.txt';
      const mime = ext === '.html' ? 'text/html' : 'text/plain';
      const blob = new Blob([this.textInput], { type: mime });
      fileToConvert = new File([blob], `input_document${ext}`, { type: mime });
    }

    if (!fileToConvert) {
      this.errorMessage = 'Please select a file to convert.';
      return;
    }

    this.isProcessing = true;
    this.errorMessage = undefined;
    this.progress = { percent: 5, stage: 'Preparing conversion...' };

    // Build options
    const finalOptions: any = { ...this.options };

    if (this.converterId === 'pdf-to-png' && this.pagesArray.length > 0) {
      finalOptions.selectedPages = this.pagesArray.filter((_, i) => this.selectedPages[i]);
    }

    if (this.converterId === 'zip-to-pdf' && this.zipEntries.length > 0) {
      finalOptions.selectedFilePaths = this.zipEntries
        .filter((_, i) => this.selectedZipEntries[i])
        .map(e => e.path);
    }

    if (this.textInput && this.converter.metadata.supportsTextInput) {
      if (this.converterId === 'text-to-pdf') finalOptions.rawText = this.textInput;
      if (this.converterId === 'html-to-pdf') finalOptions.rawHtml = this.textInput;
    }

    try {
      const res = await this.conversionService.runConversion(
        this.converterId,
        fileToConvert,
        finalOptions,
        (p) => {
          this.progress = p;
        }
      );

      this.result = res;
      if (!res.success) {
        this.errorMessage = res.error || 'Conversion failed. Please try again.';
      }
    } catch (e: any) {
      this.errorMessage = e?.message || e.toString();
    } finally {
      this.isProcessing = false;
    }
  }

  async saveResultFile() {
    if (!this.result?.file) return;
    const uri = await this.conversionService.saveResult(this.result.file, this.converterId);
    if (uri && uri !== 'web-download') {
      this.toast.success('Saved to your Documents folder.');
    }
  }

  async shareResultFile() {
    if (!this.result?.file) return;
    await this.conversionService.shareResult(
      this.result.file,
      this.converter?.metadata.shortTitle || 'Converted File'
    );
  }

  retry() {
    this.startConversion();
  }

  clearAll() {
    this.resetState();
  }
}
