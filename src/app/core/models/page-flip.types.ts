import { PdfPageItem, PdfSourceDocument } from './pdf-organization.types';

/**
 * Which axis a flip is requested about.
 *
 *   • horizontal — mirror left/right about the page's vertical centre line.
 *   • vertical   — mirror top/bottom about the page's horizontal centre line.
 *   • both       — both of the above, equivalent to a 180° point reflection
 *                  (which is NOT the same as a 180° /Rotate: rotation keeps
 *                  the text readable, a double flip mirrors it).
 */
export type PageFlipAxis = 'horizontal' | 'vertical' | 'both';

/**
 * A page's accumulated flip state. Flips are involutions, so applying the
 * same axis twice returns the page to its original orientation and the state
 * is two booleans rather than a list of operations.
 */
export interface PageFlipState {
  horizontal: boolean;
  vertical: boolean;
}

/**
 * A PDF transformation matrix in the order the `cm` operator takes it:
 *
 *     a b c d e f cm   ⇒   | a b 0 |
 *                          | c d 0 |
 *                          | e f 1 |
 *
 * so (x, y) maps to (a·x + c·y + e, b·x + d·y + f).
 */
export interface PageFlipMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** The flip matrix together with the box it was computed against. */
export interface PageFlipTransform {
  state: PageFlipState;
  matrix: PageFlipMatrix;
  /** Width of the box the flip mirrors within, in PDF points. */
  boxWidth: number;
  /** Height of the box the flip mirrors within, in PDF points. */
  boxHeight: number;
  /** True when the matrix is the identity, i.e. nothing would change. */
  isIdentity: boolean;
}

export interface PageFlipPreview {
  /** 1-based display number of the previewed page. */
  displayNumber: number;
  /** The flip state the preview was rendered for. */
  state: PageFlipState;
  transform: PageFlipTransform;
  /** Rasterised preview of the flipped page, when a canvas was available. */
  imageUrl?: string;
  /**
   * Set when no preview image could be produced (no 2D canvas, or the page
   * could not be rasterised). The flip itself is unaffected.
   */
  unavailableReason?: string;
}

export interface PageFlipRequest {
  pages: PdfPageItem[];
  sourceDocsMap: Map<string, PdfSourceDocument>;
  axis: PageFlipAxis;
}

/**
 * What a flip actually did, so the screen can report it rather than claiming
 * a clean result it cannot prove.
 */
export interface PageFlipReport {
  /** Display numbers of the pages whose flip state changed. */
  flippedDisplayNumbers: number[];
  /** Display numbers that returned to unflipped because the axis was re-applied. */
  revertedDisplayNumbers: number[];
  axis: PageFlipAxis;
  /**
   * Pages whose MediaBox did not start at the origin. Their flipped output is
   * normalised to a 0,0 origin, which moves the box but keeps all content.
   */
  normalizedOriginDisplayNumbers: number[];
}
