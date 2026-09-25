import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DocumentBridgeService } from './document-bridge.service';

/*
 * How one tool hands a document to another — scanner to OCR, PDF to
 * intelligence, and so on.
 *
 * The whole contract is that a handoff is one-shot. The sender sets a target
 * and navigates; the receiving page reads it once on init. If the read did not
 * clear it, the next visit to that page would silently reopen the previous
 * document — which is the worst kind of bug here, because the page looks like
 * it is working.
 */
describe('DocumentBridgeService', () => {
  let bridge: DocumentBridgeService;

  const file = () => new File(['x'], 'scan.pdf', { type: 'application/pdf' });

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    bridge = TestBed.inject(DocumentBridgeService);
  });

  it('starts with nothing pending on every channel', async () => {
    expect(await firstValueFrom(bridge.ocrTarget$)).toBeNull();
    expect(await firstValueFrom(bridge.validatorTarget$)).toBeNull();
    expect(await firstValueFrom(bridge.intelligenceTarget$)).toBeNull();
    expect(await firstValueFrom(bridge.qrTarget$)).toBeNull();
  });

  describe('the OCR channel', () => {
    it('carries the document and its origin', () => {
      const doc = { file: file(), source: 'scanner' as const, metadata: { pages: 3 } };

      bridge.setOcrTarget(doc);

      expect(bridge.getOcrTarget()).toBe(doc);
    });

    it('clears on read, so a second visit starts empty', () => {
      bridge.setOcrTarget({ file: file(), source: 'scanner' });

      expect(bridge.getOcrTarget()).not.toBeNull();
      expect(bridge.getOcrTarget()).toBeNull();
    });

    it('tells a subscriber the handoff has been collected', async () => {
      bridge.setOcrTarget({ file: file(), source: 'pdf' });
      bridge.getOcrTarget();

      expect(await firstValueFrom(bridge.ocrTarget$)).toBeNull();
    });

    it('replaces an uncollected handoff rather than queueing', () => {
      const first = { file: file(), source: 'scanner' as const };
      const second = { file: file(), source: 'photo' as const };

      bridge.setOcrTarget(first);
      bridge.setOcrTarget(second);

      expect(bridge.getOcrTarget()).toBe(second);
      expect(bridge.getOcrTarget()).toBeNull();
    });
  });

  describe('every channel behaves the same way', () => {
    const channels: Array<[string, (v: any) => void, () => unknown]> = [
      ['validator', v => bridge.setValidatorTarget(v), () => bridge.getValidatorTarget()],
      ['intelligence', v => bridge.setIntelligenceTarget(v), () => bridge.getIntelligenceTarget()],
      ['qr', v => bridge.setQrTarget(v), () => bridge.getQrTarget()],
    ];

    it.each(channels)('%s: delivers once and then reads null', (_name, set, get) => {
      const payload = { file: file(), source: 'pdf' };

      set(payload);

      expect(get()).toBe(payload);
      expect(get()).toBeNull();
    });

    it.each(channels)('%s: accepts an explicit clear', (_name, set, get) => {
      set({ file: file() });
      set(null);

      expect(get()).toBeNull();
    });
  });

  it('keeps the four channels independent', () => {
    bridge.setOcrTarget({ file: file(), source: 'scanner' });
    bridge.setQrTarget({ file: file(), source: 'pdf' });

    bridge.getOcrTarget();

    // Collecting the OCR handoff must not consume the QR one.
    expect(bridge.getQrTarget()).not.toBeNull();
  });

  it('carries the validator preset and slot a caller asked for', () => {
    bridge.setValidatorTarget({ presetId: 'ssc-photo', slot: 'photo', file: file() });

    expect(bridge.getValidatorTarget()).toMatchObject({ presetId: 'ssc-photo', slot: 'photo' });
  });

  it('carries text as well as a file for intelligence', () => {
    bridge.setIntelligenceTarget({ text: 'extracted body', source: 'ocr' });

    expect(bridge.getIntelligenceTarget()).toMatchObject({ text: 'extracted body', source: 'ocr' });
  });
});
