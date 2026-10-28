/**
 * SVG geometry: path parsing, shape-to-path conversion, and affine transforms.
 *
 * The SVG to PDF converter needs every shape in one coordinate space before it
 * can draw anything, because `<g transform>` nesting, a viewBox and a page size
 * compose into a single matrix that pdf-lib cannot be handed directly. Turning
 * each element into an absolute path and multiplying its points through that
 * matrix is what makes a grouped, transformed drawing come out in the right
 * place instead of stacked at the origin.
 */

/** Affine matrix [a, b, c, d, e, f] as SVG writes it. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Mean of the axis scales, for stroke widths and font sizes. */
export function matrixScale(m: Matrix): number {
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  return (sx + sy) / 2;
}

/** Rotation the matrix applies, in degrees clockwise as SVG measures it. */
export function matrixRotation(m: Matrix): number {
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI;
}

export function hasSkew(m: Matrix): boolean {
  const dot = m[0] * m[2] + m[1] * m[3];
  const scale = Math.hypot(m[0], m[1]) * Math.hypot(m[2], m[3]);
  return scale > 1e-9 && Math.abs(dot / scale) > 1e-3;
}

/**
 * Parses an SVG `transform` attribute. Unknown functions are skipped rather
 * than aborting the element, which keeps one odd attribute from losing a shape.
 */
