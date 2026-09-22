import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ToolRegistryService, ToolItem } from '../../../../core/services/tool-registry.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-related-tools',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="related-tools-section" *ngIf="relatedTools.length > 0">
      <div class="section-header">
        <div class="header-text">
          <h3 class="section-title">{{ title }}</h3>
          <p *ngIf="subtitle" class="section-subtitle">{{ subtitle }}</p>
        </div>
        <a routerLink="/home" class="browse-all-link">
          <span>All Tools</span>
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </a>
      </div>

      <div class="tools-grid">
        <a
          *ngFor="let tool of relatedTools"
          [routerLink]="tool.route"
          (click)="onToolClick(tool)"
          class="related-card"
          [ngClass]="'card-' + tool.color">
          
          <div class="card-icon-box" [ngClass]="'icon-' + tool.color">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
              <path *ngIf="tool.category === 'PHOTO'" d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"></path>
              <path *ngIf="tool.category === 'SIGNATURE' || tool.category === 'SIGN'" d="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              <path *ngIf="tool.category === 'PDF' || tool.category === 'ORGANIZE' || tool.category === 'EDIT'" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8"></path>
              <path *ngIf="tool.category === 'CONVERT'" d="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              <path *ngIf="tool.category === 'PROTECT'" d="M3 11h18v11H3z M7 11V7a5 5 0 0 1 10 0v4"></path>
              <path *ngIf="tool.category === 'BATCH'" d="M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5"></path>
              <path *ngIf="tool.category === 'PRESETS'" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>

          <div class="card-content">
            <div class="title-row">
              <span class="card-title">{{ tool.title }}</span>
              <span *ngIf="tool.badge" class="badge-mini">{{ tool.badge }}</span>
            </div>
            <p class="card-desc">{{ tool.description }}</p>
          </div>

          <div class="card-arrow">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </a>
      </div>
    </section>
  `,
  styles: [`
    .related-tools-section {
      margin-top: var(--space-8, 32px);
      padding-top: var(--space-6, 24px);
      border-top: 1px solid var(--color-border);
    }

    .section-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      margin-bottom: var(--space-4, 16px);
      gap: var(--space-4, 16px);
    }

    .section-title {
      font-size: var(--font-h3, 18px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text);
      margin: 0 0 4px 0;
      letter-spacing: -0.01em;
    }

    .section-subtitle {
      font-size: var(--font-small, 13px);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .browse-all-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-primary);
      text-decoration: none;
      white-space: nowrap;
    }

    .browse-all-link:hover {
      text-decoration: underline;
    }

    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--space-3, 12px);
    }

    .related-card {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      text-decoration: none;
      color: var(--color-text);
      transition: all var(--transition-fast, 150ms);
    }

    .related-card:hover {
      transform: translateY(-2px);
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-sm);
      background-color: var(--color-surface-hover);
    }

    .card-icon-box {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md, 10px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .icon-photo { background: var(--color-photo-soft); color: var(--color-photo); }
    .icon-signature { background: var(--color-signature-soft); color: var(--color-signature); }
    .icon-pdf { background: var(--color-pdf-soft); color: var(--color-pdf); }
    .icon-convert { background: var(--color-convert-soft); color: var(--color-convert); }
    .icon-organize { background: var(--color-organize-soft); color: var(--color-organize); }
    .icon-edit { background: var(--color-edit-soft); color: var(--color-edit); }
    .icon-sign { background: var(--color-sign-soft); color: var(--color-sign); }
    .icon-security { background: var(--color-security-soft); color: var(--color-security); }
    .icon-batch { background: var(--color-batch-soft); color: var(--color-batch); }
    .icon-presets { background: var(--color-presets-soft); color: var(--color-presets); }

    .card-content {
      flex: 1;
      min-width: 0;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 2px;
    }

    .card-title {
      font-size: var(--font-label, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .badge-mini {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-primary-soft);
      color: var(--color-primary);
    }

    .card-desc {
      margin: 0;
      font-size: var(--font-caption, 12px);
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-arrow {
      color: var(--color-text-muted);
      display: flex;
      align-items: center;
      flex-shrink: 0;
      transition: transform var(--transition-fast, 150ms), color var(--transition-fast, 150ms);
    }

    .related-card:hover .card-arrow {
      transform: translateX(3px);
      color: var(--color-primary);
    }

    @media (max-width: 640px) {
      .tools-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class AppRelatedToolsComponent implements OnInit {
  @Input() currentToolId?: string;
  @Input() category?: string;
  @Input() title = 'Related Tools';
  @Input() subtitle = 'Continue your document workflow with these connected utilities';
  @Input() limit = 4;

  relatedTools: ToolItem[] = [];

  constructor(private toolRegistry: ToolRegistryService) {}

  ngOnInit() {
    const key = this.currentToolId || this.category || '';
    this.relatedTools = this.toolRegistry.getRelatedTools(key, this.limit);
  }

  onToolClick(tool: ToolItem) {
    this.toolRegistry.recordToolUsage(tool.id);
  }
}
