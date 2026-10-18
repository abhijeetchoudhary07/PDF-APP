import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CombineSource,
  MergeOptions,
  MergePlan,
  MergeSortDirection,
  MergeSortField
} from '../../../../core/models/pdf-combine.types';
import {
  AppButtonComponent,
  AppIconComponent,
  AutoScrollDirective,
  TranslatePipe
} from '../../../../shared/components/ui';

/**
 * The merge list: one row per document, with its page subset (C3).
 *
 * Presentational — the page owns the sources, the plan and the writing. Each
 * row is a stacked card rather than a table row, because a table with a name,
 * three numbers and four buttons does not fit across a phone and must not be
 * made to scroll sideways.
 *
 * Reordering is by button, not by drag. A drag handle inside a vertically
 * scrolling list is the single most common way a mobile list becomes unusable,
 * and the up/down buttons are also the only version of this that works with a
 * screen reader.
 */
@Component({
  selector: 'app-merge-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CommonModule,
    FormsModule,
    AppIconComponent,
    AppButtonComponent,
    AutoScrollDirective,
    TranslatePipe
  ],
  templateUrl: './merge-list.component.html',
  styleUrls: ['./merge-list.component.scss']
})
export class MergeListComponent {
  @Input() sources: CombineSource[] = [];
  @Input({ required: true }) options!: MergeOptions;
  @Input() plan: MergePlan | null = null;
  @Input() busy = false;
  /** Shows the subset box per row. Off for interleave, which takes whole files. */
  @Input() showSubsets = true;

  @Output() optionsChange = new EventEmitter<MergeOptions>();
  @Output() moveSource = new EventEmitter<{ index: number; delta: number }>();
  @Output() removeSource = new EventEmitter<string>();
  @Output() addFiles = new EventEmitter<void>();

  readonly sortFields: Array<{ value: MergeSortField; labelKey: string }> = [
    { value: 'none', labelKey: 'combine.sortNone' },
    { value: 'name', labelKey: 'combine.sortName' },
    { value: 'date', labelKey: 'combine.sortDate' },
    { value: 'size', labelKey: 'combine.sortSize' }
  ];

  /** The subset expression for one source, or '' when it has none. */
  subsetFor(sourceId: string): string {
    return this.options.rows.find(row => row.sourceId === sourceId)?.subset ?? '';
  }

  onSubsetChange(sourceId: string, value: string): void {
    const rows = this.options.rows.filter(row => row.sourceId !== sourceId);
    const trimmed = (value ?? '').trim();
    /*
     * An empty subset is not stored as a row. That keeps "no subsets anywhere"
     * as literally an empty row list, which is the state the plan treats as
     * today's shipped merge.
     */
    if (trimmed.length > 0) rows.push({ sourceId, subset: trimmed });
    this.optionsChange.emit({ ...this.options, rows });
  }

  setSort(field: MergeSortField): void {
    this.optionsChange.emit({ ...this.options, sortBy: field });
  }

  toggleDirection(): void {
    const sortDirection: MergeSortDirection =
      this.options.sortDirection === 'asc' ? 'desc' : 'asc';
    this.optionsChange.emit({ ...this.options, sortDirection });
  }

  clearSubsets(): void {
    this.optionsChange.emit({ ...this.options, rows: [] });
  }

  get hasSubsets(): boolean {
    return this.options.rows.length > 0;
  }

  /** How many pages this source contributes under the current plan. */
  contributedPages(sourceId: string): number {
    const entry = this.plan?.entries.find(e => e.sourceId === sourceId);
    return entry?.pageNumbers.length ?? 0;
  }

  /** Where this source's first page lands in the output. */
  firstOutputPage(sourceId: string): number | null {
    return this.plan?.entries.find(e => e.sourceId === sourceId)?.firstOutputPage ?? null;
  }

  /** True when this row's subset expression could not be read. */
  subsetInvalid(sourceId: string): boolean {
    return this.plan?.entries.find(e => e.sourceId === sourceId)?.subsetInvalid === true;
  }

  /** The sources in the order the plan will write them. */
  get orderedSources(): CombineSource[] {
    if (!this.plan || this.plan.entries.length === 0) return this.sources;

    const byId = new Map(this.sources.map(source => [source.id, source]));
    const ordered = this.plan.entries
      .map(entry => byId.get(entry.sourceId))
      .filter((source): source is CombineSource => !!source);

    // A source the plan dropped (an empty subset) still has to be on screen.
    for (const source of this.sources) {
      if (!ordered.includes(source)) ordered.push(source);
    }
    return ordered;
  }

  /** Reordering by hand only makes sense while the list is unsorted. */
  get canReorder(): boolean {
    return this.options.sortBy === 'none';
  }

  sizeKb(bytes: number): number {
    return Math.round(bytes / 1024);
  }

  trackById(_index: number, source: CombineSource): string {
    return source.id;
  }
}
