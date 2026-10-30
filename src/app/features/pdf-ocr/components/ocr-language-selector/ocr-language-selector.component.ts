import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppIconComponent } from '../../../../shared/components/ui/icon/icon.component';
import { AppButtonComponent } from '../../../../shared/components/ui/button/button.component';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import {
  OcrModelMetadata,
  OCR_EXPANDED_LANGUAGES,
  OCR_INDIC_LANGUAGES,
  OCR_INTERNATIONAL_LANGUAGES
} from '../../../../core/models/ocr.models';
import { OcrModelManagerService } from '../../../../core/services/ocr-model-manager.service';

@Component({
  selector: 'app-ocr-language-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppIconComponent,
    AppButtonComponent,
    TranslatePipe
  ],
  templateUrl: './ocr-language-selector.component.html',
  styleUrls: ['./ocr-language-selector.component.scss']
})
export class OcrLanguageSelectorComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() selectedLanguages: string[] = ['eng'];
  @Input() cachedCodes: Set<string> = new Set(['eng']);

  @Output() closed = new EventEmitter<void>();
  @Output() languagesConfirmed = new EventEmitter<string[]>();

  private modelManager = inject(OcrModelManagerService, { optional: true });

  searchTerm = '';
  activeTab: 'indic' | 'international' = 'indic';
  currentSelected: string[] = ['eng'];

  allModels: OcrModelMetadata[] = OCR_EXPANDED_LANGUAGES;
  indicCount = OCR_INDIC_LANGUAGES.length;
  internationalCount = OCR_INTERNATIONAL_LANGUAGES.length;

  ngOnInit(): void {
    if (this.modelManager) {
      this.allModels = this.modelManager.getExpandedLanguages();
    }
    this.syncSelected();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && changes['isOpen'].currentValue) {
      this.syncSelected();
    } else if (changes['selectedLanguages'] && !this.isOpen) {
      this.syncSelected();
    }
  }

  private syncSelected(): void {
    if (this.selectedLanguages && this.selectedLanguages.length > 0) {
      this.currentSelected = [...this.selectedLanguages].slice(0, 2);
    } else {
      this.currentSelected = ['eng'];
    }
  }

  get filteredLanguages(): OcrModelMetadata[] {
    const term = (this.searchTerm || '').trim().toLowerCase();
    const tabModels = this.allModels.filter(m => m.category === this.activeTab);

    if (!term) {
      return tabModels;
    }

    return tabModels.filter(m =>
      m.name.toLowerCase().includes(term) ||
      m.nativeName.toLowerCase().includes(term) ||
      m.code.toLowerCase().includes(term) ||
      m.scriptName.toLowerCase().includes(term)
    );
  }

  setTab(tab: 'indic' | 'international'): void {
    this.activeTab = tab;
  }

  isSelected(code: string): boolean {
    return this.currentSelected.includes(code);
  }

  isPrimary(code: string): boolean {
    return this.currentSelected[0] === code;
  }

  isSecondary(code: string): boolean {
    return this.currentSelected[1] === code;
  }

  isCached(code: string): boolean {
    return code === 'eng' || this.cachedCodes.has(code);
  }

  toggleLanguage(code: string): void {
    const index = this.currentSelected.indexOf(code);

    if (index >= 0) {
      // Don't allow deselecting if it's the only language
      if (this.currentSelected.length > 1) {
        this.currentSelected = this.currentSelected.filter(c => c !== code);
      }
    } else {
      if (this.currentSelected.length < 2) {
        this.currentSelected = [...this.currentSelected, code];
      } else {
        // Replace secondary language with new selection
        this.currentSelected = [this.currentSelected[0], code];
      }
    }
  }

  getLanguageName(code: string): string {
    const found = this.allModels.find(m => m.code === code);
    return found ? `${found.name} (${found.nativeName})` : code;
  }

  confirm(): void {
    const finalSelection = this.currentSelected.length > 0 ? this.currentSelected : ['eng'];
    this.languagesConfirmed.emit(finalSelection);
    this.close();
  }

  close(): void {
    this.searchTerm = '';
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('bottom-sheet-backdrop')) {
      this.close();
    }
  }

  trackByCode(_: number, item: OcrModelMetadata): string {
    return item.code;
  }
}
