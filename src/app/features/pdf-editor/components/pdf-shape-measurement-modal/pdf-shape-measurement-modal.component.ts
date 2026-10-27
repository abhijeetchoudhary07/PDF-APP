import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfShapeMeasurementService } from '../../../../core/services/pdf-shape-measurement.service';
import {
  MeasurementResult,
  MeasurementScale,
  MeasurementUnit
} from '../../../../core/models/editor-features.types';

/**
 * K5 — the shape and measurement sheet.
 *
 * Two things live here because they share the pen: snapping decides what a
 * drawn stroke becomes, and measuring turns drawn points into numbers.
 *
 * The calibration is shown as a sentence — "72 pt = 1 m" — and is editable
 * three ways: by typing either side of it, by picking a unit, or by drawing
 * along something whose real length is known, which is how a plan is
 * actually calibrated. Each measurement then keeps the scale it was taken
 * under, so changing the calibration afterwards does not quietly restate
 * every number already on the page.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-shape-measurement-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, TranslatePipe],
  templateUrl: './pdf-shape-measurement-modal.component.html',
  styleUrls: ['./pdf-shape-measurement-modal.component.scss']
})
export class PdfShapeMeasurementModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private shapes = inject(PdfShapeMeasurementService);
  private modalCtrl = inject(ModalController);

  readonly units: MeasurementUnit[] = ['pt', 'mm', 'cm', 'm', 'in', 'ft'];

  scale: MeasurementScale = { screenPoints: 72, worldValue: 1, worldUnit: 'cm' };
  mode: 'distance' | 'area' = 'distance';
  knownLength = 1;

  measurements: MeasurementResult[] = [];

  get calibrationText(): string {
    return this.shapes.calibrationLabel(this.normalizedScale()).text;
  }

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    const doc = this.state.document;
    this.measurements = doc ? doc.pages.flatMap(page => page.measurements || []) : [];
  }

  /**
   * The scale as the engine should see it.
   *
   * A number input hands back a string when someone types into it, and an
   * empty field hands back null. Coercing here keeps the arithmetic out of
   * reach of `'72' / '1'`.
   */
  private normalizedScale(): MeasurementScale {
    const points = Number(this.scale.screenPoints);
    const value = Number(this.scale.worldValue);

    return {
      screenPoints: Number.isFinite(points) && points > 0 ? points : 72,
      worldValue: Number.isFinite(value) && value > 0 ? value : 1,
      worldUnit: this.scale.worldUnit
    };
  }

  /** Arms the canvas to take a measurement. */
  startMeasuring(): void {
    this.state.startPlacement('measure', {
      mode: this.mode,
      scale: this.normalizedScale()
    });
    this.modalCtrl.dismiss({ placing: 'measure' });
  }

  /** Arms the canvas to set the scale by drawing a known length. */
  calibrateByDrawing(): void {
    const known = Number(this.knownLength);
    if (!Number.isFinite(known) || known <= 0) return;

    this.state.startPlacement('measure', {
      mode: 'calibrate',
      scale: this.normalizedScale(),
      knownValue: known
    });
    this.modalCtrl.dismiss({ placing: 'calibrate' });
  }

  scaleTextFor(measurement: MeasurementResult): string {
    return measurement.scale ? this.shapes.calibrationLabel(measurement.scale).text : '';
  }

  jumpTo(measurement: MeasurementResult): void {
    this.state.setCurrentPage(measurement.pageNumber);
  }

  remove(measurement: MeasurementResult): void {
    this.state.setCurrentPage(measurement.pageNumber);
    this.state.deleteMeasurement(measurement.id);
    this.refresh();
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
