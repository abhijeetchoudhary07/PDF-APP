import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { PreviewData } from '../result-preview/result-preview.component';
import { AppTabsComponent } from '../ui/tabs/tabs.component';
import { AppBadgeComponent } from '../ui/badge/badge.component';

export type ComparisonMode = 'side-by-side' | 'slider' | 'toggle';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-before-after-preview',
  templateUrl: './before-after-preview.component.html',
  styleUrls: ['./before-after-preview.component.scss'],
  standalone: true,
  imports: [CommonModule, AppBadgeComponent],
  providers: [DecimalPipe]
})
export class BeforeAfterPreviewComponent {
  @Input() beforeUrl?: string;
  @Input() afterUrl?: string;
  @Input() beforeData?: PreviewData;
  @Input() afterData?: PreviewData;
  @Input() mode: ComparisonMode = 'side-by-side';
  @Input() title = 'Visual Comparison';

  // Toggle state when in 'toggle' mode
  activeToggleView: 'before' | 'after' = 'after';

  // Slider state when in 'slider' mode (0 to 100 percentage)
  sliderPosition = 50;

  modeTabs = [
    { id: 'side-by-side', label: 'Side-by-Side' },
    { id: 'slider', label: 'Split Slider' },
    { id: 'toggle', label: 'Toggle View' }
  ];

  get savingsPercentage(): number {
    if (!this.beforeData || !this.afterData) return 0;
    if (this.afterData.sizeBytes >= this.beforeData.sizeBytes) return 0;
    return ((this.beforeData.sizeBytes - this.afterData.sizeBytes) / this.beforeData.sizeBytes) * 100;
  }

  onSliderInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.sliderPosition = Number(input.value);
  }

  setToggleView(view: 'before' | 'after'): void {
    this.activeToggleView = view;
  }
}
