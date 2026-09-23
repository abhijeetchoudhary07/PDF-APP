import {
  Component,
  Input,
  ElementRef,
  HostListener,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../../../core/services/translation.service';
import { SupportedLanguage, LanguageOption } from '../../../../core/i18n/i18n.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- 1. DROPDOWN MODE (Header & Compact Toolbars) -->
    <div *ngIf="mode === 'dropdown'" class="lang-dropdown-wrapper">
      <button
        type="button"
        class="lang-trigger-btn"
        [class.is-open]="isOpen"
        (click)="toggleDropdown()"
        [attr.aria-expanded]="isOpen"
        aria-haspopup="listbox"
        [attr.aria-label]="'Select language. Current: ' + currentOption.label">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" class="globe-icon">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span class="lang-name">{{ currentOption.nativeName }}</span>
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" class="chevron-icon">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <div *ngIf="isOpen" class="lang-dropdown-menu" role="listbox" (click)="$event.stopPropagation()">
        <div class="menu-header">
          <span>Choose Language / भाषा</span>
        </div>
        <div class="options-list">
          <button
            *ngFor="let opt of languages"
            type="button"
            class="lang-option-item"
            [class.is-selected]="opt.code === currentLang"
            (click)="selectLanguage(opt.code)"
            role="option"
            [attr.aria-selected]="opt.code === currentLang">
            <div class="lang-info">
              <span class="native-name">{{ opt.nativeName }}</span>
              <span class="english-label">{{ opt.label }}</span>
            </div>
            <svg
              *ngIf="opt.code === currentLang"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              stroke="currentColor"
              stroke-width="2.5"
              fill="none"
              class="check-icon">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 2. SEGMENTED / CARDS MODE (Settings & Mobile Drawer) -->
    <div *ngIf="mode === 'segmented'" class="lang-segmented-grid" role="radiogroup" aria-label="Language selection">
      <button
        *ngFor="let opt of languages"
        type="button"
        class="lang-card-btn"
        [class.active]="opt.code === currentLang"
        (click)="selectLanguage(opt.code)"
        role="radio"
        [attr.aria-checked]="opt.code === currentLang">
        <div class="lang-card-inner">
          <span class="card-native">{{ opt.nativeName }}</span>
          <span class="card-label">{{ opt.label }}</span>
        </div>
        <div class="radio-indicator">
          <div class="radio-dot" *ngIf="opt.code === currentLang"></div>
        </div>
      </button>
    </div>

    <!-- 3. COMPACT PILLS MODE (Footer) -->
    <div *ngIf="mode === 'compact'" class="lang-compact-pills">
      <button
        *ngFor="let opt of languages"
        type="button"
        class="compact-pill"
        [class.active]="opt.code === currentLang"
        (click)="selectLanguage(opt.code)">
        {{ opt.nativeName }}
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: inline-block;
    }

    /* 1. DROPDOWN STYLES */
    .lang-dropdown-wrapper {
      position: relative;
      display: inline-block;
    }

    .lang-trigger-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 10px;
      border-radius: var(--radius-md, 10px);
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-medium, 500);
      cursor: pointer;
      transition: all var(--transition-fast, 150ms);
      user-select: none;
    }

    .lang-trigger-btn:hover {
      background-color: var(--color-surface-hover, var(--color-background-subtle));
      border-color: var(--color-border-hover, var(--color-primary));
    }

    .lang-trigger-btn.is-open {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
    }

    .globe-icon {
      color: var(--color-primary);
      flex-shrink: 0;
    }

    .lang-name {
      font-weight: var(--font-weight-semibold, 600);
      letter-spacing: -0.01em;
    }

    .chevron-icon {
      color: var(--color-text-muted);
      transition: transform var(--transition-fast, 150ms);
    }

    .lang-trigger-btn.is-open .chevron-icon {
      transform: rotate(180deg);
    }

    @media (max-width: 480px) {
      .lang-trigger-btn {
        width: 34px;
        height: 34px;
        padding: 0;
        justify-content: center;
        gap: 0;
      }
      .lang-name,
      .chevron-icon {
        display: none;
      }
    }

    .lang-dropdown-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      width: 210px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-lg, 0 10px 25px -5px rgba(0, 0, 0, 0.2));
      z-index: var(--z-dropdown, 1100);
      overflow: hidden;
      animation: fadeInDown var(--transition-fast, 150ms) ease-out;
    }

    @keyframes fadeInDown {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .menu-header {
      padding: 8px 12px;
      font-size: 11px;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
      border-bottom: 1px solid var(--color-divider);
      background-color: var(--color-background-subtle);
    }

    .options-list {
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .lang-option-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 8px 10px;
      border: none;
      background: transparent;
      border-radius: var(--radius-md, 8px);
      cursor: pointer;
      text-align: left;
      transition: background-color var(--transition-fast, 150ms);
    }

    .lang-option-item:hover {
      background-color: var(--color-background-subtle);
    }

    .lang-option-item.is-selected {
      background-color: var(--color-primary-soft, rgba(99, 102, 241, 0.1));
    }

    .lang-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .native-name {
      font-size: 13.5px;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text);
    }

    .english-label {
      font-size: 11px;
      color: var(--color-text-secondary);
    }

    .check-icon {
      color: var(--color-primary);
      flex-shrink: 0;
    }

    /* 2. SEGMENTED / CARDS STYLES */
    .lang-segmented-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: var(--space-3, 10px);
      width: 100%;
    }

    .lang-card-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all var(--transition-fast, 150ms);
      text-align: left;
    }

    .lang-card-btn:hover {
      background: var(--color-background-subtle);
      border-color: var(--color-border-hover);
    }

    .lang-card-btn.active {
      border-color: var(--color-primary);
      background: var(--color-primary-soft, rgba(99, 102, 241, 0.08));
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2);
    }

    .lang-card-inner {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .card-native {
      font-size: 15px;
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text);
    }

    .card-label {
      font-size: 12px;
      color: var(--color-text-secondary);
    }

    .radio-indicator {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .lang-card-btn.active .radio-indicator {
      border-color: var(--color-primary);
    }

    .radio-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--color-primary);
    }

    /* 3. COMPACT PILLS STYLES */
    .lang-compact-pills {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }

    .compact-pill {
      padding: 4px 10px;
      border-radius: var(--radius-full, 9999px);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font-size: 12px;
      font-weight: var(--font-weight-medium, 500);
      cursor: pointer;
      transition: all var(--transition-fast, 150ms);
    }

    .compact-pill:hover {
      color: var(--color-text);
      background: var(--color-background-subtle);
    }

    .compact-pill.active {
      background: var(--color-primary);
      color: #ffffff;
      border-color: var(--color-primary);
      font-weight: var(--font-weight-semibold, 600);
    }
  `]
})
export class AppLanguageSelectorComponent {
  @Input() mode: 'dropdown' | 'segmented' | 'compact' = 'dropdown';

  isOpen = false;

  constructor(
    public translationService: TranslationService,
    private elementRef: ElementRef<HTMLElement>
  ) {}

  get languages(): LanguageOption[] {
    return this.translationService.supportedLanguages;
  }

  get currentLang(): SupportedLanguage {
    return this.translationService.currentLang;
  }

  get currentOption(): LanguageOption {
    return this.translationService.getLanguageOption();
  }

  toggleDropdown(): void {
    this.isOpen = !this.isOpen;
  }

  selectLanguage(lang: SupportedLanguage): void {
    void this.translationService.setLanguage(lang);
    this.isOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isOpen = false;
  }
}
