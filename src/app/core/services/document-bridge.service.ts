import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface BridgeDocument {
  file: File;
  source: 'scanner' | 'pdf' | 'photo' | 'validator' | 'custom';
  metadata?: Record<string, any>;
}

/** A document sent to the compressor from another tool, with a size to aim at. */
export interface CompressHandOff {
  file: File;
  /** The ceiling the sending tool was working to, in KB, when it had one. */
  suggestedTargetKB?: number;
  source?: string;
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

  private compressTargetSubject = new BehaviorSubject<CompressHandOff | null>(null);
  public compressTarget$ = this.compressTargetSubject.asObservable();

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

  /**
   * Hands a document to the PDF compressor.
   *
   * Added for the `max-size` split, which can find a single page that is over
   * the ceiling on its own: no split can bring that page down, so the screen
   * offers to carry it to the tool that can. The compressor behaves exactly as
   * before when nothing is set, which is every other way of arriving there.
   */
  setCompressTarget(target: CompressHandOff | null): void {
    this.compressTargetSubject.next(target);
  }

  getCompressTarget(): CompressHandOff | null {
    const val = this.compressTargetSubject.value;
    // Cleared once retrieved, so a later visit does not reopen a stale file.
    this.compressTargetSubject.next(null);
    return val;
  }

  private genericDocumentSubject = new BehaviorSubject<BridgeDocument | null>(null);
  public genericDocument$ = this.genericDocumentSubject.asObservable();

  setDocument(file: File, source: BridgeDocument['source'] = 'pdf', metadata?: Record<string, any>): void {
    this.genericDocumentSubject.next({ file, source, metadata });
  }

  consumeDocument(): BridgeDocument | null {
    const val = this.genericDocumentSubject.value;
    this.genericDocumentSubject.next(null);
    return val;
  }
}
