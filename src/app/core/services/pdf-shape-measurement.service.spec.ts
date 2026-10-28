import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PdfShapeMeasurementService } from './pdf-shape-measurement.service';
import { MeasurementScale } from '../models/editor-features.types';
import { Point } from '../models/pdf-editor.types';

/* ── Synthetic strokes, built the way a finger would produce them ───── */

/** Samples along a straight segment. */
function straightStroke(from: Point, to: Point, samples = 24): Point[] {
  return Array.from({ length: samples }, (_, i) => {
    const t = i / (samples - 1);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });
}

/** A straight shaft with a barb doubled back at the end. */
function arrowStroke(): Point[] {
  const shaft = straightStroke({ x: 20, y: 100 }, { x: 180, y: 100 }, 30);
  const barb = straightStroke({ x: 180, y: 100 }, { x: 160, y: 86 }, 8);
  return [...shaft, ...barb];
}

/** Samples around a circle, optionally squashed into an ellipse. */
function circleStroke(cx: number, cy: number, r: number, squash = 1, samples = 48): Point[] {
  return Array.from({ length: samples }, (_, i) => {
    const angle = (i / (samples - 1)) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * squash };
  });
}

/** Samples around a rectangle's perimeter, back to the start. */
function rectangleStroke(x: number, y: number, w: number, h: number, perSide = 14): Point[] {
  const corners: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y }
  ];

  const out: Point[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    out.push(...straightStroke(corners[i], corners[i + 1], perSide).slice(0, -1));
  }
  out.push(corners[corners.length - 1]);
  return out;
}

/** A closed loop that is neither round nor cornered: a deliberate scribble. */
function scribbleStroke(): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 60; i++) {
    const t = (i / 59) * Math.PI * 2;
    const wobble = 40 + Math.sin(t * 5) * 22 + Math.cos(t * 3) * 14;
    out.push({ x: 120 + Math.cos(t) * wobble, y: 120 + Math.sin(t) * wobble * 0.55 });
  }
  return out;
}

