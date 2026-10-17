import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentTrayEntry } from '../../../../core/models/document-tray.types';
import { AppButtonComponent, AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';

/**
 * The organizer's multi-document tray (A8).
 *
 * Presentational: the page owns the workspace state and this renders the
 * entries it is given. A separate component rather than more markup in the
 * organizer because the organizer's own stylesheet was already within a few
 * kilobytes of the `anyComponentStyle` build budget, and because the tray's
 * source-colour palette is self-contained.
 *
 * The parent only renders this once more than one document is loaded, so the
 * single-file flow never sees it.
 */
@Component({
  selector: 'app-document-tray',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, AppIconComponent, AppButtonComponent, TranslatePipe],
  templateUrl: './document-tray.component.html',
  styleUrls: ['./document-tray.component.scss']
})
export class DocumentTrayComponent {
  @Input() entries: DocumentTrayEntry[] = [];

  /** Disables the export control while the page is busy writing something. */
  @Input() busy = false;

  @Output() selectDocument = new EventEmitter<DocumentTrayEntry>();
  @Output() removeDocument = new EventEmitter<DocumentTrayEntry>();
  @Output() exportBySource = new EventEmitter<void>();
}
