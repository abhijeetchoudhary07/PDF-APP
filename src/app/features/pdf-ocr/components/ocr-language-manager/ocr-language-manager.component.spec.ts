import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../../../../test-setup';
import { OcrLanguageManagerComponent } from './ocr-language-manager.component';
import { OcrModelManagerService } from '../../../../core/services/ocr-model-manager.service';
import { ToastService } from '../../../../core/services/toast.service';

describe('OcrLanguageManagerComponent', () => {
  let component: OcrLanguageManagerComponent;
  let modelManager: OcrModelManagerService;
  let toastService: ToastService;

  beforeEach(async () => {
    await resolveAngularResources();

    TestBed.configureTestingModule({
      imports: [OcrLanguageManagerComponent],
      providers: [
        OcrModelManagerService,
        {
          provide: ToastService,
          useValue: {
            show: vi.fn(),
            success: vi.fn(),
            error: vi.fn()
          }
        }
      ]
    });

    const fixture = TestBed.createComponent(OcrLanguageManagerComponent);
    component = fixture.componentInstance;
    modelManager = TestBed.inject(OcrModelManagerService);
    toastService = TestBed.inject(ToastService);
    component.ngOnInit();
  });

  it('initializes with model catalog and storage stats', () => {
    component.ngOnInit();
    expect(component.models.length).toBeGreaterThanOrEqual(5);

    const eng = component.models.find(m => m.code === 'eng');
    expect(eng).toBeDefined();
    expect(eng?.isBundled).toBe(true);
    expect(eng?.status).toBe('offline_ready');
  });

  it('emits closed event when closing the bottom sheet', () => {
    let closedEmitted = false;
    component.closed.subscribe(() => {
      closedEmitted = true;
    });

    component.closeSheet();
    expect(component.isOpen).toBe(false);
    expect(closedEmitted).toBe(true);
  });

  it('triggers download confirmation and calls downloadModel', async () => {
    const downloadSpy = vi.spyOn(modelManager, 'downloadModel').mockResolvedValue(true);
    let downloadedLang = '';
    component.modelDownloaded.subscribe(code => {
      downloadedLang = code;
    });

    const hin = component.models.find(m => m.code === 'hin');
    expect(hin).toBeDefined();

    component.confirmModel = hin;
    component.showConfirmModal = true;

    await component.confirmDownload();

    expect(downloadSpy).toHaveBeenCalledWith('hin', expect.any(Function));
    expect(downloadedLang).toBe('hin');
    expect(toastService.show).toHaveBeenCalledWith('success', expect.stringContaining('Hindi'));
  });

  it('clears storage via freeUpSpace and updates storage indicator', async () => {
    vi.spyOn(modelManager, 'freeUpSpace').mockResolvedValue({ freedBytes: 12373196, deletedCount: 1 });
    const updateSpy = vi.spyOn(component, 'updateStorage');

    await component.freeUpSpace();

    expect(toastService.show).toHaveBeenCalledWith('success', expect.stringContaining('freed'));
    expect(updateSpy).toHaveBeenCalled();
  });
});
