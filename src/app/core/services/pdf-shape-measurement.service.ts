import { Injectable } from '@angular/core';
import {
  CalibrationLabel,
  MeasurementResult,
  MeasurementScale,
  MeasurementUnit,
  StrokeSnapResult
} from '../models/editor-features.types';
import { Point, Rect } from '../models/pdf-editor.types';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

/** Points per world unit, for the units the calibration offers. */
const POINTS_PER_UNIT: Record<MeasurementUnit, number> = {
  pt: 1,
  in: 72,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  m: (72 / 2.54) * 100,
  ft: 72 * 12
};

/**
 * K5 — Snapping drawn strokes, and measuring against a scale.
 *
 * Both halves are opt-in by design. Snapping is a judgement about what
 * someone meant to draw, and a tool that straightens a signature or turns a
 * circled word into a perfect ellipse against the user's intent is worse
 * than one that does nothing. So a stroke is snapped only when the geometry
 * is clearly one shape, and an ambiguous stroke stays exactly as it was
 * drawn — `recognizeStroke` returning `raw` is a correct answer, not a
 * failure to classify.
 *
 * Measurement is arithmetic against a calibration the user sets and can see:
 * `screenPoints` of the page stand for `worldValue` of `worldUnit`. The
 * calibration travels with each result so a measurement taken under one
 * scale is not silently reinterpreted under another.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfShapeMeasurementService {
  // ════════════════════════════════════════════════════════════════════
  // Shape recognition
  // ════════════════════════════════════════════════════════════════════

  /**
   * Decides what a drawn stroke was meant to be.
   *
   * The tests the stroke has to pass, in order:
   *
   *   1. **Straight.** The direct start-to-end distance divided by the path
   *      length is 1 for a ruler-straight line and drops fast as the stroke
   *      wanders. Above 0.9 it is a line; whether it is an arrow depends on
   *      a sharp turn in the last few samples, which is the arrowhead.
   *   2. **Closed.** The ends have to come back near each other relative to
   *      the stroke's own size — a fixed pixel threshold calls a large circle
   *      open and a small scribble closed.
   *   3. **Round or cornered.** A circle's samples sit at a near-constant
   *      distance from the centre; a rectangle's cluster on four edges with
   *      four corners between them. A closed stroke that is neither stays
   *      freehand.
   */
  recognizeStroke(points: Point[], snapEnabled = true): StrokeSnapResult {
    const safePoints = points || [];

    if (!snapEnabled || safePoints.length < 3) {
      return this.rawResult(safePoints, 0);
    }

    const startPoint = safePoints[0];
    const endPoint = safePoints[safePoints.length - 1];
    const bounds = this.calculateBounds(safePoints);
    const pathLength = this.calculateStrokeLength(safePoints);
    const directDistance = this.distance(startPoint, endPoint);
    const diagonal = Math.hypot(bounds.width, bounds.height);

    /* Too small to be anything but a tap. */
    if (diagonal < 12 || pathLength < 12) return this.rawResult(safePoints, 0);

    /*
     * The arrowhead is looked for before straightness is judged, and the
     * judgement then excludes it. A drawn arrow is a straight shaft with a
     * barb doubled back at the end: measured whole, its straightness lands
     * around 0.85, under any threshold a line has to clear, so an arrow
     * tested as one stroke is never recognised as either.
     */
    const barb = this.findArrowBarb(safePoints);
    const shaft = barb ? safePoints.slice(0, barb.startIndex + 1) : safePoints;
    const shaftLength = barb ? this.calculateStrokeLength(shaft) : pathLength;
    const shaftDirect = barb
      ? this.distance(shaft[0], shaft[shaft.length - 1])
      : directDistance;
    const straightness = shaftLength > 0 ? shaftDirect / shaftLength : 0;

    if (straightness > 0.9 && shaftDirect > 18) {
      return {
        detected: true,
        type: barb ? 'arrow' : 'line',
        confidence: Math.min(0.99, straightness),
        bounds,
        startPoint,
        endPoint: barb ? shaft[shaft.length - 1] : endPoint,
        snappedPoints: [startPoint, barb ? shaft[shaft.length - 1] : endPoint]
      };
    }

    /* Closed relative to the stroke's size, not to a fixed pixel count. */
    const isClosed = directDistance < Math.max(14, diagonal * 0.25);
    if (!isClosed) return this.rawResult(safePoints, 0.2);

    const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const radii = safePoints.map(point => this.distance(point, centre));
    const meanRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;

    if (meanRadius < 6) return this.rawResult(safePoints, 0.2);

    const variance =
      radii.reduce((sum, radius) => sum + Math.abs(radius - meanRadius), 0) /
      (radii.length * meanRadius);
    const aspect = Math.min(bounds.width, bounds.height) / Math.max(bounds.width, bounds.height);

    const cornerCount = this.countCorners(safePoints, true);

    /*
     * Order matters: a rounded rectangle passes the radius test loosely and
     * the corner test exactly, so corners are checked first when there are
     * four of them.
     */
    if (cornerCount === 4 && aspect > 0.18 && this.hugsPerimeter(safePoints, bounds)) {
      return {
        detected: true,
        type: 'rectangle',
        confidence: 0.9,
        bounds,
        startPoint,
        endPoint,
        snappedPoints: [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
          { x: bounds.x, y: bounds.y + bounds.height }
        ]
      };
    }

    if (variance < 0.16 && aspect > 0.65 && cornerCount <= 1) {
      return {
        detected: true,
        type: 'circle',
        confidence: Math.min(0.99, 1 - variance),
        bounds,
        startPoint,
        endPoint
      };
    }

    return this.rawResult(safePoints, 0.2);
  }

  private rawResult(points: Point[], confidence: number): StrokeSnapResult {
    return {
      detected: false,
      type: 'raw',
      confidence,
      bounds: this.calculateBounds(points),
      startPoint: points[0] || { x: 0, y: 0 },
      endPoint: points[points.length - 1] || { x: 0, y: 0 },
      snappedPoints: points
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Measurement
  // ════════════════════════════════════════════════════════════════════

  /** "72 pt = 1 m", which is what the calibration row shows. */
  calibrationLabel(scale: MeasurementScale): CalibrationLabel {
    const points = this.round(scale.screenPoints, 2);
    const value = this.round(scale.worldValue, 4);
    return {
      screenPoints: points,
      worldValue: value,
      worldUnit: scale.worldUnit,
      text: `${points} pt = ${value} ${scale.worldUnit}`
    };
  }

  /**
   * A calibration derived from dragging across something of known length.
   *
   * This is how a plan is actually calibrated: drag along the drawing's own
   * scale bar, say what it represents, and every later measurement follows.
   */
  calibrateFromReference(
    from: Point,
    to: Point,
    knownValue: number,
    unit: MeasurementUnit
  ): MeasurementScale {
    const measured = this.distance(from, to);
    if (measured < 1 || !(knownValue > 0)) {
      /* A degenerate drag leaves the scale at 1:1, which is the identity
       * rather than a division by something near zero. */
      return { screenPoints: POINTS_PER_UNIT[unit], worldValue: 1, worldUnit: unit };
    }
    return { screenPoints: measured, worldValue: knownValue, worldUnit: unit };
  }

  /** A 1:1 scale in the given unit — one unit of paper is one unit of world. */
  identityScale(unit: MeasurementUnit): MeasurementScale {
    return { screenPoints: POINTS_PER_UNIT[unit], worldValue: 1, worldUnit: unit };
  }

  measureDistance(
    p1: Point,
    p2: Point,
    scale: MeasurementScale,
    pageNumber = 1
  ): MeasurementResult {
    const value = this.round(this.distance(p1, p2) * this.unitsPerPoint(scale), 2);

    return {
      id: generateId(),
      type: 'distance',
      points: [p1, p2],
      value,
      unit: scale.worldUnit,
      formattedString: `${value} ${scale.worldUnit}`,
      pageNumber,
      scale: { ...scale }
    };
  }

  /** The polygon's area by the shoelace formula, in world units squared. */
  measureArea(
    polygonPoints: Point[],
    scale: MeasurementScale,
    pageNumber = 1
  ): MeasurementResult {
    const points = polygonPoints || [];
    let areaInPoints = 0;

    /* Fewer than three vertices enclose nothing; the loop would return 0
     * anyway, and saying so here keeps the intent readable. */
    if (points.length >= 3) {
      for (let i = 0; i < points.length; i++) {
        const next = points[(i + 1) % points.length];
        areaInPoints += points[i].x * next.y - next.x * points[i].y;
      }
      areaInPoints = Math.abs(areaInPoints) / 2;
    }

    const perUnit = this.unitsPerPoint(scale);
    const value = this.round(areaInPoints * perUnit * perUnit, 2);

    return {
      id: generateId(),
      type: 'area',
      points,
      value,
      unit: scale.worldUnit,
      formattedString: `${value} sq ${scale.worldUnit}`,
      pageNumber,
      scale: { ...scale }
    };
  }

  /** The total length along a path, for a multi-segment measurement. */
  calculateDistance(
    points: Point[],
    scale: MeasurementScale,
    pageNumber = 1
  ): MeasurementResult {
    const path = points || [];
    if (path.length < 2) {
      return this.measureDistance({ x: 0, y: 0 }, { x: 0, y: 0 }, scale, pageNumber);
    }

    const value = this.round(this.calculateStrokeLength(path) * this.unitsPerPoint(scale), 2);

    return {
      id: generateId(),
      type: 'distance',
      points: path,
      value,
      unit: scale.worldUnit,
      formattedString: `${value} ${scale.worldUnit}`,
      pageNumber,
      scale: { ...scale }
    };
  }

  calculateArea(
    polygonPoints: Point[],
    scale: MeasurementScale,
    pageNumber = 1
  ): MeasurementResult {
    return this.measureArea(polygonPoints, scale, pageNumber);
  }

  /** How many world units one page point represents. */
  private unitsPerPoint(scale: MeasurementScale): number {
    const points = scale.screenPoints > 0 ? scale.screenPoints : 72;
    const value = Number.isFinite(scale.worldValue) ? scale.worldValue : 1;
    return value / points;
  }

  // ════════════════════════════════════════════════════════════════════
  // Geometry
  // ════════════════════════════════════════════════════════════════════

  private distance(p1: Point, p2: Point): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  private calculateStrokeLength(points: Point[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += this.distance(points[i - 1], points[i]);
    }
    return length;
  }

  private calculateBounds(points: Point[]): Rect {
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    };
  }

  /**
   * Where an arrowhead starts, if the stroke ends in one.
   *
   * An arrowhead drawn in one stroke doubles back: somewhere near the end,
   * the direction turns sharply away from the shaft's and stays turned. The
   * index of that turn is what the caller needs, not just a yes — the shaft
   * has to be measured without the barb for its straightness to mean
   * anything.
   *
   * The search window is a fraction of the stroke rather than a fixed few
   * samples, because how many samples a gesture produces depends on how
   * fast it was drawn.
   */
  private findArrowBarb(points: Point[]): { startIndex: number } | null {
    if (points.length < 10) return null;

    const window = Math.max(2, Math.round(points.length * 0.1));
    /* The barb is at the end: only the last third is considered, and never
     * so far back that the shaft becomes shorter than the barb. */
    const earliest = Math.max(window * 2, Math.floor(points.length * 0.6));

    for (let i = points.length - 1 - window; i >= earliest; i--) {
      const before = points[i - window];
      const after = points[i + window];
      if (!before || !after) continue;

      const incoming = Math.atan2(points[i].y - before.y, points[i].x - before.x);
      const outgoing = Math.atan2(after.y - points[i].y, after.x - points[i].x);

      let turn = Math.abs(outgoing - incoming);
      if (turn > Math.PI) turn = Math.PI * 2 - turn;

      if (turn > 0.7) return { startIndex: i };
    }

    return null;
  }

  /**
   * How many sharp direction changes the stroke makes.
   *
   * Measured over a window rather than between neighbouring samples, where
   * hand jitter alone would register as a corner on every point. Corners
   * within a window of each other count once, so one drawn corner is one
   * corner.
   */
  private countCorners(points: Point[], isClosed = false): number {
    /*
     * A traced loop usually ends on its own first point. Left in, that
     * duplicate makes the seam corner appear twice — a hand-drawn rectangle
     * counted five corners and was recognised as neither a rectangle nor a
     * circle.
     */
    const ring =
      isClosed &&
      points.length > 2 &&
      this.distance(points[0], points[points.length - 1]) < 0.5
        ? points.slice(0, -1)
        : points;

    const count = ring.length;
    /*
     * The window is a fraction of the stroke so that hand jitter does not
     * register as a corner on every sample — but a stroke can also arrive
     * as a sparse polyline, four corner points and nothing between them,
     * from a fast gesture or from code. There the neighbours ARE the
     * corners, so the window drops to one rather than the guard below
     * rejecting the shape outright.
     */
    const window = count < 12 ? 1 : Math.max(2, Math.round(count * 0.08));
    if (count < 4) return 0;

    /*
     * A closed stroke is scanned as a ring. Scanning it as a list skips the
     * seam where the stroke met its own start, which on a hand-drawn
     * rectangle is one of the four corners.
     */
    const at = (index: number): Point | undefined =>
      isClosed ? ring[((index % count) + count) % count] : ring[index];

    const from = isClosed ? 0 : window;
    const to = isClosed ? count - 1 : count - window - 1;

    const cornerIndices: number[] = [];

    for (let i = from; i <= to; i++) {
      const before = at(i - window);
      const after = at(i + window);
      if (!before || !after) continue;

      const incoming = Math.atan2(ring[i].y - before.y, ring[i].x - before.x);
      const outgoing = Math.atan2(after.y - ring[i].y, after.x - ring[i].x);

      let turn = Math.abs(outgoing - incoming);
      if (turn > Math.PI) turn = Math.PI * 2 - turn;
      if (turn <= 1.0) continue;

      const previous = cornerIndices[cornerIndices.length - 1];
      if (previous !== undefined && i - previous < window) continue;

      cornerIndices.push(i);
    }

    /* One drawn corner sitting across the seam is one corner, not two. */
    if (
      isClosed &&
      cornerIndices.length > 1 &&
      count - cornerIndices[cornerIndices.length - 1] + cornerIndices[0] < window
    ) {
      cornerIndices.pop();
    }

    return cornerIndices.length;
  }

  /** Whether most samples lie along the bounding box's edges. */
  private hugsPerimeter(points: Point[], bounds: Rect): boolean {
    const threshold = Math.max(6, (bounds.width + bounds.height) * 0.06);
    let hits = 0;

    for (const point of points) {
      const nearVertical =
        Math.abs(point.x - bounds.x) < threshold ||
        Math.abs(point.x - (bounds.x + bounds.width)) < threshold;
      const nearHorizontal =
        Math.abs(point.y - bounds.y) < threshold ||
        Math.abs(point.y - (bounds.y + bounds.height)) < threshold;

      if (nearVertical || nearHorizontal) hits++;
    }

    return hits / points.length > 0.8;
  }

  private round(value: number, places: number): number {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  }
}