export function parseTransform(value: string | null): Matrix {
  if (!value) return IDENTITY;
  let result: Matrix = IDENTITY;
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const name = match[1];
    const args = match[2]
      .split(/[\s,]+/)
      .map(part => parseFloat(part))
      .filter(n => !Number.isNaN(n));

    let step: Matrix = IDENTITY;
    switch (name) {
      case 'matrix':
        if (args.length >= 6) step = [args[0], args[1], args[2], args[3], args[4], args[5]];
        break;
      case 'translate':
        step = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
        break;
      case 'scale': {
        const sx = args[0] ?? 1;
        const sy = args.length > 1 ? args[1] : sx;
        step = [sx, 0, 0, sy, 0, 0];
        break;
      }
      case 'rotate': {
        const angle = ((args[0] || 0) * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rotation: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (args.length >= 3) {
          // rotate(a cx cy) is translate(cx cy) rotate(a) translate(-cx -cy)
          step = multiply(
            multiply([1, 0, 0, 1, args[1], args[2]], rotation),
            [1, 0, 0, 1, -args[1], -args[2]]
          );
        } else {
          step = rotation;
        }
        break;
      }
      case 'skewX':
        step = [1, 0, Math.tan(((args[0] || 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        step = [1, Math.tan(((args[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        break;
    }
    result = multiply(result, step);
  }

  return result;
}

/** One absolute path segment. Everything is reduced to these four. */
export type PathSegment =
  | { type: 'M'; points: number[] }
  | { type: 'L'; points: number[] }
  | { type: 'C'; points: number[] }
  | { type: 'Q'; points: number[] }
  | { type: 'Z' };

const NUMBER_PATTERN = /[+-]?(\d*\.\d+|\d+\.?)([eE][+-]?\d+)?/g;

/**
 * Parses path data into absolute M/L/C/Q/Z segments, converting H, V, S, T and
 * A along the way so that later stages only deal with points.
 */
export function parsePathData(d: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const commandPattern = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match: RegExpExecArray | null;

  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let lastControlX = 0;
  let lastControlY = 0;
  let lastCommand = '';

  while ((match = commandPattern.exec(d)) !== null) {
    const command = match[1];
    const numbers: number[] = [];
    let numberMatch: RegExpExecArray | null;
    NUMBER_PATTERN.lastIndex = 0;
    while ((numberMatch = NUMBER_PATTERN.exec(match[2])) !== null) {
      const parsed = parseFloat(numberMatch[0]);
      if (!Number.isNaN(parsed)) numbers.push(parsed);
    }

    const isRelative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    const consume = (count: number): number[][] => {
      const groups: number[][] = [];
      for (let i = 0; i + count <= numbers.length; i += count) {
        groups.push(numbers.slice(i, i + count));
      }
      // An implicit repeat with no arguments at all is simply ignored.
      return groups;
    };

    if (upper === 'Z') {
      segments.push({ type: 'Z' });
      cx = startX;
      cy = startY;
      lastCommand = 'Z';
      continue;
    }

    switch (upper) {
      case 'M': {
        consume(2).forEach((pair, index) => {
          const x = isRelative ? cx + pair[0] : pair[0];
          const y = isRelative ? cy + pair[1] : pair[1];
          // Only the first pair is a move; the rest are implicit line-tos.
          segments.push({ type: index === 0 ? 'M' : 'L', points: [x, y] });
          if (index === 0) {
            startX = x;
            startY = y;
          }
          cx = x;
          cy = y;
        });
        break;
      }
      case 'L': {
        consume(2).forEach(pair => {
          const x = isRelative ? cx + pair[0] : pair[0];
          const y = isRelative ? cy + pair[1] : pair[1];
          segments.push({ type: 'L', points: [x, y] });
          cx = x;
          cy = y;
        });
        break;
      }
      case 'H': {
        consume(1).forEach(pair => {
          const x = isRelative ? cx + pair[0] : pair[0];
          segments.push({ type: 'L', points: [x, cy] });
          cx = x;
        });
        break;
      }
      case 'V': {
        consume(1).forEach(pair => {
          const y = isRelative ? cy + pair[0] : pair[0];
          segments.push({ type: 'L', points: [cx, y] });
          cy = y;
        });
        break;
      }
      case 'C': {
        consume(6).forEach(args => {
          const x1 = isRelative ? cx + args[0] : args[0];
          const y1 = isRelative ? cy + args[1] : args[1];
          const x2 = isRelative ? cx + args[2] : args[2];
          const y2 = isRelative ? cy + args[3] : args[3];
          const x = isRelative ? cx + args[4] : args[4];
          const y = isRelative ? cy + args[5] : args[5];
          segments.push({ type: 'C', points: [x1, y1, x2, y2, x, y] });
          lastControlX = x2;
          lastControlY = y2;
          cx = x;
          cy = y;
        });
        break;
      }
      case 'S': {
        consume(4).forEach(args => {
          const smooth = 'CS'.includes(lastCommand);
          const x1 = smooth ? 2 * cx - lastControlX : cx;
          const y1 = smooth ? 2 * cy - lastControlY : cy;
          const x2 = isRelative ? cx + args[0] : args[0];
          const y2 = isRelative ? cy + args[1] : args[1];
          const x = isRelative ? cx + args[2] : args[2];
          const y = isRelative ? cy + args[3] : args[3];
          segments.push({ type: 'C', points: [x1, y1, x2, y2, x, y] });
          lastControlX = x2;
          lastControlY = y2;
          cx = x;
          cy = y;
          lastCommand = 'C';
        });
        break;
      }
      case 'Q': {
        consume(4).forEach(args => {
          const x1 = isRelative ? cx + args[0] : args[0];
          const y1 = isRelative ? cy + args[1] : args[1];
          const x = isRelative ? cx + args[2] : args[2];
          const y = isRelative ? cy + args[3] : args[3];
          segments.push({ type: 'Q', points: [x1, y1, x, y] });
          lastControlX = x1;
          lastControlY = y1;
          cx = x;
          cy = y;
        });
        break;
      }
      case 'T': {
        consume(2).forEach(args => {
          const smooth = 'QT'.includes(lastCommand);
          const x1 = smooth ? 2 * cx - lastControlX : cx;
          const y1 = smooth ? 2 * cy - lastControlY : cy;
          const x = isRelative ? cx + args[0] : args[0];
          const y = isRelative ? cy + args[1] : args[1];
          segments.push({ type: 'Q', points: [x1, y1, x, y] });
          lastControlX = x1;
          lastControlY = y1;
          cx = x;
          cy = y;
          lastCommand = 'Q';
        });
        break;
      }
      case 'A': {
        consume(7).forEach(args => {
          const x = isRelative ? cx + args[5] : args[5];
          const y = isRelative ? cy + args[6] : args[6];
          const curves = arcToCurves(cx, cy, args[0], args[1], args[2], !!args[3], !!args[4], x, y);
          curves.forEach(points => segments.push({ type: 'C', points }));
          cx = x;
          cy = y;
        });
        break;
      }
      default:
        break;
    }

    if (!'ST'.includes(upper)) lastCommand = upper;
  }

  return segments;
}

/**
 * Endpoint-parameterised elliptical arc to cubic béziers, per the SVG
 * implementation notes. PDF has no arc primitive, so this is not optional.
 */
function arcToCurves(
  x1: number,
  y1: number,
  rxInput: number,
  ryInput: number,
  rotationDegrees: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number
): number[][] {
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);
  if (rx === 0 || ry === 0) {
    return [[x1, y1, x2, y2, x2, y2]]; // degenerate: a straight line as a curve
  }
  if (x1 === x2 && y1 === y2) return [];

  const phi = (rotationDegrees * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Scale the radii up if they cannot span the endpoints.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));

  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;
  const centerX = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const centerY = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angleOf = (px: number, py: number) => Math.atan2((py - cyp) / ry, (px - cxp) / rx);
  const theta1 = angleOf(x1p, y1p);
  let deltaTheta = angleOf(-x1p, -y1p) - theta1;
  if (!sweep && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
  if (sweep && deltaTheta < 0) deltaTheta += 2 * Math.PI;

  // One cubic per quarter turn keeps the error below a fraction of a point.
  const segmentCount = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)));
  const step = deltaTheta / segmentCount;
  const alpha = (4 / 3) * Math.tan(step / 4);

  const curves: number[][] = [];
  let theta = theta1;
  let px = x1;
  let py = y1;

  for (let i = 0; i < segmentCount; i++) {
    const nextTheta = theta + step;

    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const cosN = Math.cos(nextTheta);
    const sinN = Math.sin(nextTheta);

    // Derivatives at both ends, rotated and scaled into user space.
    const d1x = -rx * sinT;
    const d1y = ry * cosT;
    const d2x = -rx * sinN;
    const d2y = ry * cosN;

    const rotate = (vx: number, vy: number): [number, number] => [
      cosPhi * vx - sinPhi * vy,
      sinPhi * vx + cosPhi * vy
    ];

    const [t1x, t1y] = rotate(d1x, d1y);
    const [t2x, t2y] = rotate(d2x, d2y);
    const [ex, ey] = rotate(rx * cosN, ry * sinN);

    const endX = centerX + ex;
    const endY = centerY + ey;

    curves.push([
      px + alpha * t1x,
      py + alpha * t1y,
      endX - alpha * t2x,
      endY - alpha * t2y,
      endX,
      endY
    ]);

    px = endX;
    py = endY;
    theta = nextTheta;
  }

  return curves;
}

/** Applies a matrix to every point and serialises back to path data. */
export function transformPathData(segments: PathSegment[], matrix: Matrix): string {
  const parts: string[] = [];
  const round = (n: number) => (Math.abs(n) < 1e-6 ? 0 : Math.round(n * 1000) / 1000);

  for (const segment of segments) {
    if (segment.type === 'Z') {
      parts.push('Z');
      continue;
    }
    const mapped: number[] = [];
    for (let i = 0; i < segment.points.length; i += 2) {
      const [x, y] = applyMatrix(matrix, segment.points[i], segment.points[i + 1]);
      mapped.push(round(x), round(y));
    }
    parts.push(`${segment.type}${mapped.join(' ')}`);
  }

  return parts.join(' ');
}

const KAPPA = 0.5522847498307936; // 4/3 * (sqrt(2) - 1): circle as four cubics

/** Ellipse as four cubic béziers. */
export function ellipseToPath(cx: number, cy: number, rx: number, ry: number): PathSegment[] {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    { type: 'M', points: [cx - rx, cy] },
    { type: 'C', points: [cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry] },
    { type: 'C', points: [cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy] },
    { type: 'C', points: [cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry] },
    { type: 'C', points: [cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy] },
    { type: 'Z' }
  ];
}

/** Rectangle, with rounded corners when rx or ry is set. */
export function rectToPath(
  x: number,
  y: number,
  width: number,
  height: number,
  rxInput = 0,
  ryInput = 0
): PathSegment[] {
  const rx = Math.min(Math.abs(rxInput || ryInput || 0), width / 2);
  const ry = Math.min(Math.abs(ryInput || rxInput || 0), height / 2);

  if (rx <= 0 || ry <= 0) {
    return [
      { type: 'M', points: [x, y] },
      { type: 'L', points: [x + width, y] },
      { type: 'L', points: [x + width, y + height] },
      { type: 'L', points: [x, y + height] },
      { type: 'Z' }
    ];
  }

  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    { type: 'M', points: [x + rx, y] },
    { type: 'L', points: [x + width - rx, y] },
    { type: 'C', points: [x + width - rx + ox, y, x + width, y + ry - oy, x + width, y + ry] },
    { type: 'L', points: [x + width, y + height - ry] },
    {
      type: 'C',
      points: [
        x + width,
        y + height - ry + oy,
        x + width - rx + ox,
        y + height,
        x + width - rx,
        y + height
      ]
    },
    { type: 'L', points: [x + rx, y + height] },
    { type: 'C', points: [x + rx - ox, y + height, x, y + height - ry + oy, x, y + height - ry] },
    { type: 'L', points: [x, y + ry] },
    { type: 'C', points: [x, y + ry - oy, x + rx - ox, y, x + rx, y] },
    { type: 'Z' }
  ];
}

/** Parses `points` for polyline and polygon. */
export function pointsToPath(points: string, close: boolean): PathSegment[] {
  const numbers = (points.match(NUMBER_PATTERN) || []).map(Number).filter(n => !Number.isNaN(n));
  const segments: PathSegment[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    segments.push({ type: i === 0 ? 'M' : 'L', points: [numbers[i], numbers[i + 1]] });
  }
  if (close && segments.length > 1) segments.push({ type: 'Z' });
  return segments;
}
