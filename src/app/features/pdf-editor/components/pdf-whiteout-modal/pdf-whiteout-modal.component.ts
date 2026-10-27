import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { WhiteoutRegion } from '../../../../core/models/editor-features.types';

/**
 * K4 — the whiteout sheet.
 *
 * This replaces a one-shot alert that dropped a fixed 140 × 30 rectangle at
 * a fixed spot and called it placed. Whiteout is an area tool: the area is
 * drawn on the page, and the colour is taken from the page behind it so the
 * cover disappears into a tinted form or a scan instead of leaving a white
 * patch that draws the eye to exactly what was being hidden.
 *
 * "Use Redact instead" is a first-class button, not a footnote. Someone who
 * came here to hide a number permanently should be able to leave for the
 * tool that actually does that in one tap.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-whiteout-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, TranslatePipe],
  templateUrl: './pdf-whiteout-modal.component.html',
  styleUrls: ['./pdf-whiteout-modal.component.scss']
})
export class PdfWhiteoutModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private modalCtrl = inject(ModalController);

  matchPage = true;
  fillColor = '#FFFFFF';
  regions: WhiteoutRegion[] = [];

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    const doc = this.state.document;
    this.regions = doc ? doc.pages.flatMap(page => page.whiteouts || []) : [];
  }

  round(value: number): number {
    return Math.round(value);
  }

  startDrawing(): void {
    this.state.startPlacement('whiteout', {
      fillColor: this.fillColor,
      matchPage: this.matchPage
    });
    this.modalCtrl.dismiss({ placing: 'whiteout' });
  }

  /** Leaves for the redaction tool, which removes rather than covers. */
  useRedaction(): void {
    this.state.clearPlacement();
    this.state.setActiveTool('redact');
    this.modalCtrl.dismiss({ switchedToRedaction: true });
  }

  jumpTo(region: WhiteoutRegion): void {
    this.state.setCurrentPage(region.pageNumber);
  }

  remove(region: WhiteoutRegion): void {
    this.state.setCurrentPage(region.pageNumber);
    this.state.deleteWhiteout(region.id);
    this.refresh();
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
