import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveAngularResources } from '../../../../../test-setup';
import { OcrLanguageSelectorComponent } from './ocr-language-selector.component';
import { OcrModelManagerService } from '../../../../core/services/ocr-model-manager.service';
import { TranslationService } from '../../../../core/services/translation.service';

describe('OcrLanguageSelectorComponent', () => {
  let component: OcrLanguageSelectorComponent;
  let fixture: ComponentFixture<OcrLanguageSelectorComponent>;
  let modelManager: OcrModelManagerService;

  beforeEach(async () => {
    await resolveAngularResources();
    modelManager = new OcrModelManagerService();

    await TestBed.configureTestingModule({
      imports: [OcrLanguageSelectorComponent],
      providers: [
        { provide: OcrModelManagerService, useValue: modelManager },
        TranslationService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OcrLanguageSelectorComponent);
    component = fixture.componentInstance;
    component.isOpen = true;
    component.selectedLanguages = ['eng'];
    fixture.detectChanges();
  });

  it('initializes with 18 languages catalog split into 13 Indic and 5 International tabs', () => {
    expect(component.allModels.length).toBe(18);
    expect(component.indicCount).toBe(13);
    expect(component.internationalCount).toBe(5);

    // Initial tab is Indic
    expect(component.activeTab).toBe('indic');
    expect(component.filteredLanguages.length).toBe(13);

    // Switch to International
    component.setTab('international');
    expect(component.filteredLanguages.length).toBe(5);
  });

  it('filters languages by English name and native script name', () => {
    component.setTab('indic');

    // Search by English name "Tamil"
    component.searchTerm = 'Tamil';
    expect(component.filteredLanguages.length).toBe(1);
    expect(component.filteredLanguages[0].code).toBe('tam');

    // Search by Native script name "தமிழ்"
    component.searchTerm = 'தமிழ்';
    expect(component.filteredLanguages.length).toBe(1);
    expect(component.filteredLanguages[0].code).toBe('tam');

    // Search by script name "Devanagari"
    component.searchTerm = 'Devanagari';
    expect(component.filteredLanguages.length).toBeGreaterThan(1);
  });

  it('supports selecting up to 2 simultaneous languages with Primary and Secondary badges', () => {
    // Starts with English
    component.currentSelected = ['eng'];
    expect(component.isPrimary('eng')).toBe(true);
    expect(component.isSecondary('eng')).toBe(false);

    // Select Hindi as secondary
    component.toggleLanguage('hin');
    expect(component.currentSelected).toEqual(['eng', 'hin']);
    expect(component.isPrimary('eng')).toBe(true);
    expect(component.isSecondary('hin')).toBe(true);

    // Select Tamil: replaces secondary (caps at 2)
    component.toggleLanguage('tam');
    expect(component.currentSelected).toEqual(['eng', 'tam']);
    expect(component.isPrimary('eng')).toBe(true);
    expect(component.isSecondary('tam')).toBe(true);

    // Toggle off secondary
    component.toggleLanguage('tam');
    expect(component.currentSelected).toEqual(['eng']);
    expect(component.isPrimary('eng')).toBe(true);
  });

  it('emits languagesConfirmed with final selection upon confirmation', () => {
    let confirmed: string[] | undefined;
    component.languagesConfirmed.subscribe(langs => {
      confirmed = langs;
    });

    component.currentSelected = ['hin', 'eng'];
    component.confirm();

    expect(confirmed).toEqual(['hin', 'eng']);
  });

  it('emits closed event when closing or tapping backdrop', () => {
    let closed = false;
    component.closed.subscribe(() => {
      closed = true;
    });

    component.close();
    expect(closed).toBe(true);
  });
});
