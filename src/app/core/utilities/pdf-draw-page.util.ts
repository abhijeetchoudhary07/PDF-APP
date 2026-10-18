import './pdf-iterator-polyfill';
import { PDFDocument, PDFEmbeddedPage, PDFPage, degrees } from 'pdf-lib';

/**
 * Draws a source page onto a target page: the one piece of geometry every
 * Part D tool and the overlay tool share (D0).
 *
 * `copyPages` can only append a page whole. Anything that places a page
 * *somewhere* — scaled into a cell, inset inside bigger margins, stacked onto
 * a long sheet, laid over a letterhead — has to embed it as a Form XObject and
 * draw it through a transformation matrix. Nothing is rasterised, so vector art
 * stays vector and text stays selectable and searchable.
 *
 * Two things make this harder than `page.drawPage(embedded, { x, y })` and are
 * the whole reason this file exists:
 *
 *   • **A MediaBox that does not start at (0,0).** pdf-lib's default bounding
 *     box for an embedded page is `[0, 0, width, height]` — the *size* of the
 *     MediaBox placed at the origin — so a page whose box runs from (50,50) to
 *     (645,892) gets clipped on its right and top edges and padded with
 *     nothing on its left and bottom. Every embed here passes the real box.
 *
 *   • **The page rotation entry.** A Form XObject carries no /Rotate, so
 *     embedding a page a reader sees as landscape gives back its unrotated
 *     portrait content. To land it the way the reader expects, the rotation has
 *     to be baked into the draw matrix, and the destination box has to be
 *     measured in the rotated ("visual") axes.
 *
 * Everything below works in two spaces and says which:
 *   • **user space** — the source page's own coordinates, origin bottom-left.
 *   • **visual space** — the page as a reader sees it, after /Rotate. A
 *     /Rotate 90 page 595pt x 842pt is 842pt x 595pt visually.
 */

/** A rectangle in PDF user space, absolute, origin bottom-left. */
export interface DrawSourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A source page embedded in a target document, with the facts needed to place it. */
export interface EmbeddedSourcePage {
  embedded: PDFEmbeddedPage;
  /** Width of the embedded box in user space, before any /Rotate. */
  width: number;
  /** Height of the embedded box in user space, before any /Rotate. */
  height: number;
  /** The source's /Rotate plus its user rotation, normalised to 0/90/180/270 clockwise. */
  rotation: number;
  /** Width as a reader sees it, after `rotation`. */
  visualWidth: number;
  /** Height as a reader sees it, after `rotation`. */
  visualHeight: number;
  /**
   * True when the source MediaBox did not start at (0,0). No content is lost —
   * the real box is passed to `embedPage` — but the box moved to the origin,
   * which screens report rather than let pass silently.
   */
  originNormalized: boolean;
  /** True when only part of the source page was embedded. */
  clipped: boolean;
}

/** Where and how big to draw, measured in visual axes. */
export interface DrawTargetBox {
  /** Left edge of the destination box, in target user space. */
  x: number;
  /** Bottom edge of the destination box, in target user space. */
  y: number;
  /** Scale applied to the source's visual width. */
  scaleX: number;
  /** Scale applied to the source's visual height. */
  scaleY: number;
  /** Extra clockwise rotation on top of the source's own, in degrees. */
  extraRotation?: number;
}

/** The arguments `PDFPage.drawPage` needs to land a source in a target box. */
export interface DrawPagePlacement {
  x: number;
  y: number;
  xScale: number;
  yScale: number;
  /** Counter-clockwise rotation in degrees, which is what pdf-lib's `rotate` means. */
  rotate: number;
  /** Size the drawn result occupies in the target, in visual axes. */
  width: number;
  height: number;
}

export type DrawFitMode = 'contain' | 'cover' | 'stretch' | 'none';

export class PdfDrawPageUtil {
  /** Rounds any angle to the nearest quarter turn in [0, 360). */
  static normalizeRotation(degreesValue: number | undefined): number {
    if (!Number.isFinite(degreesValue as number)) return 0;
    const quarter = Math.round((degreesValue as number) / 90) * 90;
    return ((quarter % 360) + 360) % 360;
  }

