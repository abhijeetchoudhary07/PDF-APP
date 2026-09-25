import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

import { RouterModule } from '@angular/router';

export interface BreadcrumbItem {
  label: string;
  url?: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-breadcrumbs',
  standalone: true,
  imports: [RouterModule],
  template: `
    @if (items && items.length > 0) {
      <nav aria-label="Breadcrumb" class="breadcrumbs-nav">
        <ol class="breadcrumbs-list">
          <li class="breadcrumb-item">
            <a routerLink="/home" class="breadcrumb-link home-link" title="Home">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <span class="sr-only">Home</span>
            </a>
          </li>
          @for (item of items; track item; let last = $last; let index = $index) {
            <li class="breadcrumb-item">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" class="separator-icon">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              @if (!last && item.url) {
                <a [routerLink]="item.url" class="breadcrumb-link">
                  {{ item.label }}
                </a>
              }
              @if (last || !item.url) {
                <span class="breadcrumb-current" aria-current="page">
                  {{ item.label }}
                </span>
              }
            </li>
          }
        </ol>
      </nav>
    }
    `,
  styles: [`
    .breadcrumbs-nav {
      display: flex;
      align-items: center;
      margin-bottom: var(--space-2, 8px);
      font-size: var(--font-caption, 12px);
    }

    .breadcrumbs-list {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      list-style: none;
      padding: 0;
      margin: 0;
      gap: 6px;
    }

    .breadcrumb-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--color-text-muted);
    }

    .breadcrumb-link {
      color: var(--color-text-secondary);
      text-decoration: none;
      transition: color var(--transition-fast, 150ms);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .breadcrumb-link:hover {
      color: var(--color-primary);
      text-decoration: underline;
    }

    .breadcrumb-current {
      color: var(--color-text);
      font-weight: var(--font-weight-medium, 500);
      max-width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .separator-icon {
      color: var(--color-text-muted);
      opacity: 0.6;
      flex-shrink: 0;
    }

    .home-link {
      padding: 2px;
      border-radius: var(--radius-xs, 4px);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    @media (max-width: 640px) {
      .breadcrumbs-list {
        gap: 4px;
      }
      .breadcrumb-item:not(:first-child):not(:last-child):not(:nth-last-child(2)) {
        display: none;
      }
      .breadcrumb-current {
        max-width: 140px;
      }
    }
  `]
})
export class AppBreadcrumbsComponent {
  @Input() items: BreadcrumbItem[] = [];
}
