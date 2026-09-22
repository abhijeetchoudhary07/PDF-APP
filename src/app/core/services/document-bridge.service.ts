import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface BridgeDocument {
  file: File;
  source: 'scanner' | 'pdf' | 'photo' | 'validator' | 'custom';
  metadata?: Record<string, any>;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentBridgeService {
  private ocrTargetSubject = new BehaviorSubject<BridgeDocument | null>(null);
  public ocrTarget$ = this.ocrTargetSubject.asObservable();

  private validatorTargetSubject = new BehaviorSubject<{ presetId?: string; file?: File; slot?: string } | null>(null);
  public validatorTarget$ = this.validatorTargetSubject.asObservable();

  private intelligenceTargetSubject = new BehaviorSubject<{ file?: File; text?: string; source?: string } | null>(null);
  public intelligenceTarget$ = this.intelligenceTargetSubject.asObservable();

  private qrTargetSubject = new BehaviorSubject<{ file?: File; source?: string } | null>(null);
  public qrTarget$ = this.qrTargetSubject.asObservable();

  setOcrTarget(doc: BridgeDocument | null): void {
    this.ocrTargetSubject.next(doc);
  }

  getOcrTarget(): BridgeDocument | null {
    const val = this.ocrTargetSubject.value;
    // Clear once retrieved to prevent stale reuse
    this.ocrTargetSubject.next(null);
    return val;
  }

  setValidatorTarget(target: { presetId?: string; file?: File; slot?: string } | null): void {
    this.validatorTargetSubject.next(target);
  }

  getValidatorTarget(): { presetId?: string; file?: File; slot?: string } | null {
    const val = this.validatorTargetSubject.value;
    this.validatorTargetSubject.next(null);
    return val;
  }

  setIntelligenceTarget(target: { file?: File; text?: string; source?: string } | null): void {
    this.intelligenceTargetSubject.next(target);
  }

  getIntelligenceTarget(): { file?: File; text?: string; source?: string } | null {
    const val = this.intelligenceTargetSubject.value;
    this.intelligenceTargetSubject.next(null);
    return val;
  }

  setQrTarget(target: { file?: File; source?: string } | null): void {
    this.qrTargetSubject.next(target);
  }

  getQrTarget(): { file?: File; source?: string } | null {
    const val = this.qrTargetSubject.value;
    this.qrTargetSubject.next(null);
    return val;
  }
}
