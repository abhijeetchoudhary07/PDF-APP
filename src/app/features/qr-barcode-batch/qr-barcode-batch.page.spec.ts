import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../../test-setup';
import { QrBarcodeBatchPage } from './qr-barcode-batch.page';
import { BarcodeBatchService } from '../../core/services/barcode-batch.service';
import { TranslationService } from '../../core/services/translation.service';
import { StorageService } from '../../core/services/storage.service';

describe('QrBarcodeBatchPage — Mobile Play Store UI / UX', () => {
  let component: QrBarcodeBatchPage;
  let fixture: ComponentFixture<QrBarcodeBatchPage>;
  let barcodeService: BarcodeBatchService;

  beforeEach(async () => {
    await resolveAngularResources();

    await TestBed.configureTestingModule({
      imports: [QrBarcodeBatchPage],
      providers: [
        BarcodeBatchService,
        {
          provide: StorageService,
          useValue: {
            saveFile: vi.fn().mockResolvedValue('indexeddb://barcode-batch/file.csv')
          }
        },
        {
          provide: TranslationService,
          useValue: {
            translate: vi.fn().mockImplementation((key: string, params?: any) => {
              if (params && params.count !== undefined) return `Scanned: ${params.count} codes`;
              if (params && params.name !== undefined) return `Exported ${params.name} successfully`;
              return key;
            }),
            currentLang$: {
              subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(QrBarcodeBatchPage);
    component = fixture.componentInstance;
    barcodeService = TestBed.inject(BarcodeBatchService);
    barcodeService.clearSession();
    fixture.detectChanges();
  });

  afterEach(() => {
    component.stopCamera();
    barcodeService.clearSession();
  });

  it('should create and initialize in batchScan mode with default dedupMode', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab).toBe('batchScan');
    expect(component.dedupMode).toBe('cooldown');
    expect(component.scannedItems.length).toBe(0);
    expect(component.selectedFormat).toBe('CODE_128');
  });

  it('should switch tabs between batchScan and generator1D', () => {
    component.switchTab('generator1D');
    expect(component.activeTab).toBe('generator1D');
    expect(component.isCameraActive).toBe(false);

    component.switchTab('batchScan');
    expect(component.activeTab).toBe('batchScan');
  });

  it('should handle barcode deduplication in cooldown mode', () => {
    component.setDedupMode('cooldown');

    // First scan of 'SKU-9901' should be accepted
    const accepted1 = component.simulateBarcodeScan('SKU-9901', 'CODE_128');
    expect(accepted1).toBe(true);
    expect(component.scannedItems.length).toBe(1);
    expect(component.scannedItems[0].payload).toBe('SKU-9901');

    // Second scan of same code immediately should be rejected (cooldown active)
    const accepted2 = component.simulateBarcodeScan('SKU-9901', 'CODE_128');
    expect(accepted2).toBe(false);
    expect(component.scannedItems.length).toBe(1);

    // Scan of a different code should be accepted
    const accepted3 = component.simulateBarcodeScan('SKU-9902', 'CODE_128');
    expect(accepted3).toBe(true);
    expect(component.scannedItems.length).toBe(2);
  });

  it('should delete an item from the session list and clear all items', () => {
    component.simulateBarcodeScan('CODE-A', 'CODE_128');
    component.simulateBarcodeScan('CODE-B', 'CODE_128');
    expect(component.scannedItems.length).toBe(2);

    component.deleteScannedItem(0);
    expect(component.scannedItems.length).toBe(1);
    expect(component.scannedItems[0].payload).toBe('CODE-B');

    component.clearAllScanned();
    expect(component.scannedItems.length).toBe(0);
  });

  it('should validate EAN-13 check digit and reflect validation errors in generator', async () => {
    component.switchTab('generator1D');
    component.selectFormat('EAN_13');

    // Invalid EAN-13 payload (incorrect check digit 7 instead of 1)
    component.onPayloadInput('4006381333937');
    await component.update1DPreview();
    expect(component.generatorError).toBeTruthy();
    expect(component.previewSvgSafe).toBeNull();

    // Valid EAN-13 payload (with correct check digit 1)
    component.onPayloadInput('4006381333931');
    await component.update1DPreview();
    expect(component.generatorError).toBeNull();
    expect(component.previewSvgSafe).not.toBeNull();
  });

  it('should parse bulk CSV payloads and trigger label sheet & zip exports', async () => {
    component.switchTab('generator1D');
    component.toggleBulkMode(true);
    component.bulkPayloadsText = 'SKU-100\nSKU-200\n\n#Comment\nSKU-300';

    const payloads = component.parseBulkPayloads();
    expect(payloads).toEqual(['SKU-100', 'SKU-200', 'SKU-300']);

    const generateSheetSpy = vi.spyOn(barcodeService, 'generateLabelSheetPdf');
    const generateZipSpy = vi.spyOn(barcodeService, 'generateBulkZipArchive');

    await component.generateBulkLabelSheet();
    expect(generateSheetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payloads: ['SKU-100', 'SKU-200', 'SKU-300'],
        gridType: '24-up'
      })
    );

    await component.downloadBulkZip();
    expect(generateZipSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payloads: ['SKU-100', 'SKU-200', 'SKU-300']
      })
    );
  });

  it('should trigger batch export to CSV and TXT', async () => {
    component.simulateBarcodeScan('BATCH-001', 'CODE_128');
    const exportCsvSpy = vi.spyOn(barcodeService, 'exportBatchCsv');
    const exportTxtSpy = vi.spyOn(barcodeService, 'exportBatchTxt');

    await component.exportBatchCsv();
    expect(exportCsvSpy).toHaveBeenCalled();

    await component.exportBatchTxt();
    expect(exportTxtSpy).toHaveBeenCalled();
  });
});