  /** Size as a reader sees it: a quarter turn swaps the axes. */
  static visualSize(
    width: number,
    height: number,
    rotation: number
  ): { width: number; height: number } {
    return this.normalizeRotation(rotation) % 180 !== 0
      ? { width: height, height: width }
      : { width, height };
  }

  /**
   * True when the page has a content stream that can be embedded.
   *
   * A page with no /Contents is legal and not even rare — pdf-lib's own
   * `addPage` makes one, so every blank page this app inserts is one — but
   * `embedPage` refuses it outright ("Can't embed page with missing
   * Contents"). Callers check first and write a blank page of the right size
   * instead of failing the whole export on an empty sheet.
   */
  static hasContents(page: PDFPage): boolean {
    try {
      return page.node.Contents() !== undefined;
    } catch {
      return false;
    }
  }

  /** The page's MediaBox, falling back to its reported size if it has none. */
  static mediaBoxOf(page: PDFPage): DrawSourceRect {
    try {
      const box = page.getMediaBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    } catch {
      const size = page.getSize();
      return { x: 0, y: 0, width: size.width, height: size.height };
    }
  }

  /**
   * Embeds `sourcePage` into `targetDoc`, optionally clipping to a rectangle of
   * its user space.
   *
   * The bounding box is always passed explicitly — see the note at the top of
   * this file about pdf-lib's origin-relative default. `rotation` overrides the
   * source's own /Rotate, for callers that have already composed a user
   * rotation on top of it (the organizer's page items carry both).
   */
  static async embedSource(
    targetDoc: PDFDocument,
    sourcePage: PDFPage,
    options?: { clip?: DrawSourceRect; rotation?: number }
  ): Promise<EmbeddedSourcePage> {
    const media = this.mediaBoxOf(sourcePage);
    const clip = options?.clip;

    const box = clip
      ? {
          left: clip.x,
          bottom: clip.y,
          right: clip.x + clip.width,
          top: clip.y + clip.height
        }
      : {
          left: media.x,
          bottom: media.y,
          right: media.x + media.width,
          top: media.y + media.height
        };

    const embedded = await targetDoc.embedPage(sourcePage, box);

    const width = box.right - box.left;
    const height = box.top - box.bottom;
    const rotation = this.normalizeRotation(
      options?.rotation !== undefined ? options.rotation : sourcePage.getRotation().angle
    );
    const visual = this.visualSize(width, height, rotation);

    return {
      embedded,
      width,
      height,
      rotation,
      visualWidth: visual.width,
      visualHeight: visual.height,
      originNormalized: media.x !== 0 || media.y !== 0,
      clipped: !!clip
    };
  }

  /**
   * Works out the `drawPage` arguments that land a source inside a target box.
   *
   * pdf-lib emits `translate(x, y)` then `rotate(θ)` then `scale(sx, sy)`, so a
   * rotated draw starts somewhere other than the box's bottom-left corner: at
   * θ = 90 the content grows left and up from the anchor, at θ = 180 left and
   * down, at θ = 270 right and down. The offsets below put the anchor wherever
   * it has to be for the *result* to sit with its bottom-left at (x, y).
   *
   * `scaleX` and `scaleY` are given in visual axes — they scale what the reader
   * sees — which is why they swap onto the unrotated axes for a quarter turn.
   * Without that swap, a non-uniform scale on a landscape scan stretches it the
   * wrong way round, and every N-up cell on a mixed document is wrong.
   */
  static placement(
    source: Pick<EmbeddedSourcePage, 'width' | 'height' | 'rotation'>,
    box: DrawTargetBox
  ): DrawPagePlacement {
    const rotation = this.normalizeRotation(
      source.rotation + (box.extraRotation ?? 0)
    );
    const turned = rotation % 180 !== 0;

    // Visual scales, mapped onto the source's own (unrotated) axes.
    const xScale = turned ? box.scaleY : box.scaleX;
    const yScale = turned ? box.scaleX : box.scaleY;

    // A clockwise /Rotate is baked in as the matching counter-clockwise turn.
    const rotate = (360 - rotation) % 360;

    let x = box.x;
    let y = box.y;
    if (rotate === 90) {
      x = box.x + yScale * source.height;
    } else if (rotate === 180) {
      x = box.x + xScale * source.width;
      y = box.y + yScale * source.height;
    } else if (rotate === 270) {
      y = box.y + xScale * source.width;
    }

    const visual = this.visualSize(source.width, source.height, rotation);

    return {
      x,
      y,
      xScale,
      yScale,
      rotate,
      width: visual.width * box.scaleX,
      height: visual.height * box.scaleY
    };
  }

