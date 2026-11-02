import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AdService } from '../../../../core/services/ad.service';
import { MonetizationService } from '../../../../core/services/monetization.service';

/**
 * AdMob Banner Component.
 *
 * Production Features:
 * - On Native Android: Provides safe-area bottom offset so native Google AdView does not obscure interactive content.
 * - On Web / Preview: Renders an adaptive Google AdMob banner compliant with Material & Google Ad specifications.
 * - Automatic suppression for PRO / Premium members via MonetizationService.
 */
@Component({
  selector: 'app-ad-banner',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if ((adService.isBannerVisible$ | async) && (monetization.isPremium$ | async) === false) {
      @if (!adService.isNative) {
        <aside class="admob-banner-container" role="complementary" aria-label="Sponsored Advertisement">
          <div class="admob-banner-inner">
            <div class="ad-meta">
              <span class="ad-badge">Ad</span>
              <span class="ad-network">Google AdMob</span>
            </div>

            <div class="ad-content">
              <div class="ad-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="6" fill="#4285F4"/>
                  <path d="M7 12L10.5 15.5L17 8.5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="ad-copy">
                <span class="ad-headline">Compress & Convert Documents Fast</span>
                <span class="ad-subline">Privacy-first PDF & Photo tools on Google Play</span>
              </div>
              <button class="ad-cta-btn" type="button" (click)="onAdClicked()">
                Open
              </button>
            </div>

            <button
              class="remove-ads-pill"
              type="button"
              (click)="goToPremium()"
              title="Upgrade to remove all ads">
              <span class="pro-sparkle">★</span> Remove Ads
            </button>
          </div>
        </aside>
      } @else {
        <!-- Native bottom spacer reserving room for the Android Native AdView -->
        <div class="admob-native-bottom-spacer" aria-hidden="true"></div>
      }
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .admob-native-bottom-spacer {
      height: calc(56px + env(safe-area-inset-bottom, 0px));
      width: 100%;
      pointer-events: none;
      visibility: hidden;
    }

    .admob-banner-container {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 999;
      background: var(--surface-card, #ffffff);
      border-top: 1px solid var(--border-subtle, #e5e7eb);
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
      padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
      transition: transform 0.25s ease, opacity 0.25s ease;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: var(--font-family-base, system-ui, -apple-system, sans-serif);
    }

    .admob-banner-inner {
      width: 100%;
      max-width: 640px;
      min-height: 50px;
      display: flex;
      align-items: center;
      gap: 10px;
      position: relative;
    }

    .ad-meta {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding-right: 6px;
      border-right: 1px solid var(--border-subtle, #f0f0f0);
    }

    .ad-badge {
      background: #facc15;
      color: #713f12;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 1px 4px;
      border-radius: 3px;
      letter-spacing: 0.5px;
      line-height: 1.2;
    }

    .ad-network {
      font-size: 9px;
      color: var(--text-muted, #9ca3af);
      white-space: nowrap;
    }

    .ad-content {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .ad-icon {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: #eff6ff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ad-copy {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .ad-headline {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-primary, #111827);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }

    .ad-subline {
      font-size: 11px;
      color: var(--text-secondary, #4b5563);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }

    .ad-cta-btn {
      flex-shrink: 0;
      background: #1a73e8;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 18px;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(26, 115, 232, 0.3);
      transition: background 0.15s ease, transform 0.1s ease;
    }

    .ad-cta-btn:hover {
      background: #1557b0;
    }

    .ad-cta-btn:active {
      transform: scale(0.97);
    }

    .remove-ads-pill {
      flex-shrink: 0;
      background: transparent;
      border: 1px solid var(--border-subtle, #e5e7eb);
      color: var(--text-secondary, #6b7280);
      font-size: 10.5px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.15s ease;
    }

    .remove-ads-pill:hover {
      border-color: #6366f1;
      color: #4f46e5;
      background: #eef2ff;
    }

    .remove-ads-pill .pro-sparkle {
      color: #f59e0b;
    }

    @media (max-width: 480px) {
      .ad-network {
        display: none;
      }

      .ad-subline {
        display: none;
      }

      .admob-banner-container {
        padding: 4px 8px calc(4px + env(safe-area-inset-bottom, 0px));
      }

      .remove-ads-pill {
        display: none;
      }
    }
  `]
})
export class AdBannerComponent {
  public readonly adService = inject(AdService);
  public readonly monetization = inject(MonetizationService);
  private readonly router = inject(Router);

  onAdClicked(): void {
    window.open('https://play.google.com/store/apps/details?id=com.pdfhelper.indianformhelper', '_blank');
  }

  goToPremium(): void {
    void this.router.navigate(['/premium']);
  }
}
