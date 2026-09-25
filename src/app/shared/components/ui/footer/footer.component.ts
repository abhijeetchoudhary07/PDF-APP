import { Component, ChangeDetectionStrategy } from '@angular/core';

import { RouterModule } from '@angular/router';
import { AppLanguageSelectorComponent } from '../language-selector/language-selector.component';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-footer',
  standalone: true,
  imports: [RouterModule, AppLanguageSelectorComponent, TranslatePipe],
  template: `
    <footer class="app-footer">
      <div class="footer-inner">
        <!-- Brand / About Column -->
        <div class="footer-col footer-brand">
          <div class="brand-row">
            <div class="brand-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
            <span class="brand-title">{{ 'common.appName' | translate }}</span>
          </div>
          <p class="brand-desc">
            {{ 'footer.brandDesc' | translate }}
          </p>
          <div class="security-chip">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span>{{ 'footer.securityChip' | translate }}</span>
          </div>

          <!-- Quick Language Selector in Footer -->
          <div class="footer-lang-row">
            <app-language-selector mode="compact"></app-language-selector>
          </div>
        </div>

        <!-- Links Columns: Displayed side by side across all viewports -->
        <div class="footer-links-wrapper">
          <!-- Links Column 1: Tools & Presets -->
          <div class="footer-col">
            <span class="col-title">{{ 'footer.docTools' | translate }}</span>
            <ul class="col-links">
              <li><a routerLink="/features/photo">{{ 'footer.photoCompress' | translate }}</a></li>
              <li><a routerLink="/features/signature">{{ 'footer.sigCleanup' | translate }}</a></li>
              <li><a routerLink="/features/pdf">{{ 'footer.pdfCompress' | translate }}</a></li>
              <li><a routerLink="/features/pdf/conversion">{{ 'footer.docConverter' | translate }}</a></li>
              <li><a routerLink="/features/pdf/organize">{{ 'footer.pageOrganize' | translate }}</a></li>
              <li><a routerLink="/features/pdf/editor">{{ 'footer.pdfEditor' | translate }}</a></li>
              <li><a routerLink="/features/presets">{{ 'footer.examPresets' | translate }}</a></li>
            </ul>
          </div>

          <!-- Links Column 2: Product & Pricing -->
          <div class="footer-col">
            <span class="col-title">{{ 'footer.productPricing' | translate }}</span>
            <ul class="col-links">
              <li><a routerLink="/home">{{ 'footer.productOverview' | translate }}</a></li>
              <li><a routerLink="/features/premium">{{ 'footer.goPremium' | translate }}</a></li>
              <li><a routerLink="/features/batch">{{ 'footer.batchPhoto' | translate }}</a></li>
              <li><a routerLink="/features/batch-pdf">{{ 'footer.batchPdf' | translate }}</a></li>
              <li><a routerLink="/features/history">{{ 'footer.processHistory' | translate }}</a></li>
              <li><a routerLink="/profile">{{ 'footer.userProfile' | translate }}</a></li>
            </ul>
          </div>

          <!-- Links Column 3: Legal & Support -->
          <div class="footer-col">
            <span class="col-title">{{ 'footer.privacySupport' | translate }}</span>
            <ul class="col-links">
              <li><a routerLink="/features/settings">{{ 'footer.settingsPrefs' | translate }}</a></li>
              <li><a routerLink="/features/privacy-policy">{{ 'footer.privacyPolicy' | translate }}</a></li>
              <li><a routerLink="/features/terms-of-use">{{ 'footer.termsOfUse' | translate }}</a></li>
              <li><a routerLink="/features/local-data-storage">{{ 'footer.localDataStorage' | translate }}</a></li>
              <li><a routerLink="/features/help-faq">{{ 'footer.helpFaq' | translate }}</a></li>
              <li><a routerLink="/features/contact-support">{{ 'footer.contactSupport' | translate }}</a></li>
              <li><a routerLink="/features/about-engine">{{ 'footer.aboutEngine' | translate }}</a></li>
            </ul>
          </div>
        </div>
      </div>

      <!--
        Google Play requires an app themed around government forms to say
        plainly that it is not a government product. It has to be reachable
        without hunting, so it sits on every page that renders the footer as
        well as in Settings and on the About page.
      -->
      <div class="footer-disclaimer" role="note">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>{{ 'footer.govDisclaimer' | translate }}</p>
      </div>

      <!-- Bottom Bar -->
      <div class="footer-bottom">
        <div class="bottom-inner">
          <span class="copyright">{{ 'footer.copyright' | translate }}</span>
          <div class="badge-list">
            <span class="tech-tag">Angular 22</span>
            <span class="tech-tag">WebAssembly</span>
            <span class="tech-tag">Zero-Knowledge</span>
          </div>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .app-footer {
      background-color: var(--color-surface);
      border-top: 1px solid var(--color-border);
      margin-top: auto;
      font-size: var(--font-small, 13px);
      color: var(--color-text-secondary);
    }

    .footer-inner {
      max-width: 1240px;
      margin: 0 auto;
      padding: var(--space-12, 48px) var(--space-4, 16px) var(--space-8, 32px);
      display: grid;
      grid-template-columns: 1.4fr 3fr;
      gap: var(--space-10, 40px);
      align-items: start;
    }

    .footer-brand {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .brand-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-icon {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm, 6px);
      background-color: var(--color-primary);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-title {
      font-size: var(--font-h3, 18px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text);
      letter-spacing: -0.01em;
    }

    .brand-desc {
      margin: 0;
      line-height: var(--line-height-normal, 1.5);
      color: var(--color-text-secondary);
      max-width: 320px;
    }

    .security-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background-color: var(--color-success-soft);
      color: var(--color-success);
      border-radius: var(--radius-full, 9999px);
      font-size: var(--font-caption, 12px);
      font-weight: var(--font-weight-medium, 500);
      width: fit-content;
    }

    /* Links columns side by side */
    .footer-links-wrapper {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-8, 32px);
    }

    .footer-col {
      min-width: 0;
    }

    .col-title {
      display: block;
      font-size: var(--font-label, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text);
      margin-bottom: var(--space-3, 12px);
      letter-spacing: -0.01em;
    }

    .col-links {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .col-links a {
      color: var(--color-text-secondary);
      text-decoration: none;
      transition: color var(--transition-fast, 150ms);
      line-height: 1.4;
    }

    .col-links a:hover {
      color: var(--color-primary);
    }

    .footer-disclaimer {
      max-width: 1240px;
      margin: 0 auto;
      padding: var(--space-4, 16px);
      padding-inline: calc(var(--space-4, 16px) + env(safe-area-inset-left, 0px))
                      calc(var(--space-4, 16px) + env(safe-area-inset-right, 0px));
      display: flex;
      align-items: flex-start;
      gap: 10px;
      border-top: 1px solid var(--color-divider);
      color: var(--color-text-secondary);
    }

    .footer-disclaimer svg {
      flex-shrink: 0;
      margin-top: 1px;
      color: var(--color-warning);
    }

    .footer-disclaimer p {
      margin: 0;
      font-size: var(--font-caption, 12px);
      line-height: var(--line-height-normal, 1.5);
    }

    .footer-bottom {
      border-top: 1px solid var(--color-divider);
      padding: var(--space-4, 16px) 0;
      /* Keeps the last line of the page above Android's gesture pill. */
      padding-bottom: calc(var(--space-4, 16px) + env(safe-area-inset-bottom, 0px));
      background-color: var(--color-background-subtle);
    }

    .bottom-inner {
      max-width: 1240px;
      margin: 0 auto;
      padding-inline: calc(var(--space-4, 16px) + env(safe-area-inset-left, 0px))
                      calc(var(--space-4, 16px) + env(safe-area-inset-right, 0px));
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--space-3, 12px);
    }

    .copyright {
      font-size: var(--font-caption, 12px);
      color: var(--color-text-muted);
    }

    .badge-list {
      display: flex;
      gap: 6px;
    }

    .tech-tag {
      padding: 2px 8px;
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xs, 4px);
      font-size: 11px;
      color: var(--color-text-muted);
    }

    @media (max-width: 900px) {
      .footer-inner {
        grid-template-columns: 1fr;
        gap: var(--space-8, 32px);
      }

      .footer-brand {
        max-width: 480px;
      }

      .footer-links-wrapper {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-5, 20px);
      }
    }

    @media (max-width: 600px) {
      .footer-inner {
        padding: var(--space-8, 32px) var(--space-4, 16px);
        gap: var(--space-6, 24px);
      }

      .footer-links-wrapper {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-3, 12px);
      }

      .col-title {
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .col-links {
        gap: 6px;

        a {
          font-size: 11px;
          line-height: 1.35;
          word-break: break-word;
        }
      }
    }
  `]
})
export class AppFooterComponent {}
