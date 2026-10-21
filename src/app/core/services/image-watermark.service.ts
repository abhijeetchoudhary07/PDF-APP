import { Injectable } from '@angular/core';
import {
  LogoWatermarkConfig,
  TextWatermarkConfig,
  WatermarkOptions,
  WatermarkPosition,
  WatermarkPreset
} from '../models/image-watermark.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

const BUILTIN_PRESETS: WatermarkPreset[] = [
  {
    id: 'confidential',
    name: 'Confidential',
    isBuiltin: true,
    options: {
      mode: 'tile',
      position: 'center',
      opacity: 0.25,
      margin: 20,
      textConfig: {
        type: 'text',
        text: 'CONFIDENTIAL',
        fontSize: 36,
        fontFamily: 'sans-serif',
        color: '#dc2626',
        opacity: 0.25,
        rotationDegrees: -30
      },
      tileConfig: {
        gapX: 80,
        gapY: 80,
        angleDegrees: -30
      }
    }
  },
  {
    id: 'sample',
    name: 'Sample',
    isBuiltin: true,
    options: {
      mode: 'single',
      position: 'center',
      opacity: 0.35,
      margin: 20,
      textConfig: {
        type: 'text',
        text: 'SAMPLE',
        fontSize: 54,
        fontFamily: 'sans-serif',
        color: '#4b5563',
        opacity: 0.35,
        rotationDegrees: -45
      }
    }
  },
  {
    id: 'draft',
    name: 'Draft',
    isBuiltin: true,
    options: {
      mode: 'single',
      position: 'bottom-right',
      opacity: 0.5,
      margin: 30,
      textConfig: {
        type: 'text',
        text: 'DRAFT',
        fontSize: 28,
        fontFamily: 'sans-serif',
        color: '#f59e0b',
        opacity: 0.5,
        rotationDegrees: 0
      }
    }
  },
  {
    id: 'copy',
    name: 'Copy',
    isBuiltin: true,
    options: {
      mode: 'tile',
      position: 'center',
      opacity: 0.2,
      margin: 20,
      textConfig: {
        type: 'text',
        text: 'COPY',
        fontSize: 40,
        fontFamily: 'sans-serif',
        color: '#2563eb',
        opacity: 0.2,
        rotationDegrees: -35
      },
      tileConfig: {
        gapX: 100,
        gapY: 100,
        angleDegrees: -35
      }
    }
  }
];

@Injectable({
  providedIn: 'root'
})
export class ImageWatermarkService {
  private customPresets: WatermarkPreset[] = [];

  constructor() {
    this.loadCustomPresets();
  }