  /**
   * Draws an embedded source into a target page at `box`, and returns where it
   * landed so the caller can report or decorate it.
   */
  static draw(
    targetPage: PDFPage,
    source: EmbeddedSourcePage,
    box: DrawTargetBox & { opacity?: number }
  ): DrawPagePlacement {
    const placement = this.placement(source, box);

    targetPage.drawPage(source.embedded, {
      x: placement.x,
      y: placement.y,
      xScale: placement.xScale,
      yScale: placement.yScale,
      rotate: degrees(placement.rotate),
      ...(box.opacity !== undefined && box.opacity < 1
        ? { opacity: Math.max(0, Math.min(1, box.opacity)) }
        : {})
    });

    return placement;
  }

  /**
   * Scale factors that fit a visual size into a box.
   *
   * `contain` fits entirely inside and keeps the aspect ratio — the only mode
   * that never crops and never distorts, and so the default everywhere a
   * document is being re-laid out. `none` is 1:1, for callers that only want
   * the centring.
   */
  static fitScale(
    visualWidth: number,
    visualHeight: number,
    boxWidth: number,
    boxHeight: number,
    mode: DrawFitMode = 'contain'
  ): { scaleX: number; scaleY: number } {
    if (visualWidth <= 0 || visualHeight <= 0) return { scaleX: 1, scaleY: 1 };

    const sx = boxWidth / visualWidth;
    const sy = boxHeight / visualHeight;

    switch (mode) {
      case 'stretch':
        return { scaleX: sx, scaleY: sy };
      case 'cover': {
        const s = Math.max(sx, sy);
        return { scaleX: s, scaleY: s };
      }
      case 'none':
        return { scaleX: 1, scaleY: 1 };
      case 'contain':
      default: {
        const s = Math.min(sx, sy);
        return { scaleX: s, scaleY: s };
      }
    }
  }

  /**
   * Bottom-left corner that centres a drawn size inside a box.
   *
   * Clamped at the box origin so content that is larger than its box overflows
   * symmetrically rather than being pushed off one side.
   */
  static centreIn(
    box: { x: number; y: number; width: number; height: number },
    drawnWidth: number,
    drawnHeight: number
  ): { x: number; y: number } {
    return {
      x: box.x + (box.width - drawnWidth) / 2,
      y: box.y + (box.height - drawnHeight) / 2
    };
  }

  /**
   * The common case in one call: fit a source into a box, centred, and draw it.
   *
   * Returns the placement, including the drawn size, which is what a screen
   * needs to report "scaled to 94%" or to draw a border round the result.
   */
  static drawFitted(
    targetPage: PDFPage,
    source: EmbeddedSourcePage,
    box: { x: number; y: number; width: number; height: number },
    options?: {
      fit?: DrawFitMode;
      centre?: boolean;
      extraRotation?: number;
      opacity?: number;
      /** Never enlarge a page to fill its box, only shrink it. */
      shrinkOnly?: boolean;
    }
  ): DrawPagePlacement {
    const rotation = this.normalizeRotation(
      source.rotation + (options?.extraRotation ?? 0)
    );
    const visual = this.visualSize(source.width, source.height, rotation);

    let { scaleX, scaleY } = this.fitScale(
      visual.width,
      visual.height,
      box.width,
      box.height,
      options?.fit ?? 'contain'
    );

    if (options?.shrinkOnly) {
      scaleX = Math.min(1, scaleX);
      scaleY = Math.min(1, scaleY);
    }

    const drawnWidth = visual.width * scaleX;
    const drawnHeight = visual.height * scaleY;
    const origin =
      options?.centre === false
        ? { x: box.x, y: box.y }
        : this.centreIn(box, drawnWidth, drawnHeight);

    return this.draw(targetPage, source, {
      x: origin.x,
      y: origin.y,
      scaleX,
      scaleY,
      extraRotation: options?.extraRotation,
      opacity: options?.opacity
    });
  }
}
