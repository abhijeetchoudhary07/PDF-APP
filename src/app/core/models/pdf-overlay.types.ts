/**
 * Overlay / underlay — C6.
 *
 * Lays one or more PDFs over or under a base document: letterhead,
 * pre-printed forms, watermark sheets, stamp pages. The base document's pages
 * are copied, never re-rendered, so its text stays selectable and — in the
 * foreground case — its links and form fields survive too.
 */

import { PdfExportResult } from './pdf-organization.types';

/** How overlay pages are matched to base pages. */
export type OverlayMappingMode = 'sequential' | 'interleaved' | 'fixed-repeat';

export const OVERLAY_MAPPING_MODES: OverlayMappingMode[] = [
  'sequential',
  'interleaved',
  'fixed-repeat'
];

/** Whether the overlay sits over the base content or behind it. */
export type OverlayPosition = 'foreground' | 'background';

export type OverlayPresetId =
  | 'letterhead'
  | 'preprinted-form'
  | 'watermark-sheet'
  | 'custom';

/** One document being laid onto the base. */
export interface OverlayLayer {
  id: string;
  name: string;
  pageCount: number;
  buffer: ArrayBuffer;
  /** 0-1. 1 is opaque. */
  opacity: number;
  /** Scale the overlay page to cover the base page, keeping its aspect ratio. */
  scaleToFit: boolean;
}

export interface OverlayOptions {
  mode: OverlayMappingMode;
  position: OverlayPosition;
  /** `fixed-repeat`: how many consecutive base pages each overlay page covers. */
  repeatCount: number;
  /**
   * Start the overlay sequence again when it runs out, rather than leaving the
   * remaining base pages bare. A one-page letterhead over a 40-page report is
   * exactly this case.
   */
  cycle: boolean;
}

export function defaultOverlayOptions(): OverlayOptions {
  return {
    mode: 'sequential',
    position: 'background',
    repeatCount: 1,
    cycle: true
  };
}

/** A named starting point. Named by what it does, never by an institution. */
export interface OverlayPreset {
  id: OverlayPresetId;
  labelKey: string;
  descriptionKey: string;
  options: OverlayOptions;
  /** Opacity applied to every layer when the preset is picked. */
  opacity: number;
}

export const OVERLAY_PRESETS: OverlayPreset[] = [
  {
    id: 'letterhead',
    labelKey: 'overlay.presetLetterhead',
    descriptionKey: 'overlay.presetLetterheadDesc',
    options: { mode: 'sequential', position: 'background', repeatCount: 1, cycle: true },
    opacity: 1
  },
  {
    id: 'preprinted-form',
    labelKey: 'overlay.presetForm',
    descriptionKey: 'overlay.presetFormDesc',
    options: { mode: 'sequential', position: 'background', repeatCount: 1, cycle: false },
    opacity: 1
  },
  {
    id: 'watermark-sheet',
    labelKey: 'overlay.presetWatermark',
    descriptionKey: 'overlay.presetWatermarkDesc',
    options: { mode: 'sequential', position: 'foreground', repeatCount: 1, cycle: true },
    opacity: 0.18
  }
];

/** Which overlay page covers one base page. */
export interface OverlayAssignment {
  /** 1-indexed base page. */
  basePageNumber: number;
  /** Index into the layer list, or -1 when this page gets no overlay. */
  layerIndex: number;
  /** 0-indexed page within that layer. */
  layerPageIndex: number;
}

export interface OverlayPlan {
  assignments: OverlayAssignment[];
  basePageCount: number;
  /** 1-indexed base pages that end up with no overlay on them. */
  uncoveredPageNumbers: number[];
  /** How many overlay pages the mapping had available in total. */
  overlayPageCount: number;
}

export type OverlayNoticeKind
  /** Some base pages got no overlay, because the overlay ran out. */
  = 'uncovered-pages'
  /** The overlay sequence was repeated to cover the base document. */
  | 'overlay-cycled'
  /**
   * An underlay has to rewrite the page's content stream, which the page's
   * annotations do not travel through. Only reported when the base page
   * actually had any.
   */
  | 'annotations-dropped'
  /** An overlay page carried no content and was skipped. */
  | 'empty-overlay-page'
  /** An overlay page was a different shape from the base page it covers. */
  | 'aspect-mismatch';

export interface OverlayNotice {
  kind: OverlayNoticeKind;
  count?: number;
  pageNumbers?: number[];
  detail?: string;
}

export interface OverlayProgress {
  phase: 'planning' | 'writing';
  completed: number;
  total: number;
  percent: number;
}

export interface OverlayOutput extends PdfExportResult {
  notices: OverlayNotice[];
  basePageCount: number;
}
