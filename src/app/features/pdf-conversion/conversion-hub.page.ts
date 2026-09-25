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
  AppEmptyStateComponent
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
    AppEmptyStateComponent
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

  get filteredPdfToFormat(): ConverterMetadata[] {
    return this.filterList(this.pdfToFormatConverters);
  }

  get filteredFormatToPdf(): ConverterMetadata[] {
    return this.filterList(this.formatToPdfConverters);
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
