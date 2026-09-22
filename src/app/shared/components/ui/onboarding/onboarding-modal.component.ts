import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Preferences } from '@capacitor/preferences';
import { AppButtonComponent } from '../button/button.component';

const ONBOARDING_KEY = 'IFH_ONBOARDING_COMPLETED_V1';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-onboarding-modal',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  template: `
    <div *ngIf="isOpen" class="onboarding-backdrop" (click)="dismiss()">
      <div class="onboarding-dialog" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
        
        <!-- Top bar: Skip button -->
        <div class="dialog-top-bar">
          <span class="step-indicator">Step {{ currentStep + 1 }} of {{ steps.length }}</span>
          <button type="button" class="skip-btn" (click)="dismiss()">Skip</button>
        </div>

        <!-- Slide Content -->
        <div class="slide-content">
          <div class="slide-icon-circle" [ngClass]="'icon-' + steps[currentStep].color">
            <svg viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="2" fill="none">
              <!-- Step 0: Shield / Privacy -->
              <ng-container *ngIf="currentStep === 0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <polyline points="9 12 11 14 15 10"></polyline>
              </ng-container>

              <!-- Step 1: Target / Precision -->
              <ng-container *ngIf="currentStep === 1">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="6"></circle>
                <circle cx="12" cy="12" r="2"></circle>
              </ng-container>

              <!-- Step 2: Suite / All-in-one -->
              <ng-container *ngIf="currentStep === 2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </ng-container>
            </svg>
          </div>

          <h3 class="slide-title">{{ steps[currentStep].title }}</h3>
          <p class="slide-desc">{{ steps[currentStep].desc }}</p>

          <!-- Bullet Points -->
          <ul class="slide-bullets">
            <li *ngFor="let point of steps[currentStep].bullets">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" class="check-icon">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>{{ point }}</span>
            </li>
          </ul>
        </div>

        <!-- Bottom Controls -->
        <div class="dialog-bottom-bar">
          <!-- Step Dots -->
          <div class="dots-row">
            <span
              *ngFor="let step of steps; let i = index"
              class="dot"
              [class.active]="i === currentStep"
              (click)="currentStep = i">
            </span>
          </div>

          <!-- Next / Finish Button -->
          <div class="action-wrap">
            <app-button
              variant="primary"
              size="md"
              (clicked)="nextStep()">
              {{ currentStep === steps.length - 1 ? 'Get Started' : 'Continue' }}
            </app-button>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .onboarding-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(6px);
      z-index: 4000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      animation: fadeIn var(--transition-fast, 150ms) ease-out;
    }

    .onboarding-dialog {
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--shadow-modal);
      width: 100%;
      max-width: 500px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: slideUp var(--transition-fast, 150ms) ease-out;
    }

    .dialog-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4, 16px) var(--space-5, 20px);
      border-bottom: 1px solid var(--color-divider);
    }

    .step-indicator {
      font-size: var(--font-caption, 12px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .skip-btn {
      background: transparent;
      border: none;
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--radius-sm, 6px);
      transition: all var(--transition-fast, 150ms);
    }

    .skip-btn:hover {
      color: var(--color-text);
      background-color: var(--color-background-subtle);
    }

    .slide-content {
      padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .slide-icon-circle {
      width: 72px;
      height: 72px;
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: var(--space-4, 16px);
    }

    .icon-privacy { background: var(--color-success-soft); color: var(--color-success); }
    .icon-precision { background: var(--color-photo-soft); color: var(--color-photo); }
    .icon-suite { background: var(--color-primary-soft); color: var(--color-primary); }

    .slide-title {
      font-size: var(--font-h3, 20px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text);
      margin: 0 0 var(--space-2, 8px) 0;
    }

    .slide-desc {
      font-size: var(--font-body, 14px);
      color: var(--color-text-secondary);
      line-height: var(--line-height-normal, 1.5);
      margin: 0 0 var(--space-4, 16px) 0;
      max-width: 400px;
    }

    .slide-bullets {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
      width: 100%;
      background: var(--color-background-subtle);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
    }

    .slide-bullets li {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: var(--font-small, 13px);
      color: var(--color-text);
    }

    .check-icon {
      color: var(--color-success);
      flex-shrink: 0;
    }

    .dialog-bottom-bar {
      padding: var(--space-4, 16px) var(--space-6, 24px);
      border-top: 1px solid var(--color-divider);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .dots-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: var(--radius-full, 9999px);
      background-color: var(--color-border);
      cursor: pointer;
      transition: all var(--transition-fast, 150ms);
    }

    .dot.active {
      width: 24px;
      background-color: var(--color-primary);
    }
  `]
})
export class AppOnboardingModalComponent implements OnInit {
  isOpen = false;
  currentStep = 0;

  readonly steps = [
    {
      title: '100% Client-Side Privacy',
      desc: 'Your files never leave your device. All compression, OCR, conversion, and editing run entirely in your local browser memory.',
      color: 'privacy',
      bullets: [
        'Zero document uploads to external servers',
        'Works completely offline without internet',
        'Your sensitive personal documents stay private'
      ]
    },
    {
      title: 'Exact KB & Dimension Precision',
      desc: 'Built specifically to satisfy strict exam and government job portal upload rules (SSC, UPSC, IBPS, State PSCs).',
      color: 'precision',
      bullets: [
        'Iterative compression guarantees exact maximum KB limits',
        'Automatic 3.5 x 4.5 cm passport photo aspect ratios',
        'Instant signature background cleanup & enhancement'
      ]
    },
    {
      title: 'Complete Document Suite',
      desc: 'Everything you need to prepare, sign, and organize application packages in one unified place.',
      color: 'suite',
      bullets: [
        'Convert 15+ formats (Word, Excel, PPT, PNG, PDF/A)',
        'Merge, split, rotate, and delete PDF pages visually',
        'Fill forms, place signatures, and password-protect'
      ]
    }
  ];

  async ngOnInit() {
    try {
      const { value } = await Preferences.get({ key: ONBOARDING_KEY });
      if (!value) {
        this.isOpen = true;
      }
    } catch {
      this.isOpen = false;
    }
  }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
    } else {
      this.dismiss();
    }
  }

  async dismiss() {
    this.isOpen = false;
    await Preferences.set({
      key: ONBOARDING_KEY,
      value: 'true'
    });
  }

  // Method to re-open from settings
  open() {
    this.currentStep = 0;
    this.isOpen = true;
  }
}
