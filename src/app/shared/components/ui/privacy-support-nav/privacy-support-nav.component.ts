import { Component, ChangeDetectionStrategy } from '@angular/core';

import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

export interface PrivacySupportTab {
  id: string;
  key: string;
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-privacy-support-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterModule, TranslatePipe],
  template: `
    <nav class="privacy-support-nav" aria-label="Privacy and Support Navigation">
      <div class="nav-scroll-container">
        <div class="nav-track" role="tablist">
          @for (tab of tabs; track tab) {
            <a
              [routerLink]="tab.route"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: tab.route === '/features/settings' }"
              class="nav-tab-link"
              role="tab">
              <span class="tab-icon" [innerHTML]="getTabIcon(tab.icon)"></span>
              <span class="tab-label">{{ ('footer.' + tab.key) | translate }}</span>
            </a>
          }
        </div>
      </div>
    </nav>
    `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      margin-bottom: var(--space-6, 24px);
    }

    .privacy-support-nav {
      width: 100%;
    }

    .nav-scroll-container {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 2px;
      mask-image: linear-gradient(to right, black 94%, transparent 100%);
      -webkit-mask-image: linear-gradient(to right, black 94%, transparent 100%);

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .nav-track {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px;
      background-color: var(--color-surface, #1e293b);
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-full, 9999px);
      box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
    }

    .nav-tab-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #94a3b8);
      text-decoration: none;
      border-radius: var(--radius-full, 9999px);
      white-space: nowrap;
      transition: all var(--transition-fast, 150ms);
      user-select: none;

      &:hover:not(.active) {
        color: var(--color-text, #f8fafc);
        background-color: var(--color-surface-hover, rgba(255, 255, 255, 0.05));
      }

      &.active {
        background-color: var(--color-primary, #6366f1);
        color: var(--color-primary-contrast, #ffffff);
        font-weight: var(--font-weight-semibold, 600);
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);

        .tab-icon {
          color: #ffffff;
        }
      }
    }

    .tab-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      color: currentColor;

      svg {
        width: 15px;
        height: 15px;
      }
    }

    .tab-label {
      line-height: 1;
    }
  `]
})
export class PrivacySupportNavComponent {
  readonly tabs: PrivacySupportTab[] = [
    { id: 'settings', key: 'settingsPrefs', label: 'Settings & Preferences', route: '/features/settings', icon: 'settings' },
    { id: 'privacy', key: 'privacyPolicy', label: 'Privacy Policy', route: '/features/privacy-policy', icon: 'shield' },
    { id: 'terms', key: 'termsOfUse', label: 'Terms of Use', route: '/features/terms-of-use', icon: 'document' },
    { id: 'storage', key: 'localDataStorage', label: 'Local Data Storage', route: '/features/local-data-storage', icon: 'storage' },
    { id: 'faq', key: 'helpFaq', label: 'Help & FAQ', route: '/features/help-faq', icon: 'help' },
    { id: 'contact', key: 'contactSupport', label: 'Contact Support', route: '/features/contact-support', icon: 'mail' },
    { id: 'engine', key: 'aboutEngine', label: 'About the Engine', route: '/features/about-engine', icon: 'engine' }
  ];

  getTabIcon(icon: string): string {
    switch (icon) {
      case 'settings':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
      case 'shield':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
      case 'document':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
      case 'storage':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`;
      case 'help':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      case 'mail':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
      case 'engine':
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;
      default:
        return '';
    }
  }
}