  private loadCustomPresets() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('user_watermark_presets');
        if (raw) {
          this.customPresets = JSON.parse(raw);
        }
      }
    } catch {
      this.customPresets = [];
    }
  }

  getPresets(): WatermarkPreset[] {
    return [...BUILTIN_PRESETS, ...this.customPresets];
  }

  savePreset(name: string, options: WatermarkOptions): WatermarkPreset {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const preset: WatermarkPreset = {
      id,
      name,
      isBuiltin: false,
      options: JSON.parse(JSON.stringify(options))
    };
    this.customPresets.push(preset);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('user_watermark_presets', JSON.stringify(this.customPresets));
      }
    } catch {
      // Ignore storage errors
    }
    return preset;
  }

  deletePreset(id: string): boolean {
    const initLen = this.customPresets.length;
    this.customPresets = this.customPresets.filter(p => p.id !== id);
    if (this.customPresets.length !== initLen) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('user_watermark_presets', JSON.stringify(this.customPresets));
        }
      } catch {}
      return true;
    }
    return false;
  }

  /**
   * Deterministic placement mathematics for 9 anchor positions.
   */
  calculateAnchorPosition(
    canvasWidth: number,
    canvasHeight: number,
    watermarkWidth: number,
    watermarkHeight: number,
    position: WatermarkPosition,
    margin: number = 20
  ): { x: number; y: number } {
    let x = 0;
    let y = 0;

    const leftX = margin;
    const centerX = Math.round((canvasWidth - watermarkWidth) / 2);
    const rightX = Math.round(canvasWidth - watermarkWidth - margin);

    const topY = margin;
    const centerY = Math.round((canvasHeight - watermarkHeight) / 2);
    const bottomY = Math.round(canvasHeight - watermarkHeight - margin);

    switch (position) {
      case 'top-left':
        x = leftX;
        y = topY;
        break;
      case 'top-center':
        x = centerX;
        y = topY;
        break;
      case 'top-right':
        x = rightX;
        y = topY;
        break;
      case 'middle-left':
        x = leftX;
        y = centerY;
        break;
      case 'center':
        x = centerX;
        y = centerY;
        break;
      case 'middle-right':
        x = rightX;
        y = centerY;
        break;
      case 'bottom-left':
        x = leftX;
        y = bottomY;
        break;
      case 'bottom-center':
        x = centerX;
        y = bottomY;
        break;
      case 'bottom-right':
        x = rightX;
        y = bottomY;
        break;
    }

    return { x, y };
  }

  /**
   * Calculates continuous tiling coordinates covering the entire canvas.
   */
  calculateTilingGrid(
    canvasWidth: number,
    canvasHeight: number,
    itemWidth: number,
    itemHeight: number,
    gapX: number = 60,
    gapY: number = 60
  ): { x: number; y: number }[] {
    const stepX = Math.max(10, itemWidth + gapX);
    const stepY = Math.max(10, itemHeight + gapY);

    const coords: { x: number; y: number }[] = [];

    // Expand bounds slightly to ensure diagonal rotations cover corners
    const startX = -stepX;
    const startY = -stepY;
    const endX = canvasWidth + stepX;
    const endY = canvasHeight + stepY;

    for (let y = startY; y < endY; y += stepY) {
      for (let x = startX; x < endX; x += stepX) {
        coords.push({ x, y });
      }
    }

    return coords;
  }

  /**
   * Apply watermark to a canvas element and return a new watermarked canvas.
   */
  applyWatermark(
    sourceCanvas: HTMLCanvasElement,
    options: WatermarkOptions,
    logoElement?: HTMLImageElement | HTMLCanvasElement
  ): HTMLCanvasElement {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;

    const outCanvas = createSafeCanvas(width, height);
    const outCtx = getSafeContext(outCanvas);
    const srcCtx = getSafeContext(sourceCanvas);

    // Draw original image
    if (srcCtx && srcCtx.getImageData) {
      const srcData = srcCtx.getImageData(0, 0, width, height);
      outCtx.putImageData(srcData, 0, 0);
    } else {
      outCtx.drawImage(sourceCanvas, 0, 0);
    }

    const margin = options.margin !== undefined ? options.margin : 20;
    const opacity = Math.max(0, Math.min(1, options.opacity));

    if (options.textConfig) {
      this.renderTextWatermark(outCtx, width, height, options, margin, opacity);
    } else if (options.logoConfig && logoElement) {
      this.renderLogoWatermark(outCtx, width, height, options, logoElement, margin, opacity);
    }

    return outCanvas;
  }

  private renderTextWatermark(
    ctx: any,
    canvasW: number,
    canvasH: number,
    options: WatermarkOptions,
    margin: number,
    opacity: number
  ) {
    const cfg = options.textConfig as TextWatermarkConfig;
    const text = cfg.text || 'WATERMARK';
    const fontSize = cfg.fontSize || 32;
    const font = `${fontSize}px ${cfg.fontFamily || 'sans-serif'}`;
    const color = cfg.color || '#000000';
    const rotation = ((cfg.rotationDegrees || 0) * Math.PI) / 180;

    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Approximate text dimensions
    const estWidth = fontSize * 0.6 * text.length;
    const estHeight = fontSize;

    if (options.mode === 'tile') {
      const gapX = options.tileConfig?.gapX || 80;
      const gapY = options.tileConfig?.gapY || 80;
      const grid = this.calculateTilingGrid(canvasW, canvasH, estWidth, estHeight, gapX, gapY);

      for (const pt of grid) {
        ctx.save();
        ctx.translate(pt.x + estWidth / 2, pt.y + estHeight / 2);
        ctx.rotate(rotation);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    } else {
      // Single anchor
      const anchor = this.calculateAnchorPosition(canvasW, canvasH, estWidth, estHeight, options.position, margin);
      ctx.save();
      ctx.translate(anchor.x + estWidth / 2, anchor.y + estHeight / 2);
      ctx.rotate(rotation);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  private renderLogoWatermark(
    ctx: any,
    canvasW: number,
    canvasH: number,
    options: WatermarkOptions,
    logo: HTMLImageElement | HTMLCanvasElement,
    margin: number,
    opacity: number
  ) {
    const cfg = options.logoConfig as LogoWatermarkConfig;
    const scale = cfg.scale || 1.0;
    const logoW = (logo.width || 100) * scale;
    const logoH = (logo.height || 100) * scale;
    const rotation = ((cfg.rotationDegrees || 0) * Math.PI) / 180;

    ctx.save();
    ctx.globalAlpha = opacity;

    if (options.mode === 'tile') {
      const gapX = options.tileConfig?.gapX || 60;
      const gapY = options.tileConfig?.gapY || 60;
      const grid = this.calculateTilingGrid(canvasW, canvasH, logoW, logoH, gapX, gapY);

      for (const pt of grid) {
        ctx.save();
        ctx.translate(pt.x + logoW / 2, pt.y + logoH / 2);
        ctx.rotate(rotation);
        ctx.drawImage(logo, -logoW / 2, -logoH / 2, logoW, logoH);
        ctx.restore();
      }
    } else {
      const anchor = this.calculateAnchorPosition(canvasW, canvasH, logoW, logoH, options.position, margin);
      ctx.save();
      ctx.translate(anchor.x + logoW / 2, anchor.y + logoH / 2);
      ctx.rotate(rotation);
      ctx.drawImage(logo, -logoW / 2, -logoH / 2, logoW, logoH);
      ctx.restore();
    }

    ctx.restore();
  }
}
