import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { PDFDocument } from 'pdf-lib';
import { PdfOptimizerService } from '../../core/services/pdf-optimizer.service';
import { PdfImageInventoryService } from '../../core/services/pdf-image-inventory.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import {
  COLOUR_PATHS,
  ColourPath,
  DPI_CEILINGS,
  DedupePlan,
  DownsampleOptions,
  DownsamplePlan,
  DpiCeiling,
  FIT_STEP_ORDER,
  FitLimitOptions,
  FitLimitResult,
  FitStepKind,
  OptimizeMode,
  OptimizeNotice,
  OptimizeOutput,
  OptimizeProgress,
  PdfImageInventory,
  ProofRender,
  ProofSummary,
  StructureOptions,
  TextLayerReport,
  defaultColourPathOptions,
  defaultDownsampleOptions,
  defaultFitLimitOptions,
  defaultStructureOptions,
  isOptimizeMode
} from '../../core/models/pdf-optimize.types';
import {
  AppButtonComponent,
  AppFooterComponent,
  AppHeaderComponent,
  AppIconComponent,
  AppPageHeaderComponent,
  AppProgressComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

export type OptimizeStep = 'select' | 'configure' | 'processing' | 'result';

@Component({
  selector: 'app-pdf-optimize',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './pdf-optimize.page.html',
  styleUrls: ['./pdf-optimize.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppIconComponent,
    AppProgressComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfOptimizePage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private optimizerService = inject(PdfOptimizerService);
  private inventoryService = inject(PdfImageInventoryService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private toastService = inject(ToastService);
  private bridgeService = inject(DocumentBridgeService);
  private cdr = inject(ChangeDetectorRef);

  currentStep: OptimizeStep = 'select';
  activeMode: OptimizeMode = 'images';

  // Loaded Document State
  selectedFile?: File;
  pdfBuffer?: ArrayBuffer;
  pageCount = 0;
  fileSizeBytes = 0;
  inventory?: PdfImageInventory;
  isAnalyzing = false;
  analysisError?: string;

  // F1: DPI Ceiling Options
  readonly dpiCeilings: DpiCeiling[] = DPI_CEILINGS;
  downsampleCeiling: DpiCeiling = 150;
  downsampleQuality = 0.82;
  downsampleMinGain = 0.1;
  downsamplePlan?: DownsamplePlan;

  // F2: Scan Tone Options
  readonly colourPaths: ColourPath[] = COLOUR_PATHS;
  colourPath: ColourPath = 'colour';
  monoBias = 0;
  colourDpi = 150;
  colourQuality = 0.8;
  textLayerReport?: TextLayerReport;
  confirmedScan = false;

  // F3: Identical-Image Dedupe Options
  dedupePlan?: DedupePlan;
  isCalculatingDedupe = false;

  // F4: Proof View State
  proofSummary?: ProofSummary;
  proofCurrentPage = 1;
  proofRender?: ProofRender;
  isRenderingProof = false;
  proofViewMode: 'split' | 'before' | 'after' = 'split';

  // F5: Fit Upload Limit Options
  readonly fitStepKinds: FitStepKind[] = FIT_STEP_ORDER;
  targetKB = 500;
  targetPresets = [100, 200, 500, 1024, 2048];
  allowedSteps: Record<FitStepKind, boolean> = {
    'strip-metadata': true,
    'structure': true,
    'dedupe': true,
    'downsample': true,
    'grayscale': false,
    'mono': false
  };
  fitDownsampleCeiling: DpiCeiling = 150;
  readonly availableFitCeilings: readonly DpiCeiling[] = [72, 96, 150, 200];
  fitResult?: FitLimitResult;

  setFitCeiling(c: DpiCeiling): void {
    this.fitDownsampleCeiling = c;
    this.cdr.markForCheck();
  }

  // F6: Structure Optimizer Options
  structureDropOrphans = true;
  structureUseObjectStreams = true;
  structureStripMetadata = false;
  structureVerify = true;

  // Processing State
  isProcessing = false;
  progressPercent = 0;
  progressPhase = '';
  progressLabel = '';
  abortController?: AbortController;

  // Result State
  outputResult?: OptimizeOutput;
  outputBuffer?: ArrayBuffer;
  outputFile?: File;
  isSaving = false;

  ngOnInit(): void {
    // Check route params / data
    this.route.paramMap.subscribe(params => {
      const modeParam = params.get('mode');
      if (modeParam && isOptimizeMode(modeParam)) {
        this.activeMode = modeParam;
        this.cdr.markForCheck();
      }
    });

    // Check document bridge for passed file
    const bridged = this.bridgeService.consumeDocument();
    if (bridged && bridged.file) {
      this.onFileSelected(bridged.file);
    }
  }

  setMode(mode: OptimizeMode): void {
    this.activeMode = mode;
    this.cdr.markForCheck();
    if (this.currentStep === 'configure' && this.pdfBuffer) {
      this.onModeSwitched(mode);
    }
  }

  async onFileSelected(file: File): Promise<void> {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      this.toastService.warning('Please select a valid PDF file.');
      return;
    }

    this.selectedFile = file;
    this.fileSizeBytes = file.size;
    this.isAnalyzing = true;
    this.analysisError = undefined;
    this.cdr.markForCheck();

    try {
      this.pdfBuffer = await file.arrayBuffer();
      const doc = await PDFDocument.load(this.pdfBuffer.slice(0), { ignoreEncryption: true });
      this.pageCount = doc.getPageCount();

      // Run inventory scan
      this.inventory = await this.inventoryService.inventory(doc);

      // Probe text layer for F2 warning check
      this.textLayerReport = await this.optimizerService.probeTextLayer(this.pdfBuffer);

      // Initialize plans
      this.recalculateDownsamplePlan();
      this.recalculateDedupePlan(doc);

      this.currentStep = 'configure';
    } catch (err: any) {
      this.analysisError = err?.message || 'Failed to open or inspect PDF.';
      this.toastService.error('Could not inspect PDF: ' + this.analysisError);
    } finally {
      this.isAnalyzing = false;
      this.cdr.markForCheck();
    }
  }

  private onModeSwitched(mode: OptimizeMode): void {
    if (mode === 'images') {
      this.recalculateDownsamplePlan();
    } else if (mode === 'duplicates' && this.pdfBuffer && !this.dedupePlan) {
      PDFDocument.load(this.pdfBuffer.slice(0), { ignoreEncryption: true }).then(doc => {
        this.recalculateDedupePlan(doc);
      });
    } else if (mode === 'proof' && this.pdfBuffer) {
      this.loadProofPage(this.proofCurrentPage);
    }
  }

  recalculateDownsamplePlan(): void {
    if (!this.inventory) return;
    const opts: DownsampleOptions = {
      ceiling: this.downsampleCeiling,
      quality: this.downsampleQuality,
      minGain: this.downsampleMinGain
    };
    this.downsamplePlan = this.optimizerService.planDownsample(this.inventory, opts);
    this.cdr.markForCheck();
  }

  private recalculateDedupePlan(doc: PDFDocument): void {
    try {
      this.dedupePlan = this.optimizerService.planDedupe(doc);
    } catch {
      this.dedupePlan = undefined;
    }
    this.cdr.markForCheck();
  }

  setTargetPreset(kb: number): void {
    this.targetKB = kb;
    this.cdr.markForCheck();
  }

  async runCurrentOptimization(): Promise<void> {
    if (!this.pdfBuffer || !this.selectedFile) return;

    this.isProcessing = true;
    this.progressPercent = 0;
    this.progressPhase = 'Preparing...';
    this.progressLabel = '';
    this.abortController = new AbortController();
    this.currentStep = 'processing';
    this.cdr.markForCheck();

    const outputName = this.buildOutputName(this.selectedFile.name);

    try {
      const callbacks = {
        onProgress: (p: OptimizeProgress) => {
          this.progressPercent = p.percent;
          this.progressPhase = p.phase;
          this.progressLabel = p.label || '';
          this.cdr.markForCheck();
        },
        signal: this.abortController.signal
      };

      let result: OptimizeOutput;

      switch (this.activeMode) {
        case 'images': {
          const opts: DownsampleOptions = {
            ceiling: this.downsampleCeiling,
            quality: this.downsampleQuality,
            minGain: this.downsampleMinGain
          };
          result = await this.optimizerService.exportDownsampled(
            this.pdfBuffer,
            opts,
            outputName,
            callbacks
          );
          break;
        }

        case 'colour': {
          if (this.textLayerReport?.hasTextLayer && !this.confirmedScan) {
            this.toastService.warning('Please confirm scan mode before rasterizing pages with digital text.');
            this.currentStep = 'configure';
            this.isProcessing = false;
            this.cdr.markForCheck();
            return;
          }
          result = await this.optimizerService.exportColourPath(
            this.pdfBuffer,
            {
              path: this.colourPath,
              monoBias: this.monoBias,
              dpi: this.colourDpi,
              quality: this.colourQuality,
              confirmedScan: this.confirmedScan
            },
            outputName,
            callbacks
          );
          break;
        }

        case 'duplicates': {
          result = await this.optimizerService.exportDeduped(
            this.pdfBuffer,
            outputName,
            { verify: true, onProgress: callbacks.onProgress, signal: callbacks.signal }
          );
          break;
        }

        case 'proof':
        case 'structure': {
          const structOpts: StructureOptions = {
            dropOrphans: this.structureDropOrphans,
            useObjectStreams: this.structureUseObjectStreams,
            stripMetadata: this.structureStripMetadata,
            verify: this.structureVerify
          };
          result = await this.optimizerService.exportStructureOptimized(
            this.pdfBuffer,
            structOpts,
            outputName,
            callbacks
          );
          break;
        }

        case 'fit': {
          const allowed: FitStepKind[] = (
            Object.keys(this.allowedSteps) as FitStepKind[]
          ).filter(k => this.allowedSteps[k]);

          const fitOpts: FitLimitOptions = {
            targetKB: this.targetKB,
            allowedSteps: allowed,
            downsampleCeiling: this.fitDownsampleCeiling,
            confirmedScan: this.confirmedScan
          };

          const fitRes = await this.optimizerService.fitUploadLimit(
            this.pdfBuffer,
            fitOpts,
            outputName,
            callbacks
          );
          this.fitResult = fitRes;
          result = fitRes;
          break;
        }
      }

      this.outputResult = result;
      this.outputFile = result.file;
      this.outputBuffer = await result.blob.arrayBuffer();

      // Build proof summary
      this.proofSummary = this.optimizerService.buildProofSummary(
        result.originalSizeBytes,
        result.sizeBytes,
        [],
        result.rasterized
      );

      this.currentStep = 'result';
      this.toastService.success('Optimization completed successfully!');
    } catch (err: any) {
      if (/cancelled/i.test(err?.message)) {
        this.toastService.warning('Optimization cancelled.');
      } else {
        this.toastService.error(
          'Optimization failed: ' + (err?.message || 'Unknown error')
        );
      }
      this.currentStep = 'configure';
    } finally {
      this.isProcessing = false;
      this.cdr.markForCheck();
    }
  }

  cancelProcessing(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async loadProofPage(page: number): Promise<void> {
    if (!this.pdfBuffer) return;
    this.proofCurrentPage = Math.max(1, Math.min(this.pageCount, page));
    this.isRenderingProof = true;
    this.cdr.markForCheck();

    try {
      const after = this.outputBuffer || this.pdfBuffer;
      this.proofRender = await this.optimizerService.renderProofPage(
        this.pdfBuffer,
        after,
        this.proofCurrentPage,
        120
      );
    } catch {
      this.proofRender = {
        pageNumber: this.proofCurrentPage,
        unavailableReason: 'Could not render proof view for this page.'
      };
    } finally {
      this.isRenderingProof = false;
      this.cdr.markForCheck();
    }
  }

  setProofPage(page: number): void {
    this.loadProofPage(page);
  }

  setProofViewMode(mode: 'split' | 'before' | 'after'): void {
    this.proofViewMode = mode;
    this.cdr.markForCheck();
  }

  async saveOutput(): Promise<void> {
    if (!this.outputFile) return;
    this.isSaving = true;
    this.cdr.markForCheck();

    try {
      await this.storageService.saveFile(this.outputFile, 'pdf');
      await this.historyService.addHistoryItem({
        operation: 'pdf',
        originalFileName: this.selectedFile?.name || this.outputFile.name,
        outputFileName: this.outputFile.name,
        originalSizeBytes: this.fileSizeBytes,
        outputSizeBytes: this.outputFile.size
      });
      this.toastService.success('File saved successfully!');
    } catch (err: any) {
      this.toastService.error('Failed to save file: ' + (err?.message || ''));
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  async shareOutput(): Promise<void> {
    if (!this.outputFile) return;
    try {
      await this.shareService.shareFile(this.outputFile);
    } catch {
      this.toastService.warning('Sharing not supported or cancelled.');
    }
  }

  viewProofFromResults(): void {
    this.activeMode = 'proof';
    this.currentStep = 'configure';
    this.loadProofPage(1);
    this.cdr.markForCheck();
  }

  handOffToSplit(): void {
    if (this.outputFile) {
      this.bridgeService.setDocument(this.outputFile);
    } else if (this.selectedFile) {
      this.bridgeService.setDocument(this.selectedFile);
    }
    this.router.navigate(['/features/pdf/split']);
  }

  resetAll(): void {
    this.selectedFile = undefined;
    this.pdfBuffer = undefined;
    this.inventory = undefined;
    this.downsamplePlan = undefined;
    this.dedupePlan = undefined;
    this.proofSummary = undefined;
    this.outputResult = undefined;
    this.outputFile = undefined;
    this.outputBuffer = undefined;
    this.fitResult = undefined;
    this.currentStep = 'select';
    this.cdr.markForCheck();
  }

  private buildOutputName(originalName: string): string {
    const base = originalName.replace(/\.pdf$/i, '');
    switch (this.activeMode) {
      case 'images':
        return `${base}_resampled.pdf`;
      case 'colour':
        return `${base}_${this.colourPath}.pdf`;
      case 'duplicates':
        return `${base}_deduped.pdf`;
      case 'fit':
        return `${base}_fitted.pdf`;
      case 'structure':
      default:
        return `${base}_optimized.pdf`;
    }
  }
}