describe('PdfShapeMeasurementService (K5)', () => {
  let service: PdfShapeMeasurementService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfShapeMeasurementService);
  });

  describe('snapping decisions', () => {
    it('snaps a straight stroke to a line', () => {
      const result = service.recognizeStroke(straightStroke({ x: 20, y: 40 }, { x: 200, y: 44 }));

      expect(result.detected).toBe(true);
      expect(result.type).toBe('line');
      expect(result.snappedPoints).toHaveLength(2);
    });

    it('snaps a stroke that doubles back at the tip to an arrow', () => {
      const result = service.recognizeStroke(arrowStroke());

      expect(result.detected).toBe(true);
      expect(result.type).toBe('arrow');
    });

    it('snaps a round closed stroke to a circle', () => {
      const result = service.recognizeStroke(circleStroke(120, 120, 60));

      expect(result.detected).toBe(true);
      expect(result.type).toBe('circle');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('snaps a four-cornered closed stroke to a rectangle', () => {
      const result = service.recognizeStroke(rectangleStroke(40, 40, 160, 90));

      expect(result.detected).toBe(true);
      expect(result.type).toBe('rectangle');
      expect(result.snappedPoints).toHaveLength(4);
      expect(result.bounds.width).toBeCloseTo(160, 0);
      expect(result.bounds.height).toBeCloseTo(90, 0);
    });

    it('leaves a deliberately ambiguous stroke freehand', () => {
      const result = service.recognizeStroke(scribbleStroke());

      expect(result.detected).toBe(false);
      expect(result.type).toBe('raw');
      /* The raw samples come back untouched, so nothing is lost. */
      expect(result.snappedPoints).toHaveLength(60);
    });

    it('leaves a squashed loop freehand rather than calling it a circle', () => {
      const result = service.recognizeStroke(circleStroke(120, 120, 70, 0.25));

      expect(result.type).not.toBe('circle');
    });

    it('does nothing when snapping is switched off', () => {
      const stroke = rectangleStroke(40, 40, 160, 90);
      const result = service.recognizeStroke(stroke, false);

      expect(result.detected).toBe(false);
      expect(result.type).toBe('raw');
    });

    it('treats a tap and a two-point stroke as nothing', () => {
      expect(service.recognizeStroke([{ x: 10, y: 10 }]).type).toBe('raw');
      expect(service.recognizeStroke([]).type).toBe('raw');
      expect(service.recognizeStroke([{ x: 10, y: 10 }, { x: 11, y: 11 }]).type).toBe('raw');
    });

    it('treats a stroke too small to read as nothing', () => {
      const tiny = straightStroke({ x: 10, y: 10 }, { x: 14, y: 12 }, 10);

      expect(service.recognizeStroke(tiny).type).toBe('raw');
    });

    it('does not mistake a long open arc for a closed shape', () => {
      const halfCircle = Array.from({ length: 30 }, (_, i) => {
        const angle = (i / 29) * Math.PI;
        return { x: 120 + Math.cos(angle) * 70, y: 120 + Math.sin(angle) * 70 };
      });

      expect(service.recognizeStroke(halfCircle).detected).toBe(false);
    });
  });

  describe('calibration', () => {
    it('reads back as the text the calibration row shows', () => {
      const label = service.calibrationLabel({ screenPoints: 72, worldValue: 1, worldUnit: 'm' });

      expect(label.text).toBe('72 pt = 1 m');
    });

    it('builds a 1:1 scale per unit', () => {
      expect(service.identityScale('in')).toEqual({
        screenPoints: 72,
        worldValue: 1,
        worldUnit: 'in'
      });
      expect(service.identityScale('cm').screenPoints).toBeCloseTo(28.346, 2);
      expect(service.identityScale('mm').screenPoints).toBeCloseTo(2.835, 2);
    });

    it('derives a scale from dragging across a known length', () => {
      const scale = service.calibrateFromReference(
        { x: 100, y: 100 },
        { x: 244, y: 100 },
        2,
        'm'
      );

      expect(scale).toEqual({ screenPoints: 144, worldValue: 2, worldUnit: 'm' });

      /* And that scale measures the same drag back as 2 m. */
      const measured = service.measureDistance({ x: 0, y: 0 }, { x: 144, y: 0 }, scale);
      expect(measured.value).toBe(2);
    });

    it('falls back to 1:1 for a degenerate calibration drag', () => {
      expect(service.calibrateFromReference({ x: 10, y: 10 }, { x: 10, y: 10 }, 5, 'cm')).toEqual(
        service.identityScale('cm')
      );
      expect(service.calibrateFromReference({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 'cm')).toEqual(
        service.identityScale('cm')
      );
    });
  });

  describe('distance against a known scale', () => {
    const oneCmPerCm: MeasurementScale = { screenPoints: 72, worldValue: 1, worldUnit: 'in' };

    it('measures an inch of page as an inch', () => {
      const result = service.measureDistance({ x: 0, y: 0 }, { x: 72, y: 0 }, oneCmPerCm);

      expect(result.value).toBe(1);
      expect(result.formattedString).toBe('1 in');
      expect(result.type).toBe('distance');
    });

    it('measures a diagonal by its true length', () => {
      const result = service.measureDistance({ x: 0, y: 0 }, { x: 216, y: 288 }, oneCmPerCm);

      /* 3-4-5: 216 and 288 points are 3 and 4 inches, so 5. */
      expect(result.value).toBe(5);
    });

    it('applies a drawing scale where 1 cm of paper is 1 m of building', () => {
      const scale: MeasurementScale = {
        screenPoints: 72 / 2.54,
        worldValue: 1,
        worldUnit: 'm'
      };

      /* 5 cm of paper across. */
      const result = service.measureDistance({ x: 0, y: 0 }, { x: (72 / 2.54) * 5, y: 0 }, scale);

      expect(result.value).toBe(5);
      expect(result.unit).toBe('m');
    });

    it('sums a multi-segment path', () => {
      const result = service.calculateDistance(
        [
          { x: 0, y: 0 },
          { x: 72, y: 0 },
          { x: 72, y: 72 }
        ],
        oneCmPerCm
      );

      expect(result.value).toBe(2);
      expect(result.points).toHaveLength(3);
    });

    it('carries its calibration so it can be re-read later', () => {
      const result = service.measureDistance({ x: 0, y: 0 }, { x: 72, y: 0 }, oneCmPerCm);

      expect(result.scale).toEqual(oneCmPerCm);
    });

    it('records the page it was taken on', () => {
      expect(service.measureDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, oneCmPerCm, 4).pageNumber).toBe(
        4
      );
    });

    it('reports zero for a path with nothing in it', () => {
      expect(service.calculateDistance([], oneCmPerCm).value).toBe(0);
      expect(service.calculateDistance([{ x: 5, y: 5 }], oneCmPerCm).value).toBe(0);
    });
  });

  describe('area against a known scale', () => {
    const inches: MeasurementScale = { screenPoints: 72, worldValue: 1, worldUnit: 'in' };

    it('measures a 2 x 3 inch rectangle as 6 square inches', () => {
      const result = service.measureArea(
        [
          { x: 0, y: 0 },
          { x: 144, y: 0 },
          { x: 144, y: 216 },
          { x: 0, y: 216 }
        ],
        inches
      );

      expect(result.value).toBe(6);
      expect(result.formattedString).toBe('6 sq in');
    });

    it('gives the same answer whichever way round the polygon is wound', () => {
      const clockwise = [
        { x: 0, y: 0 },
        { x: 144, y: 0 },
        { x: 144, y: 72 },
        { x: 0, y: 72 }
      ];

      expect(service.measureArea(clockwise, inches).value).toBe(
        service.measureArea([...clockwise].reverse(), inches).value
      );
    });

    it('scales area by the square of the linear scale', () => {
      /* 1 cm of paper is 1 m, so 1 sq cm of paper is 1 sq m. */
      const scale: MeasurementScale = { screenPoints: 72 / 2.54, worldValue: 1, worldUnit: 'm' };
      const side = (72 / 2.54) * 3;

      const result = service.measureArea(
        [
          { x: 0, y: 0 },
          { x: side, y: 0 },
          { x: side, y: side },
          { x: 0, y: side }
        ],
        scale
      );

      expect(result.value).toBeCloseTo(9, 1);
    });

    it('measures a triangle as half its bounding rectangle', () => {
      const result = service.measureArea(
        [
          { x: 0, y: 0 },
          { x: 144, y: 0 },
          { x: 0, y: 144 }
        ],
        inches
      );

      expect(result.value).toBe(2);
    });

    it('reports zero for fewer than three vertices', () => {
      expect(service.measureArea([], inches).value).toBe(0);
      expect(service.measureArea([{ x: 0, y: 0 }, { x: 10, y: 0 }], inches).value).toBe(0);
    });

    it('survives a scale with a zero or missing span', () => {
      const result = service.measureArea(
        [
          { x: 0, y: 0 },
          { x: 72, y: 0 },
          { x: 72, y: 72 }
        ],
        { screenPoints: 0, worldValue: 1, worldUnit: 'in' }
      );

      expect(Number.isFinite(result.value)).toBe(true);
    });
  });
});
