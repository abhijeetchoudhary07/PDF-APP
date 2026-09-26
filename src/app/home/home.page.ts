import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToolRegistryService, ToolItem } from '../core/services/tool-registry.service';
import { UsageQuotaService } from '../core/services/usage-quota.service';
import {
  AppEmptyStateComponent,
  AppFooterComponent,
  AppHeaderComponent,
  AppIconComponent,
  TranslatePipe
} from '../shared/components/ui';

/*
 * The last component in the app to be declared by an NgModule.
 *
 * `HomePageModule` and `HomePageRoutingModule` existed only to declare this
 * one page and give it a child route, which `loadComponent` does on its own.
 * Their imports also still listed `AppBadgeComponent` and `AppButtonComponent`,
 * neither of which this template has used for some time; the list below is what
 * `home.page.html` actually renders.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppEmptyStateComponent,
    AppIconComponent,
    TranslatePipe
  ]
})
export class HomePage {
  /** Free-tier allowance, shown in the hero so it is not a surprise later. */
  readonly quota = inject(UsageQuotaService);

  public toolRegistry = inject(ToolRegistryService);
  searchQuery = '';
  selectedCategory: string = 'ALL';

  static readonly CATEGORY_LIST = [
    'ALL',
    'PHOTO',
    'SIGNATURE',
    'PDF',
    'CONVERT',
    'ORGANIZE',
    'EDIT',
    'SIGN',
    'PROTECT',
    'BATCH',
    'PRESETS'
  ];

  categories = HomePage.CATEGORY_LIST;
  marqueeCategories = [...HomePage.CATEGORY_LIST, ...HomePage.CATEGORY_LIST];

  /*
   * Category -> icon name. The template previously carried eleven *ngIf'd inline
   * SVG blocks, one per category, which meant every tile shipped the markup for
   * all of them and adding a category meant editing the template. Looking the
   * glyph up here keeps the tile markup to a single <app-icon>.
   */
  private static readonly CATEGORY_ICONS: Record<string, string> = {
    PHOTO: 'camera',
    SIGNATURE: 'pencil',
    PDF: 'document-text',
    CONVERT: 'refresh',
    ORGANIZE: 'grid',
    EDIT: 'color-wand',
    SIGN: 'create',
    PROTECT: 'lock-closed',
    BATCH: 'documents',
    PRESETS: 'shield-checkmark'
  };

  constructor() {}

  categoryIcon(category: string): string {
    return HomePage.CATEGORY_ICONS[category] ?? 'document';
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'ALL';
  }

  get tools(): ToolItem[] {
    return this.toolRegistry.tools;
  }

  get filteredTools(): ToolItem[] {
    return this.tools.filter(tool => {
      const matchesCategory =
        this.selectedCategory === 'ALL' || tool.category === this.selectedCategory;

      if (!this.searchQuery.trim()) return matchesCategory;

      const q = this.searchQuery.toLowerCase();
      const matchesSearch =
        tool.title.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.category.toLowerCase().includes(q) ||
        tool.keywords.some(k => k.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }

  setCategory(cat: string): void {
    this.selectedCategory = cat;
  }

  onToolClick(tool: ToolItem): void {
    this.toolRegistry.recordToolUsage(tool.id);
  }

  toggleFavorite(event: MouseEvent, tool: ToolItem): void {
    event.preventDefault();
    event.stopPropagation();
    this.toolRegistry.toggleFavorite(tool.id);
  }

  isFavorite(toolId: string): boolean {
    return this.toolRegistry.isFavorite(toolId);
  }
}
