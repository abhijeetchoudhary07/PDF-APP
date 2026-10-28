import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppBadgeComponent,
  AppTabsComponent,
  AppEmptyStateComponent,
  TranslatePipe
} from '../../shared/components/ui';
import { ConversionRegistryService } from '../../core/conversion/conversion-registry.service';
import { ConverterMetadata } from '../../core/conversion/conversion.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-conversion-hub',
  templateUrl: './conversion-hub.page.html',
  styleUrls: ['./conversion-hub.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppBadgeComponent,
    AppTabsComponent,
    AppEmptyStateComponent,
    TranslatePipe
  ]
})
export class ConversionHubPage implements OnInit {
  private registry = inject(ConversionRegistryService);

  searchTerm: string = '';
  selectedCategory: 'all' | 'pdf-to-format' | 'format-to-pdf' = 'all';

  pdfToFormatConverters: ConverterMetadata[] = [];
  formatToPdfConverters: ConverterMetadata[] = [];

  ngOnInit() {
    this.pdfToFormatConverters = this.registry
      .getConvertersByCategory('pdf-to-format')
      .map(c => c.metadata);

    this.formatToPdfConverters = this.registry
      .getConvertersByCategory('format-to-pdf')
      .map(c => c.metadata);
  }

  get totalCount(): number {
    return this.pdfToFormatConverters.length + this.formatToPdfConverters.length;
  }

  get filteredPdfToFormat(): ConverterMetadata[] {
    return this.filterList(this.pdfToFormatConverters);
  }

  get filteredFormatToPdf(): ConverterMetadata[] {
    return this.filterList(this.formatToPdfConverters);
  }

  /**
   * A short source label. `sourceFormats.join()` put five extensions in a
   * badge, which wrapped into the card title at 360px.
   */
  sourceLabel(item: ConverterMetadata): string {
    const formats = item.sourceFormats.map(f => f.replace('.', '').toUpperCase());
    if (formats.length <= 2) return formats.join(', ');
    return `${formats.slice(0, 2).join(', ')} +${formats.length - 2}`;
  }

  private filterList(list: ConverterMetadata[]): ConverterMetadata[] {
    if (!this.searchTerm || !this.searchTerm.trim()) return list;
    const term = this.searchTerm.toLowerCase().trim();
    return list.filter(
      c =>
        c.name.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term) ||
        c.sourceFormats.some(f => f.toLowerCase().includes(term)) ||
        c.targetFormat.toLowerCase().includes(term)
    );
  }
}
