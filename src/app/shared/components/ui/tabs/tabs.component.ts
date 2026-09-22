import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
  disabled?: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tabs-track" [class.tabs-fullwidth]="fullWidth" [class.tabs-pills]="variant === 'pills'">
      <button
        *ngFor="let tab of tabs"
        type="button"
        class="tab-btn"
        [class.active]="selectedTab === tab.id"
        [disabled]="tab.disabled"
        (click)="selectTab(tab.id)"
        role="tab"
        [attr.aria-selected]="selectedTab === tab.id">
        <span *ngIf="tab.icon" class="tab-icon">
          <svg *ngIf="tab.icon === 'grid'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        </span>
        <span class="tab-label">{{ tab.label }}</span>
        <span *ngIf="tab.badge !== undefined" class="tab-badge">{{ tab.badge }}</span>
      </button>
    </div>
  `,
  styles: [`
    /*
     * The host has to be a block that can shrink, otherwise it grows to the
     * width of all its tabs and pushes the page sideways: the track's
     * overflow-x never engages because its parent simply expanded to fit.
     * min-width: 0 is what lets it shrink inside a flex or grid parent.
     */
    :host {
      display: block;
      max-width: 100%;
      min-width: 0;
    }

    .tabs-track {
      display: inline-flex;
      align-items: center;
      background-color: var(--color-background-subtle);
      padding: 4px;
      border-radius: var(--radius-md, 10px);
      border: 1px solid var(--color-border);
      gap: 2px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      -webkit-overflow-scrolling: touch;
      max-width: 100%;
      min-width: 0;
      scrollbar-width: none;
    }
    .tabs-track::-webkit-scrollbar {
      display: none;
    }

    .tabs-fullwidth {
      display: flex;
      width: 100%;
    }

    .tabs-fullwidth .tab-btn {
      flex: 1;
      justify-content: center;
    }

    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: 8px 14px;
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary);
      background: transparent;
      border: none;
      border-radius: var(--radius-sm, 6px);
      cursor: pointer;
      white-space: nowrap;
      transition: all var(--transition-fast, 150ms);
      user-select: none;
    }

    .tab-btn:hover:not(.active):not(:disabled) {
      color: var(--color-text);
      background-color: rgba(255, 255, 255, 0.6);
    }

    .tab-btn.active {
      color: var(--color-primary);
      background-color: var(--color-surface);
      box-shadow: var(--shadow-sm);
      font-weight: var(--font-weight-semibold, 600);
    }

    .tab-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .tab-badge {
      display: inline-block;
      padding: 1px 6px;
      font-size: 11px;
      font-weight: var(--font-weight-bold, 700);
      border-radius: var(--radius-full, 9999px);
      background-color: var(--color-primary-soft);
      color: var(--color-primary);
    }

    /* Pills variant */
    .tabs-pills {
      background: transparent;
      border: none;
      padding: 0;
      gap: var(--space-2, 8px);
    }
    .tabs-pills .tab-btn {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full, 9999px);
      padding: 6px 14px;
    }
    .tabs-pills .tab-btn.active {
      background-color: var(--color-primary);
      color: var(--color-primary-contrast);
      border-color: var(--color-primary);
    }
  `]
})
export class AppTabsComponent {
  @Input() tabs: TabItem[] = [];
  @Input() selectedTab = '';
  @Input() set activeTab(val: string) {
    this.selectedTab = val;
  }
  get activeTab(): string {
    return this.selectedTab;
  }
  @Input() fullWidth = false;
  @Input() scrollable = false;
  @Input() variant: 'segment' | 'pills' = 'segment';

  @Output() tabChange = new EventEmitter<string>();

  selectTab(id: string) {
    if (this.selectedTab !== id) {
      this.selectedTab = id;
      this.tabChange.emit(id);
    }
  }
}
