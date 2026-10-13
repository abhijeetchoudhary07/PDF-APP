import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-conversion-animation',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="conversion-anim-container"
      [class.is-success]="isSuccess"
      role="progressbar"
      [attr.aria-valuenow]="progress"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-label]="stageText">

      <!-- 1. SOURCE TO TARGET FORMAT TRANSFORMATION FLOW -->
      <div class="flow-header">
        <div class="format-node source-node">
          <div class="node-icon-box">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </div>
          <span class="node-label">{{ sourceFormat | uppercase }}</span>
        </div>

        <div class="flow-connector">
          <div class="flow-beam-track">
            <div class="flow-beam-pulse"></div>
            <div class="flow-particles">
              <span class="particle p1"></span>
              <span class="particle p2"></span>
              <span class="particle p3"></span>
            </div>
          </div>
          <div class="flow-center-icon">
            @if (!isSuccess) {
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none" class="spin-icon">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
                <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            } @else {
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="3" fill="none" class="check-center-icon">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            }
          </div>
        </div>

        <div class="format-node target-node" [class.target-ready]="isSuccess">
          <div class="node-icon-box">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
          </div>
          <span class="node-label">{{ targetFormat | uppercase }}</span>
        </div>
      </div>

      <!-- 2. SCANNING BEAM & DOCUMENT VISUALIZATION -->
      <div class="visual-stage">
        @if (!isSuccess) {
          <!-- Document Card with Scanning Laser Beam -->
          <div class="scan-doc-card">
            <div class="ambient-glow"></div>
            <div class="laser-beam"></div>
            <div class="doc-lines-preview">
              <div class="doc-line line-title"></div>
              <div class="doc-line line-full"></div>
              <div class="doc-line line-half"></div>
              <div class="doc-grid-preview">
                <span class="grid-cell"></span>
                <span class="grid-cell"></span>
                <span class="grid-cell"></span>
              </div>
              <div class="doc-line line-full"></div>
              <div class="doc-line line-threequarter"></div>
            </div>
          </div>
        } @else {
          <!-- Success Celebration Checkmark -->
          <div class="success-burst-box">
            <div class="celebration-particles">
              <span class="spark s1"></span>
              <span class="spark s2"></span>
              <span class="spark s3"></span>
              <span class="spark s4"></span>
            </div>
            <div class="success-check-circle">
              <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="3" fill="none" class="success-check-svg">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          </div>
        }

        <!-- Radial Progress Ring & Percentage -->
        <div class="radial-progress-wrap">
          <svg class="radial-svg" viewBox="0 0 100 100">
            <circle class="radial-bg" cx="50" cy="50" r="42"></circle>
            <circle
              class="radial-indicator"
              cx="50"
              cy="50"
              r="42"
              [style.stroke-dasharray]="circumference"
              [style.stroke-dashoffset]="dashOffset">
            </circle>
          </svg>
          <div class="radial-content">
            @if (!isSuccess) {
              <span class="radial-percent">{{ progress }}%</span>
            } @else {
              <span class="radial-percent success-text">100%</span>
            }
          </div>
        </div>
      </div>

      <!-- 3. STAGE FEEDBACK & REAL-TIME STATUS -->
      <div class="status-content">
        <h3 class="status-stage-title">
          @if (!isSuccess) {
            {{ stageText || 'Converting file...' }}
          } @else {
            {{ successTitle || 'Conversion Completed Successfully!' }}
          }
        </h3>

        @if (fileName) {
          <div class="file-name-pill" [title]="fileName">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
            <span class="file-name-text">{{ fileName }}</span>
          </div>
        }

        @if (message && !isSuccess) {
          <p class="status-submessage">{{ message }}</p>
        } @else if (isSuccess) {
          <p class="status-submessage success-submessage">Your document has been transformed and is ready for download.</p>
        }

        <!-- 4. STEP PROGRESSION TRACKER -->
        <div class="steps-tracker">
          <div class="step-pill" [class.step-active]="stepIndex === 1" [class.step-done]="stepIndex > 1 || isSuccess">
            <span class="step-dot"></span>
            <span class="step-name">Reading File</span>
          </div>
          <span class="step-divider">&bull;</span>
          <div class="step-pill" [class.step-active]="stepIndex === 2" [class.step-done]="stepIndex > 2 || isSuccess">
            <span class="step-dot"></span>
            <span class="step-name">Transforming</span>
          </div>
          <span class="step-divider">&bull;</span>
          <div class="step-pill" [class.step-active]="stepIndex === 3" [class.step-done]="isSuccess">
            <span class="step-dot"></span>
            <span class="step-name">Finalizing</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .conversion-anim-container {
      background: linear-gradient(145deg, var(--color-surface, #ffffff), var(--color-surface-hover, #f8fafc));
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-xl, 16px);
      padding: 24px 20px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
      text-align: center;
      position: relative;
      overflow: hidden;
      transition: border-color var(--transition-normal, 250ms), box-shadow var(--transition-normal, 250ms);
    }

    .conversion-anim-container.is-success {
      border-color: rgba(34, 197, 94, 0.4);
      box-shadow: 0 12px 28px -6px rgba(34, 197, 94, 0.12);
    }

    /* 1. FLOW HEADER */
    .flow-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 20px;
    }

    .format-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .node-icon-box {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md, 10px);
      background: var(--color-surface, #ffffff);
      border: 1.5px solid var(--color-border, #cbd5e1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text, #1e293b);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
      transition: transform var(--transition-fast, 150ms), border-color var(--transition-fast, 150ms);
    }

    .source-node .node-icon-box {
      color: var(--color-primary, #2563eb);
      border-color: var(--color-primary-soft, #bfdbfe);
      background: rgba(37, 99, 235, 0.05);
    }

    .target-node .node-icon-box {
      color: var(--color-text-secondary, #64748b);
    }

    .target-node.target-ready .node-icon-box {
      color: #16a34a;
      border-color: #86efac;
      background: rgba(34, 197, 94, 0.08);
      transform: scale(1.05);
    }

    .node-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary, #475569);
    }

    /* Connector & Pulsing Beam */
    .flow-connector {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      width: 100px;
      margin: 0 4px;
    }

    .flow-beam-track {
      position: absolute;
      width: 100%;
      height: 3px;
      background: var(--color-border, #e2e8f0);
      border-radius: 999px;
      overflow: hidden;
    }

    .flow-beam-pulse {
      position: absolute;
      top: 0;
      left: -50%;
      width: 50%;
      height: 100%;
      background: linear-gradient(90deg, transparent, var(--color-primary, #2563eb), transparent);
      animation: beam-flow-slide 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    @keyframes beam-flow-slide {
      0% { left: -50%; }
      100% { left: 100%; }
    }

    .flow-particles {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
    }

    .particle {
      position: absolute;
      top: 0;
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: var(--color-primary, #2563eb);
      opacity: 0.8;
      animation: particle-glide 2s infinite linear;
    }

    .particle.p1 { animation-delay: 0s; }
    .particle.p2 { animation-delay: 0.6s; }
    .particle.p3 { animation-delay: 1.2s; }

    @keyframes particle-glide {
      0% { left: 0%; opacity: 0; }
      20% { opacity: 1; }
      80% { opacity: 1; }
      100% { left: 100%; opacity: 0; }
    }

    .flow-center-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--color-surface, #ffffff);
      border: 1px solid var(--color-border, #cbd5e1);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
      color: var(--color-primary, #2563eb);
    }

    .spin-icon {
      animation: spin-clockwise 2s linear infinite;
    }

    .check-center-icon {
      color: #16a34a;
      animation: pop-bounce 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }

    @keyframes spin-clockwise {
      100% { transform: rotate(360deg); }
    }

    /* 2. VISUAL STAGE & SCANNING BEAM */
    .visual-stage {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      margin: 16px 0;
      flex-wrap: wrap;
    }

    .scan-doc-card {
      position: relative;
      width: 100px;
      height: 120px;
      background: var(--color-surface, #ffffff);
      border: 1px solid var(--color-border, #cbd5e1);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
      padding: 12px 10px;
      overflow: hidden;
    }

    .ambient-glow {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.08), transparent 70%);
      pointer-events: none;
    }

    .laser-beam {
      position: absolute;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, #38bdf8, var(--color-primary, #2563eb), #38bdf8, transparent);
      box-shadow: 0 0 8px 2px rgba(56, 189, 248, 0.6);
      z-index: 3;
      top: 10%;
      animation: laser-sweep 2.4s ease-in-out infinite alternate;
    }

    @keyframes laser-sweep {
      0% { top: 6%; }
      100% { top: 88%; }
    }

    .doc-lines-preview {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .doc-line {
      height: 5px;
      border-radius: 4px;
      background: var(--color-border, #e2e8f0);
    }

    .line-title {
      width: 50%;
      background: var(--color-primary-soft, #bfdbfe);
    }

    .line-full { width: 100%; }
    .line-half { width: 55%; }
    .line-threequarter { width: 75%; }

    .doc-grid-preview {
      display: flex;
      gap: 4px;
      margin: 2px 0;
    }

    .grid-cell {
      flex: 1;
      height: 10px;
      background: rgba(226, 232, 240, 0.6);
      border-radius: 2px;
      border: 1px dashed var(--color-border, #cbd5e1);
    }

    /* Success Burst */
    .success-burst-box {
      position: relative;
      width: 100px;
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .success-check-circle {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: linear-gradient(135deg, #22c55e, #16a34a);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 20px rgba(34, 197, 94, 0.35);
      animation: pop-bounce 550ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }

    .success-check-svg {
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
      animation: stroke-draw 450ms ease-out 250ms forwards;
    }

    @keyframes pop-bounce {
      0% { transform: scale(0); opacity: 0; }
      70% { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }

    @keyframes stroke-draw {
      100% { stroke-dashoffset: 0; }
    }

    /* Celebration Sparks */
    .celebration-particles {
      position: absolute;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .spark {
      position: absolute;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #f59e0b;
      opacity: 0;
      animation: spark-fly 600ms ease-out 300ms forwards;
    }

    .spark.s1 { top: 20%; left: 20%; background: #38bdf8; }
    .spark.s2 { top: 15%; right: 20%; background: #ec4899; }
    .spark.s3 { bottom: 20%; left: 15%; background: #22c55e; }
    .spark.s4 { bottom: 15%; right: 15%; background: #eab308; }

    @keyframes spark-fly {
      0% { transform: scale(0.2); opacity: 0; }
      50% { opacity: 1; }
      100% { transform: scale(1.4) translate(var(--tx, 0), var(--ty, 0)); opacity: 0; }
    }

    /* Radial Progress Indicator */
    .radial-progress-wrap {
      position: relative;
      width: 88px;
      height: 88px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .radial-svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .radial-bg {
      fill: none;
      stroke: var(--color-border, #e2e8f0);
      stroke-width: 6;
    }

    .radial-indicator {
      fill: none;
      stroke: var(--color-primary, #2563eb);
      stroke-width: 6;
      stroke-linecap: round;
      transition: stroke-dashoffset 200ms ease-out, stroke var(--transition-normal, 250ms);
    }

    .is-success .radial-indicator {
      stroke: #22c55e;
    }

    .radial-content {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .radial-percent {
      font-size: 16px;
      font-weight: 700;
      color: var(--color-text, #0f172a);
    }

    .success-text {
      color: #16a34a;
    }

    /* 3. STATUS CONTENT */
    .status-content {
      margin-top: 14px;
    }

    .status-stage-title {
      font-size: var(--font-h3, 17px);
      font-weight: 700;
      color: var(--color-text, #0f172a);
      margin: 0 0 6px 0;
    }

    .file-name-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--color-background-subtle, #f1f5f9);
      border: 1px solid var(--color-border, #cbd5e1);
      color: var(--color-text-secondary, #475569);
      font-size: 12px;
      max-width: 260px;
      margin: 4px 0 8px 0;
    }

    .file-name-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-submessage {
      font-size: 13px;
      color: var(--color-text-secondary, #64748b);
      margin: 0 0 14px 0;
    }

    .success-submessage {
      color: #15803d;
      font-weight: 500;
    }

    /* 4. STEP PROGRESSION TRACKER */
    .steps-tracker {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }

    .step-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-muted, #94a3b8);
      transition: color var(--transition-fast, 150ms);
    }

    .step-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--color-border, #cbd5e1);
      transition: background-color var(--transition-fast, 150ms);
    }

    .step-pill.step-active {
      color: var(--color-primary, #2563eb);
    }

    .step-pill.step-active .step-dot {
      background: var(--color-primary, #2563eb);
      box-shadow: 0 0 6px rgba(37, 99, 235, 0.6);
      animation: pulse-dot 1.2s infinite alternate;
    }

    .step-pill.step-done {
      color: #16a34a;
    }

    .step-pill.step-done .step-dot {
      background: #22c55e;
    }

    .step-divider {
      color: var(--color-border, #cbd5e1);
      font-size: 10px;
    }

    @keyframes pulse-dot {
      0% { transform: scale(0.9); opacity: 0.7; }
      100% { transform: scale(1.3); opacity: 1; }
    }

    /* ACCESSIBILITY: PREFERS REDUCED MOTION */
    @media (prefers-reduced-motion: reduce) {
      .spin-icon,
      .flow-beam-pulse,
      .particle,
      .laser-beam,
      .step-pill.step-active .step-dot {
        animation: none !important;
      }
      .success-check-circle,
      .check-center-icon {
        transform: none !important;
        animation: none !important;
      }
    }

    @media (max-width: 480px) {
      .conversion-anim-container {
        padding: 18px 12px;
      }
      .visual-stage {
        gap: 16px;
      }
      .flow-connector {
        width: 60px;
      }
    }
  `]
})
export class AppConversionAnimationComponent implements OnChanges {
  @Input() progress = 0;
  @Input() stageText = 'Processing document...';
  @Input() message?: string;
  @Input() sourceFormat = 'FILE';
  @Input() targetFormat = 'PDF';
  @Input() fileName?: string;
  @Input() isSuccess = false;
  @Input() successTitle = 'Conversion Completed!';

  @Output() completed = new EventEmitter<void>();

  radius = 42;
  circumference = 2 * Math.PI * this.radius;
  dashOffset = this.circumference;
  stepIndex = 1;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['progress'] || changes['isSuccess']) {
      this.updateProgressState();
    }
  }

  private updateProgressState(): void {
    const p = Math.max(0, Math.min(100, this.progress || 0));
    this.dashOffset = this.circumference - (p / 100) * this.circumference;

    if (this.isSuccess || p >= 98) {
      this.stepIndex = 3;
      this.completed.emit();
    } else if (p >= 50) {
      this.stepIndex = 2;
    } else {
      this.stepIndex = 1;
    }
  }
}
