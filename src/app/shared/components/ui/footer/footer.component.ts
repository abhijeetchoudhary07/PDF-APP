import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
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
            <span class="brand-title">Indian Form Helper</span>
          </div>
          <p class="brand-desc">
            The private, client-side document workstation. Compress, convert, organize, sign, and fill exam and job applications with 100% offline security.
          </p>
          <div class="security-chip">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span>Zero Document Uploads Guaranteed</span>
          </div>
        </div>

        <!-- Links Column 1: Tools & Presets -->
        <div class="footer-col">
          <span class="col-title">Document Tools</span>
          <ul class="col-links">
            <li><a routerLink="/features/photo">Photo Compress & Crop</a></li>
            <li><a routerLink="/features/signature">Signature Cleanup</a></li>
            <li><a routerLink="/features/pdf">PDF Compress to KB</a></li>
            <li><a routerLink="/features/pdf/conversion">Document Converter</a></li>
            <li><a routerLink="/features/pdf/organize">Page Organizer & Merge</a></li>
            <li><a routerLink="/features/pdf/editor">PDF Editor & Reader</a></li>
            <li><a routerLink="/features/presets">Government Exam Presets</a></li>
          </ul>
        </div>

        <!-- Links Column 2: Product & Pricing -->
        <div class="footer-col">
          <span class="col-title">Product & Pricing</span>
          <ul class="col-links">
            <li><a routerLink="/home">Product Overview</a></li>
            <li><a routerLink="/features/premium">Go Premium (Ad-Free)</a></li>
            <li><a routerLink="/features/batch">Batch Photo Tool</a></li>
            <li><a routerLink="/features/batch-pdf">Batch PDF Tool</a></li>
            <li><a routerLink="/features/history">Processing History</a></li>
            <li><a routerLink="/profile">User Profile & Usage</a></li>
          </ul>
        </div>

        <!-- Links Column 3: Legal & Support -->
        <div class="footer-col">
          <span class="col-title">Privacy & Support</span>
          <ul class="col-links">
            <li><a routerLink="/features/settings">Settings & Preferences</a></li>
            <li><a routerLink="/features/settings">Privacy Policy</a></li>
            <li><a routerLink="/features/settings">Terms of Use</a></li>
            <li><a routerLink="/features/settings">Local Data Storage</a></li>
            <li><a routerLink="/features/settings">Help & FAQ</a></li>
            <li><a routerLink="/features/settings">Contact Support</a></li>
            <li><a routerLink="/features/settings">About the Engine</a></li>
          </ul>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div class="footer-bottom">
        <div class="bottom-inner">
          <span class="copyright">&copy; 2026 Indian Form Helper. All operations run 100% in your device runtime.</span>
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
      grid-template-columns: 2fr 1.2fr 1.2fr 1.2fr;
      gap: var(--space-8, 32px);
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
    }

    .col-links a:hover {
      color: var(--color-primary);
    }

    .footer-bottom {
      border-top: 1px solid var(--color-divider);
      padding: var(--space-4, 16px) 0;
      background-color: var(--color-background-subtle);
    }

    .bottom-inner {
      max-width: 1240px;
      margin: 0 auto;
      padding: 0 var(--space-4, 16px);
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
        grid-template-columns: 1fr 1fr;
      }
      .footer-brand {
        grid-column: span 2;
      }
    }

    @media (max-width: 600px) {
      .footer-inner {
        grid-template-columns: 1fr;
        padding: var(--space-8, 32px) var(--space-4, 16px);
      }
      .footer-brand {
        grid-column: span 1;
      }
    }
  `]
})
export class AppFooterComponent {}
