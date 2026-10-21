import { Injectable } from '@angular/core';
import {
  StrokeSnapResult,
  SnappedShapeType,
  MeasurementScale,
  MeasurementResult,
  MeasurementUnit
} from '../models/editor-features.types';
import { Point, Rect } from '../models/pdf-editor.types';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

@Injectable({
  providedIn: 'root'
})
export class PdfShapeMeasurementService {
  constructor() {}

  /**
   * Evaluates a drawn stroke of Points and determines whether to snap
   * it to a geometric line, arrow, circle, rectangle, or keep raw.
   */
  recognizeStroke(points: Point[], snapEnabled: boolean = true): StrokeSnapResult {
    if (!snapEnabled || !points || points.length < 2) {
      const bounds = this.calculateBounds(points || []);
      return {
        detected: false,
        type: 'raw',
        confidence: 0,
        bounds,
        startPoint: points?.[0] || { x: 0, y: 0 },
        endPoint: points?.[points.length - 1] || { x: 0, y: 0 }
      };
    }

    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const bounds = this.calculateBounds(points);
    const strokeLength = this.calculateStrokeLength(points);
    const directDistance = this.distance(startPoint, endPoint);

    // 1. Line Test (High collinearity and direct distance ~= strokeLength)
    const isStraightLine = directDistance > 15 && directDistance / (strokeLength || 1) > 0.88;
    if (isStraightLine) {
      // Check if ends with an arrow tip (sharp angle change in last 3-4 points)
      const hasArrowHead = this.detectArrowTip(points);
      return {
        detected: true,
        type: hasArrowHead ? 'arrow' : 'line',
        confidence: 0.95,
        bounds,
        startPoint,
        endPoint
      };
    }

    // 2. Closed Loop Tests (Circle vs Rectangle)
    const isClosedLoop = directDistance < 35 && points.length >= 4;
    if (isClosedLoop) {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const avgRadius = (bounds.width + bounds.height) / 4;

      // Calculate radius variance from center
      let radiusVarianceSum = 0;
      for (const p of points) {
        const d = this.distance(p, { x: cx, y: cy });
        radiusVarianceSum += Math.abs(d - avgRadius) / avgRadius;
      }
      const avgVariance = radiusVarianceSum / points.length;
      const aspect = Math.min(bounds.width, bounds.height) / Math.max(bounds.width, bounds.height);

      if (avgVariance < 0.22 && aspect > 0.70) {
        // Snaps to circle / ellipse
        return {
          detected: true,
          type: 'circle',
          confidence: 1 - avgVariance,
          bounds,
          startPoint,
          endPoint
        };
      }

      // Check if points form 4 approximate corners (Rectangle)
      if (aspect > 0.20 && this.isRectangular(points, bounds)) {
        return {
          detected: true,
          type: 'rectangle',
          confidence: 0.88,
          bounds,
          startPoint,
          endPoint
        };
      }
    }

    // 3. Deliberately ambiguous or freehand stroke
    return {
      detected: false,
      type: 'raw',
      confidence: 0.2,
      bounds,
      startPoint,
      endPoint
    };
  }

  /**
   * Calculates distance between points mapped against scale
   */
  measureDistance(
    p1: Point,
    p2: Point,
    scale: MeasurementScale,
    pageNumber: number = 1
  ): MeasurementResult {
    const ptDistance = this.distance(p1, p2);
    const worldVal = (ptDistance / (scale.screenPoints || 72)) * (scale.worldValue || 1);
    const rounded = Math.round(worldVal * 100) / 100;

    return {
      id: generateId(),
      type: 'distance',
      points: [p1, p2],
      value: rounded,
      unit: scale.worldUnit,
      formattedString: `${rounded} ${scale.worldUnit}`,
      pageNumber
    };
  }

  /**
   * Calculates polygon area mapped against scale
   */
  measureArea(
    polygonPoints: Point[],
    scale: MeasurementScale,
    pageNumber: number = 1
  ): MeasurementResult {
    let areaPt = 0;
    const n = polygonPoints.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      areaPt += polygonPoints[i].x * polygonPoints[j].y;
      areaPt -= polygonPoints[j].x * polygonPoints[i].y;
    }
    areaPt = Math.abs(areaPt) / 2;

    const scaleFactor = (scale.worldValue || 1) / (scale.screenPoints || 72);
    const worldArea = areaPt * scaleFactor * scaleFactor;
    const rounded = Math.round(worldArea * 100) / 100;

    return {
      id: generateId(),
      type: 'area',
      points: polygonPoints,
      value: rounded,
      unit: scale.worldUnit,
      formattedString: `${rounded} sq ${scale.worldUnit}`,
      pageNumber
    };
  }

  calculateDistance(
    points: Point[],
    scale: MeasurementScale,
    pageNumber: number = 1
  ): MeasurementResult {
    if (!points || points.length < 2) {
      return this.measureDistance({ x: 0, y: 0 }, { x: 0, y: 0 }, scale, pageNumber);
    }
    return this.measureDistance(points[0], points[points.length - 1], scale, pageNumber);
  }

  calculateArea(
    polygonPoints: Point[],
    scale: MeasurementScale,
    pageNumber: number = 1
  ): MeasurementResult {
    return this.measureArea(polygonPoints, scale, pageNumber);
  }

  // --- Geometry Helpers ---

  private distance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private calculateStrokeLength(points: Point[]): number {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += this.distance(points[i - 1], points[i]);
    }
    return len;
  }

  private calculateBounds(points: Point[]): Rect {
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    };
  }

  private detectArrowTip(points: Point[]): boolean {
    if (points.length < 8) return false;
    const last = points[points.length - 1];
    const prev = points[points.length - 3];
    const earlier = points[points.length - 6];
    const angle1 = Math.atan2(last.y - prev.y, last.x - prev.x);
    const angle2 = Math.atan2(prev.y - earlier.y, prev.x - earlier.x);
    const diff = Math.abs(angle1 - angle2);
    return diff > 0.6 && diff < 2.5;
  }

  private isRectangular(points: Point[], bounds: Rect): boolean {
    // Check points close to perimeter edges
    let perimeterHits = 0;
    const threshold = Math.max(8, (bounds.width + bounds.height) * 0.05);
    for (const p of points) {
      const nearLeft = Math.abs(p.x - bounds.x) < threshold;
      const nearRight = Math.abs(p.x - (bounds.x + bounds.width)) < threshold;
      const nearTop = Math.abs(p.y - bounds.y) < threshold;
      const nearBottom = Math.abs(p.y - (bounds.y + bounds.height)) < threshold;
      if (nearLeft || nearRight || nearTop || nearBottom) {
        perimeterHits++;
      }
    }
    return perimeterHits / points.length > 0.70;
  }
}
