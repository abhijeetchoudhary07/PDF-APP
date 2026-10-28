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
  AppProgressComponent,
  AppConversionAnimationComponent,
  AppRelatedToolsComponent,
  AutoScrollDirective
} from '../../shared/components/ui';
import { ConversionService } from '../../core/conversion/conversion.service';
import { IConverter } from '../../core/conversion/converter.interface';
import { ConversionProgress, ConversionResult } from '../../core/conversion/conversion.types';
import { ZipToPdfConverter, ZipFileInfo } from '../../core/conversion/converters/zip-to-pdf.converter';
import * as pdfjsLib from 'pdfjs-dist';
import { ToastService } from '../../core/services/toast.service';
import { OCR_SUPPORTED_LANGUAGES, OcrSupportedLanguage } from '../../core/models/ocr.models';

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
    AppConversionAnimationComponent,
    AppRelatedToolsComponent,
    AutoScrollDirective
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
    format: 'A4' | 'Letter' | 'Original';
    orientation: 'Portrait' | 'Landscape' | 'Auto';
    margin: number;
    fontSize: number;
    fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier';
    aspectRatio: '16x9' | '4x3';
    singleSheet: boolean;
    convertAllSheets: boolean;
    hasHeaderRow: boolean;
    delimiter: string;
    preserveHeadings: boolean;
    imageMode: 'inline' | 'sidecar' | 'none';
    htmlMode: 'reflowable' | 'layout-preserving';
    indentGuides: boolean;
    syntaxHighlight: boolean;
    includeAttachments: boolean;
    embedSourceImage?: boolean;
    compression?: 'none' | 'lzw' | 'g4';
    compact?: boolean;
    ocrLanguage: OcrSupportedLanguage;
    autoDetectColumns: boolean;
    jsonMode: 'layout-preserving' | 'reflowable';
    includeTables: boolean;
    includeAnnotations: boolean;
    includeMetadata: boolean;
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
    preserveHeadings: true,
    imageMode: 'inline',
    htmlMode: 'reflowable',
    indentGuides: true,
    syntaxHighlight: true,
    includeAttachments: true,
    embedSourceImage: false,
    compression: 'none',
    compact: false,
    ocrLanguage: 'eng',
    autoDetectColumns: true,
    jsonMode: 'reflowable',
    includeTables: true,
    includeAnnotations: true,
    includeMetadata: true
  };

  readonly ocrLanguages = OCR_SUPPORTED_LANGUAGES;

  showFidelityReport: boolean = false;

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

      /*
       * TIFF and SVG sources carry their own dimensions, and the point of
       * converting a 300 DPI scan or a drawing is usually to keep them. A4
       * remains one tap away.
       */
      if (['tiff-to-pdf', 'svg-to-pdf'].includes(this.converterId)) {
        this.options.format = 'Original';
        this.options.orientation = 'Auto';
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

    // Page count, for the converters that let you pick pages
    if (this.converterId === 'pdf-to-png' || this.converterId === 'pdf-to-svg') {
      let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
      try {
        const arrayBuffer = await file.arrayBuffer();
        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) } as any);
        const pdf = await loadingTask.promise;
        this.pdfPageCount = pdf.numPages;
        this.pagesArray = Array.from({ length: this.pdfPageCount }, (_, i) => i + 1);
        this.selectedPages = new Array(this.pdfPageCount).fill(true);
      } catch (e) {
        console.warn('Could not read PDF page count:', e);
      } finally {
        // Only the page count was wanted; destroy() is on the loading task,
        // and skipping it leaves the worker holding the whole document.
        try {
          await loadingTask?.destroy();
        } catch {
          /* never opened */
        }
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
    this.progress = { percent: 18, stage: 'Reading file...' };
    await new Promise(resolve => setTimeout(resolve, 300));

    // Build options
    const finalOptions: any = { ...this.options };

    if (['pdf-to-png', 'pdf-to-svg'].includes(this.converterId) && this.pagesArray.length > 0) {
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
      if (['markdown-to-pdf', 'json-to-pdf', 'xml-to-pdf', 'yaml-to-pdf'].includes(this.converterId)) {
        finalOptions.rawText = this.textInput;
      }
    }

    if (this.converterId === 'pdf-to-markdown') {
      finalOptions.imageMode = this.options.imageMode;
    }

    if (this.converterId === 'pdf-to-html') {
      finalOptions.mode = this.options.htmlMode;
    }

    if (['json-to-pdf', 'xml-to-pdf', 'yaml-to-pdf'].includes(this.converterId)) {
      finalOptions.indentGuides = this.options.indentGuides;
      finalOptions.syntaxHighlight = this.options.syntaxHighlight;
    }

    if (['eml-to-pdf', 'msg-to-pdf'].includes(this.converterId)) {
      finalOptions.includeAttachments = this.options.includeAttachments;
    }

    if (['images-to-word', 'images-to-excel'].includes(this.converterId)) {
      finalOptions.ocrLanguage = this.options.ocrLanguage;
    }

    if (this.converterId === 'pdf-to-json') {
      // `mode` is the shared fidelity name; the page keeps its own field so it
      // cannot collide with the HTML converter's mode select.
      finalOptions.mode = this.options.jsonMode;
    }

    if (this.converterId === 'pdf-to-tiff') {
      finalOptions.dpi = Number(this.options.dpi) || 150;
    }

    this.progress = { percent: 56, stage: 'Converting format...' };
    await new Promise(resolve => setTimeout(resolve, 320));

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
      } else {
        this.progress = { percent: 94, stage: 'Finalizing document...' };
        await new Promise(resolve => setTimeout(resolve, 350));
        this.progress = { percent: 100, stage: 'Conversion Completed!' };
        // Smooth transition: allow success celebration animation to complete before presenting download actions
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    } catch (e: any) {
      this.errorMessage = e?.message || e.toString();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * What the Save button offers, taken from the file that was actually
   * produced rather than the converter's nominal target: PDF to Markdown in
   * sidecar mode hands back a .zip holding the .md and its images, and a
   * button reading "Save MD" would be describing a file that is not there.
   */
  get resultExtension(): string {
    const name = this.result?.file?.name || '';
    const dotIdx = name.lastIndexOf('.');
    if (dotIdx > -1 && dotIdx < name.length - 1) {
      return name.slice(dotIdx + 1);
    }
    return this.converter?.metadata.targetFormat || 'file';
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
