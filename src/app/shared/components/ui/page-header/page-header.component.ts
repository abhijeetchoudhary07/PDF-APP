import { Component, Input, ChangeDetectionStrategy, inject } from '@angular/core';
import { Location } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AppBadgeComponent, BadgeVariant } from '../badge/badge.component';
import { AppBreadcrumbsComponent, BreadcrumbItem } from '../breadcrumbs/breadcrumbs.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-page-header',
  standalone: true,
  imports: [RouterModule, AppBadgeComponent, AppBreadcrumbsComponent],
  template: `
    <div class="page-header-wrapper">
      @if (breadcrumbs && breadcrumbs.length > 0) {
        <app-breadcrumbs [items]="breadcrumbs"></app-breadcrumbs>
      }
    
      <div class="page-header">
        <div class="header-left">
          @if (backUrl) {
            <a
              [routerLink]="backUrl"
              class="back-btn"
              aria-label="Back">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.2" fill="none">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </a>
          }
    
          @if (!backUrl && showBack) {
            <button
              (click)="goBack()"
              class="back-btn"
              type="button"
              aria-label="Back">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.2" fill="none">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
          }
    
          <div class="title-group">
            <div class="title-row">
              <h1 class="page-title">{{ title }}</h1>
              @if (badge) {
                <app-badge [variant]="badgeVariant" size="sm">{{ badge }}</app-badge>
              }
            </div>
            @if (subtitle) {
              <p class="page-subtitle">{{ subtitle }}</p>
            }
          </div>
        </div>
    
        <div class="header-actions">
          <ng-content select="[actions]"></ng-content>
        </div>
      </div>
    </div>
    `,
  styles: [`
    .page-header-wrapper {
      margin-bottom: var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border);
    }
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3, 12px) 0 var(--space-4, 16px);
      gap: var(--space-4, 16px);
    }

    /*
     * Top-aligned rather than centred: with a two-line subtitle the centred
     * back button drifted well below the title it belongs to.
     */
    .header-left {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      min-width: 0;
    }

    .back-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      margin-top: -2px;
      border-radius: var(--radius-md, 10px);
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      text-decoration: none;
      cursor: pointer;
      flex-shrink: 0;
      transition: all var(--transition-fast, 150ms);
    }

    .back-btn:hover {
      background-color: var(--color-surface-hover);
      color: var(--color-text);
      border-color: var(--color-border-hover);
    }

    .title-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      flex-wrap: wrap;
    }

    .page-title {
      font-size: var(--font-h2, 22px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text);
      margin: 0;
      letter-spacing: -0.015em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .page-subtitle {
      font-size: var(--font-small, 13px);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      flex-shrink: 0;
    }

    /*
     * Below 960px the app header shows its own back button, so this one would
     * be the second identical chevron stacked above it. Drop it and give the
     * title the width back; the breadcrumbs still carry the trail.
     */
    @media (max-width: 960px) {
      .back-btn {
        display: none;
      }
    }

    @media (max-width: 640px) {
      .page-header {
        flex-wrap: wrap;
      }
      .page-title {
        font-size: var(--font-h3, 18px);
        /*
         * Narrow screens have no room to ellipsize a page title into
         * meaninglessness; let it wrap and keep the badge on its heels.
         */
        white-space: normal;
        overflow: visible;
      }
      .header-actions {
        width: 100%;
      }
    }
  `]
})
export class AppPageHeaderComponent {
  private location = inject(Location);

  @Input() title = '';
  @Input() subtitle?: string;
  @Input() backUrl?: string;
  @Input() showBack = true;
  @Input() badge?: string;
  @Input() badgeVariant: BadgeVariant = 'primary';
  @Input() breadcrumbs?: BreadcrumbItem[];

  goBack() {
    this.location.back();
  }
}
