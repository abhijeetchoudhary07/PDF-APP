import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfShapeMeasurementService } from '../../../../core/services/pdf-shape-measurement.service';
import {
  MeasurementScale,
  MeasurementUnit,
  MeasurementResult
} from '../../../../core/models/editor-features.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-shape-measurement-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  template: `
    <div class="modal-wrapper">
      <div class="modal-header">
        <div class="header-title">
          <app-icon name="ruler"></app-icon>
          <h3>Shape & Measurement Tools</h3>
        </div>
        <button class="close-btn" (click)="dismiss()" aria-label="Close">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="modal-body">
        <!-- PEN SHAPE RECOGNITION SETTINGS -->
        <div class="card">
          <div class="card-header-row">
            <div>
              <h4 class="card-title">Pen Shape Recognition</h4>
              <p class="card-subtitle">Automatically snap drawn strokes to neat geometric shapes</p>
            </div>
            <label class="switch">
              <input type="checkbox" [(ngModel)]="shapeSnapEnabled" />
              <span class="slider round"></span>
            </label>
          </div>
          <div class="info-tip">
            Recognizes lines, arrows, rectangles, and circles when stroke is geometric; keeps raw stroke for signatures and freehand sketches.
          </div>
        </div>

        <!-- SCALE CALIBRATION CARD -->
        <div class="card">
          <h4 class="card-title">Measurement Scale Calibration</h4>
          <p class="card-subtitle">Set real-world distance per PDF points (72 pt = 1 inch)</p>

          <div class="scale-row">
            <div class="scale-col">
              <label class="field-label">Screen Points</label>
              <input
                type="number"
                [(ngModel)]="scale.screenPoints"
                [min]="1"
                class="text-input"
              />
            </div>
            <div class="scale-equals">=</div>
            <div class="scale-col">
              <label class="field-label">Real Value</label>
              <input
                type="number"
                [(ngModel)]="scale.worldValue"
                [min]="0.01"
                step="0.1"
                class="text-input"
              />
            </div>
            <div class="scale-col unit-col">
              <label class="field-label">Unit</label>
              <select [(ngModel)]="scale.worldUnit" class="select-input">
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
                <option value="in">in</option>
                <option value="ft">ft</option>
              </select>
            </div>
          </div>
        </div>

        <!-- QUICK MEASURE CREATOR -->
        <div class="card">
          <h4 class="card-title">Add Measurement Callout</h4>
          <div class="type-toggle">
            <button
              class="type-btn"
              [class.active]="measureType === 'distance'"
              (click)="measureType = 'distance'"
            >
              Distance
            </button>
            <button
              class="type-btn"
              [class.active]="measureType === 'area'"
              (click)="measureType = 'area'"
            >
              Area
            </button>
          </div>

          <div class="measure-inputs">
            @if (measureType === 'distance') {
              <div class="coord-row">
                <input type="number" [(ngModel)]="distLengthPt" placeholder="Length in pt" class="text-input" />
                <button class="primary-btn" (click)="addSampleDistance()">Add Distance Callout</button>
              </div>
            } @else {
              <div class="coord-row">
                <input type="number" [(ngModel)]="areaWidthPt" placeholder="Width pt" class="text-input" />
                <input type="number" [(ngModel)]="areaHeightPt" placeholder="Height pt" class="text-input" />
                <button class="primary-btn" (click)="addSampleArea()">Add Area Callout</button>
              </div>
            }
          </div>
        </div>

        <!-- EXISTING MEASUREMENTS -->
        <div class="measure-list-section">
          <h4 class="section-title">Measurements ({{ allMeasurements.length }})</h4>
          @if (allMeasurements.length === 0) {
            <div class="empty-state">No measurements added yet.</div>
          }
          <div class="measure-list">
            @for (m of allMeasurements; track m.id) {
              <div class="measure-item">
                <div class="m-info">
                  <span class="m-badge">Page {{ m.pageNumber }}</span>
                  <span class="m-type">{{ m.type }}</span>
                  <strong class="m-val">{{ m.formattedString }}</strong>
                </div>
                <button class="delete-btn" (click)="deleteMeasure(m)" aria-label="Delete measurement">
                  <app-icon name="trash"></app-icon>
                </button>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      background: #ffffff;
    }
    .modal-wrapper {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #ffffff;
      color: var(--text-primary, #1e293b);
      font-family: inherit;
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: #ffffff;
      border-bottom: 1px solid var(--border-color, #e2e8f0);
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 10px;
      h3 { margin: 0; font-size: 1.15rem; font-weight: 700; }
      app-icon { font-size: 1.25rem; color: #2563eb; }
    }
    .close-btn {
      background: transparent;
      border: none;
      padding: 8px;
      cursor: pointer;
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
    }
    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 16px max(32px, env(safe-area-inset-bottom, 32px)) 16px;
      -webkit-overflow-scrolling: touch;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .card {
      background: var(--bg-subtle, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .card-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .card-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
    .card-subtitle { margin: 2px 0 0; font-size: 0.78rem; color: #64748b; }
    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 26px;
      flex-shrink: 0;
      input { opacity: 0; width: 0; height: 0; }
    }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #cbd5e1;
      transition: .2s;
      border-radius: 34px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .2s;
      border-radius: 50%;
    }
    input:checked + .slider { background-color: #2563eb; }
    input:checked + .slider:before { transform: translateX(18px); }
    .info-tip {
      font-size: 0.8rem;
      background: #eff6ff;
      color: #1e40af;
      padding: 8px 10px;
      border-radius: 6px;
      line-height: 1.35;
    }
    .scale-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;

      @media (max-width: 360px) {
        flex-wrap: wrap;
        .scale-equals { display: none; }
        .scale-col, .unit-col { min-width: 45%; }
      }
    }
    .scale-col { flex: 1; }
    .unit-col { flex: 1.2; }
    .scale-equals {
      font-size: 1.2rem;
      font-weight: 700;
      color: #64748b;
      padding-bottom: 10px;
    }
    .field-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      display: block;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .text-input, .select-input {
      width: 100%;
      min-height: 44px;
      padding: 8px 10px;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: 8px;
      background: var(--bg-surface, #ffffff);
      color: inherit;
      box-sizing: border-box;
      font-size: 0.9rem;
    }
    .type-toggle { display: flex; gap: 8px; }
    .type-btn {
      flex: 1;
      min-height: 44px;
      border: 1px solid var(--border-color, #cbd5e1);
      background: var(--bg-surface, #ffffff);
      border-radius: 8px;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
    }
    .type-btn.active {
      border-color: #2563eb;
      background: #eff6ff;
      color: #1d4ed8;
    }
    .coord-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .coord-row .text-input { flex: 1; min-width: 100px; }
    .primary-btn {
      min-height: 44px;
      padding: 8px 14px;
      border: none;
      border-radius: 8px;
      background: #2563eb;
      color: #ffffff;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
    }
    .section-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
    .empty-state {
      padding: 16px;
      text-align: center;
      color: #64748b;
      font-size: 0.88rem;
    }
    .measure-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 200px;
      overflow-y: auto;
    }
    .measure-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: var(--bg-surface, #ffffff);
      border-radius: 8px;
    }
    .m-info {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .m-badge {
      font-size: 0.72rem;
      font-weight: 700;
      background: #e2e8f0;
      color: #334155;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .m-type {
      font-size: 0.72rem;
      text-transform: uppercase;
      color: #64748b;
    }
    .m-val { font-size: 0.92rem; color: #1e293b; }
    .delete-btn {
      min-width: 44px;
      min-height: 44px;
      border: none;
      background: transparent;
      color: #ef4444;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
  `]
})
export class PdfShapeMeasurementModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private shapeMeasurementService = inject(PdfShapeMeasurementService);
  private modalCtrl = inject(ModalController);

  shapeSnapEnabled = true;
  scale: MeasurementScale = {
    screenPoints: 72,
    worldValue: 1,
    worldUnit: 'in'
  };

  measureType: 'distance' | 'area' = 'distance';
  distLengthPt = 144;
  areaWidthPt = 100;
  areaHeightPt = 80;

  allMeasurements: MeasurementResult[] = [];

  ngOnInit() {
    this.refreshMeasurements();
  }

  refreshMeasurements() {
    const doc = this.state.document;
    if (!doc) return;
    this.allMeasurements = doc.pages.flatMap(p => p.measurements || []);
  }

  addSampleDistance() {
    const p1 = { x: 50, y: 150 };
    const p2 = { x: 50 + (+this.distLengthPt || 100), y: 150 };
    const res = this.shapeMeasurementService.calculateDistance([p1, p2], this.scale, this.state.currentPageNumber);
    this.state.addMeasurement(res);
    this.refreshMeasurements();
  }

  addSampleArea() {
    const w = +this.areaWidthPt || 100;
    const h = +this.areaHeightPt || 80;
    const points = [
      { x: 50, y: 200 },
      { x: 50 + w, y: 200 },
      { x: 50 + w, y: 200 + h },
      { x: 50, y: 200 + h }
    ];
    const res = this.shapeMeasurementService.calculateArea(points, this.scale, this.state.currentPageNumber);
    this.state.addMeasurement(res);
    this.refreshMeasurements();
  }

  deleteMeasure(m: MeasurementResult) {
    this.state.deleteMeasurement(m.id);
    this.refreshMeasurements();
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
