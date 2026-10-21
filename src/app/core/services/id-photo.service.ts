import { Injectable } from '@angular/core';
import {
  FaceBoundingBox,
  IdPhotoCropOptions,
  IdPhotoBackgroundOptions,
  PrintSheetOptions,
  BackgroundSuitabilityResult,
  PrintSheetLayout
} from '../models/id-photo.types';
import { createSafeCanvas, getSafeContext } from '../utilities/canvas-headless.util';

@Injectable({
  providedIn: 'root'
})
export class IdPhotoService {

  /**
   * Detects a face using the browser FaceDetector API if supported.
   * If not available or no face detected, returns null so the manual guide fallback is used.
   */
  async detectFace(imageSource: HTMLImageElement | HTMLCanvasElement): Promise<FaceBoundingBox | null> {
    try {
      const win = window as any;
      if (typeof win.FaceDetector === 'function') {
        const detector = new win.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        const faces = await detector.detect(imageSource);
        if (faces && faces.length > 0) {
          const box = faces[0].boundingBox;
          return {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height)
          };
        }
      }
    } catch {
      // Graceful fallback to manual guide overlay
    }
    return null;
  }

  /**
   * Generates a centered, sensible default face box for an image.
   * This is used when face detection is unavailable or as the starting point for manual guides.
   */
  getDefaultFaceBox(imgWidth: number, imgHeight: number): FaceBoundingBox {
    const boxWidth = Math.round(imgWidth * 0.4);
    const boxHeight = Math.round(boxWidth * 1.25);
    const x = Math.round((imgWidth - boxWidth) / 2);
    const y = Math.round(imgHeight * 0.18);
    return { x, y, width: boxWidth, height: boxHeight };
  }

  /**
   * Calculates the crop box given image dimensions, face bounding box, and options.
   * Pure deterministic calculation: the manual guide and auto-detected paths produce
   * the exact same geometry given the same face bounding box.
   */
  calculateCropBox(
    imageWidth: number,
    imageHeight: number,
    faceBox: FaceBoundingBox,
    options: IdPhotoCropOptions
  ): { x: number; y: number; width: number; height: number } {
    const headRatio = Math.max(0.4, Math.min(0.95, options.headHeightRatio || 0.72));
    const eyeRatio = Math.max(0.2, Math.min(0.7, options.eyeLineRatio || 0.43));
    const aspect = options.aspectRatio > 0 ? options.aspectRatio : 35 / 45;

    // Ideal crop height based on head-height percentage
    let cropHeight = Math.round(faceBox.height / headRatio);
    let cropWidth = Math.round(cropHeight * aspect);

    // If crop box exceeds available image dimensions, scale down to fit
    if (cropWidth > imageWidth) {
      cropWidth = imageWidth;
      cropHeight = Math.round(cropWidth / aspect);
    }
    if (cropHeight > imageHeight) {
      cropHeight = imageHeight;
      cropWidth = Math.round(cropHeight * aspect);
    }

    // Eye line is approximately 42% down the face bounding box
    const estimatedEyeY = faceBox.y + faceBox.height * 0.42;

    // Place eye line at eyeRatio from top of crop box
    let cropY = Math.round(estimatedEyeY - cropHeight * eyeRatio);

    // Center horizontally on the face center
    const faceCenterX = faceBox.x + faceBox.width / 2;
    let cropX = Math.round(faceCenterX - cropWidth / 2);

    // Clamp within image bounds
    if (cropX < 0) cropX = 0;
    if (cropY < 0) cropY = 0;
    if (cropX + cropWidth > imageWidth) cropX = Math.max(0, imageWidth - cropWidth);
    if (cropY + cropHeight > imageHeight) cropY = Math.max(0, imageHeight - cropHeight);

    return {
      x: cropX,
      y: cropY,
      width: Math.min(cropWidth, imageWidth),
      height: Math.min(cropHeight, imageHeight)
    };
  }

  /**
   * Assesses background suitability for replacement.
   * Refuses cluttered backgrounds and explains why, preventing torn matting.
   */
  checkBackgroundSuitability(canvas: HTMLCanvasElement, faceBox?: FaceBoundingBox): BackgroundSuitabilityResult {
    const ctx = getSafeContext(canvas);
    if (!ctx) return { suitable: false, reason: 'Unable to analyze image canvas.', variance: 999 };

    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Sample background regions: top 12% strip and top-left/top-right corners
    const sampleLimitY = faceBox ? Math.max(5, Math.min(faceBox.y, Math.round(h * 0.15))) : Math.round(h * 0.12);
    const sampledLuminances: number[] = [];
    const sampledR: number[] = [];
    const sampledG: number[] = [];
    const sampledB: number[] = [];

    // Sample pixels across top border and corners
    for (let y = 0; y < sampleLimitY; y += 2) {
      for (let x = 0; x < w; x += 3) {
        // Exclude subject area if faceBox is provided
        if (faceBox && y > faceBox.y && x >= faceBox.x && x <= faceBox.x + faceBox.width) {
          continue;
        }
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sampledLuminances.push(lum);
        sampledR.push(r);
        sampledG.push(g);
        sampledB.push(b);
      }
    }

    if (sampledLuminances.length === 0) {
      return { suitable: false, reason: 'No background samples could be gathered.', variance: 999 };
    }

    // Calculate mean and variance of background luminance
    const meanLum = sampledLuminances.reduce((a, b) => a + b, 0) / sampledLuminances.length;
    const varianceLum = sampledLuminances.reduce((sum, val) => sum + Math.pow(val - meanLum, 2), 0) / sampledLuminances.length;
    const stdDev = Math.sqrt(varianceLum);

    // Also check edge contrast/gradients in the background strip
    let edgeEnergy = 0;
    let edgeSamples = 0;
    for (let y = 1; y < sampleLimitY - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 3) {
        const idx = (y * w + x) * 4;
        const idxRight = (y * w + (x + 1)) * 4;
        const idxDown = ((y + 1) * w + x) * 4;
        const diffX = Math.abs(data[idx] - data[idxRight]) + Math.abs(data[idx + 1] - data[idxRight + 1]) + Math.abs(data[idx + 2] - data[idxRight + 2]);
        const diffY = Math.abs(data[idx] - data[idxDown]) + Math.abs(data[idx + 1] - data[idxDown + 1]) + Math.abs(data[idx + 2] - data[idxDown + 2]);
        edgeEnergy += (diffX + diffY);
        edgeSamples++;
      }
    }
    const avgEdge = edgeSamples > 0 ? edgeEnergy / edgeSamples : 0;

    // Standard plain background (studio, wall, sheet): stdDev is typically < 25 and avgEdge < 18.
    // Cluttered background (room, outdoor, patterned): stdDev > 30 or avgEdge > 24.
    if (stdDev > 30 || avgEdge > 24) {
      return {
        suitable: false,
        reason: 'The background is too cluttered or varied for clean replacement. Please use a portrait photo taken in front of a plain, solid-colored wall.',
        variance: stdDev
      };
    }

    return {
      suitable: true,
      variance: stdDev
    };
  }

  /**
   * Replaces plain background with solid white or light blue.
   */
  replaceBackground(
    canvas: HTMLCanvasElement,
    faceBox: FaceBoundingBox,
    targetColor: 'white' | 'light-blue' | string = 'white'
  ): HTMLCanvasElement {
    const outCanvas = createSafeCanvas(canvas.width, canvas.height);
    const ctx = getSafeContext(outCanvas);
    if (!ctx) return canvas;

    ctx.drawImage(canvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    // Determine target color RGB
    let tr = 255, tg = 255, tb = 255;
    if (targetColor === 'light-blue') {
      tr = 205; tg = 227; tb = 247;
    } else if (targetColor.startsWith('#')) {
      const hex = targetColor.replace('#', '');
      if (hex.length === 6) {
        tr = parseInt(hex.substring(0, 2), 16);
        tg = parseInt(hex.substring(2, 4), 16);
        tb = parseInt(hex.substring(4, 6), 16);
      }
    }

    // Sample top corner background color baseline
    let baseR = 0, baseG = 0, baseB = 0, sampleCount = 0;
    for (let y = 0; y < Math.min(10, h); y++) {
      for (let x = 0; x < Math.min(10, w); x++) {
        const i = (y * w + x) * 4;
        baseR += data[i];
        baseG += data[i + 1];
        baseB += data[i + 2];
        sampleCount++;
      }
      for (let x = Math.max(0, w - 10); x < w; x++) {
        const i = (y * w + x) * 4;
        baseR += data[i];
        baseG += data[i + 1];
        baseB += data[i + 2];
        sampleCount++;
      }
    }
    baseR = Math.round(baseR / Math.max(1, sampleCount));
    baseG = Math.round(baseG / Math.max(1, sampleCount));
    baseB = Math.round(baseB / Math.max(1, sampleCount));

    const tolerance = 45;

    // Subject center region to protect face/eyes
    const faceLeft = faceBox.x;
    const faceRight = faceBox.x + faceBox.width;
    const faceTop = faceBox.y;
    const faceBottom = faceBox.y + faceBox.height * 1.35; // head and chin

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Protect inner face bounding box from replacement
        if (x >= faceLeft + 5 && x <= faceRight - 5 && y >= faceTop + 5 && y <= faceBottom) {
          continue;
        }

        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const colorDist = Math.sqrt(
          Math.pow(r - baseR, 2) + Math.pow(g - baseG, 2) + Math.pow(b - baseB, 2)
        );

        if (colorDist < tolerance) {
          const factor = Math.min(1, Math.max(0, 1 - colorDist / tolerance));
          data[i] = Math.round(tr * factor + r * (1 - factor));
          data[i + 1] = Math.round(tg * factor + g * (1 - factor));
          data[i + 2] = Math.round(tb * factor + b * (1 - factor));
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return outCanvas;
  }

  /**
   * Renders the cropped, scaled ID photo.
   */
  renderIdPhoto(
    sourceCanvas: HTMLCanvasElement,
    faceBox: FaceBoundingBox,
    cropOptions: IdPhotoCropOptions,
    targetWidthPx: number,
    targetHeightPx: number,
    bgOptions?: IdPhotoBackgroundOptions
  ): HTMLCanvasElement {
    const crop = this.calculateCropBox(sourceCanvas.width, sourceCanvas.height, faceBox, cropOptions);

    const croppedCanvas = createSafeCanvas(targetWidthPx, targetHeightPx);
    const ctx = getSafeContext(croppedCanvas);
    if (!ctx) return sourceCanvas;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      sourceCanvas,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, targetWidthPx, targetHeightPx
    );

    // If background replacement is requested
    if (bgOptions?.replace && bgOptions.color !== 'none') {
      const suitability = this.checkBackgroundSuitability(croppedCanvas);
      if (suitability.suitable) {
        // Scaled face position in the cropped canvas
        const scaleX = targetWidthPx / crop.width;
        const scaleY = targetHeightPx / crop.height;
        const scaledFace: FaceBoundingBox = {
          x: Math.round((faceBox.x - crop.x) * scaleX),
          y: Math.round((faceBox.y - crop.y) * scaleY),
          width: Math.round(faceBox.width * scaleX),
          height: Math.round(faceBox.height * scaleY)
        };
        return this.replaceBackground(croppedCanvas, scaledFace, bgOptions.color);
      }
    }

    return croppedCanvas;
  }

  /**
   * Calculates print sheet layout for tiling N copies on 4x6 or A4 sheets.
   */
  calculateSheetLayout(photoWidthPx: number, photoHeightPx: number, options: PrintSheetOptions): PrintSheetLayout {
    const dpi = options.dpi || 300;
    const mmToPx = (mm: number) => Math.round((mm * dpi) / 25.4);

    let sheetWidthMm = 101.6; // 4 inches
    let sheetHeightMm = 152.4; // 6 inches
    if (options.paperSize === 'a4') {
      sheetWidthMm = 210;
      sheetHeightMm = 297;
    }

    const sheetWidthPx = mmToPx(sheetWidthMm);
    const sheetHeightPx = mmToPx(sheetHeightMm);
    const gapPx = mmToPx(options.gapMm || 3);
    const marginPx = mmToPx(3.5); // 3.5mm sheet margin

    const availWidth = sheetWidthPx - marginPx * 2;
    const availHeight = sheetHeightPx - marginPx * 2;

    const maxCols = Math.max(1, Math.floor((availWidth + gapPx) / (photoWidthPx + gapPx)));
    const maxRows = Math.max(1, Math.floor((availHeight + gapPx) / (photoHeightPx + gapPx)));
    const maxFit = maxCols * maxRows;

    const requestedCopies = options.copies || 6;
    const totalCopies = Math.min(requestedCopies, maxFit);

    // Calculate actual grid rows and columns needed for totalCopies
    let cols = Math.min(totalCopies, maxCols);
    let rows = Math.ceil(totalCopies / cols);
    if (rows > maxRows) {
      rows = maxRows;
      cols = Math.ceil(totalCopies / rows);
    }

    const gridWidth = cols * photoWidthPx + (cols - 1) * gapPx;
    const gridHeight = rows * photoHeightPx + (rows - 1) * gapPx;
    const startX = Math.round((sheetWidthPx - gridWidth) / 2);
    const startY = Math.round((sheetHeightPx - gridHeight) / 2);

    const positions: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (let i = 0; i < totalCopies; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.push({
        x: startX + col * (photoWidthPx + gapPx),
        y: startY + row * (photoHeightPx + gapPx),
        width: photoWidthPx,
        height: photoHeightPx
      });
    }

    return {
      sheetWidthPx,
      sheetHeightPx,
      photoWidthPx,
      photoHeightPx,
      columns: cols,
      rows,
      totalCopies,
      positions
    };
  }

  /**
   * Generates a printable sheet with tiled copies and cut marks.
   */
  generatePrintSheet(photoCanvas: HTMLCanvasElement, options: PrintSheetOptions): HTMLCanvasElement {
    const layout = this.calculateSheetLayout(photoCanvas.width, photoCanvas.height, options);

    const sheet = createSafeCanvas(layout.sheetWidthPx, layout.sheetHeightPx);
    const ctx = getSafeContext(sheet);
    if (!ctx) return photoCanvas;

    // White paper surface
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, sheet.width, sheet.height);

    // Draw photo copies
    for (const pos of layout.positions) {
      ctx.drawImage(photoCanvas, pos.x, pos.y, pos.width, pos.height);

      // Draw cut marks if requested
      if (options.includeCutMarks) {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        const markLen = 8;

        // Top-left corner tick marks
        ctx.beginPath();
        ctx.moveTo(pos.x - 2, pos.y);
        ctx.lineTo(pos.x - 2 - markLen, pos.y);
        ctx.moveTo(pos.x, pos.y - 2);
        ctx.lineTo(pos.x, pos.y - 2 - markLen);

        // Top-right corner tick marks
        ctx.moveTo(pos.x + pos.width + 2, pos.y);
        ctx.lineTo(pos.x + pos.width + 2 + markLen, pos.y);
        ctx.moveTo(pos.x + pos.width, pos.y - 2);
        ctx.lineTo(pos.x + pos.width, pos.y - 2 - markLen);

        // Bottom-left corner tick marks
        ctx.moveTo(pos.x - 2, pos.y + pos.height);
        ctx.lineTo(pos.x - 2 - markLen, pos.y + pos.height);
        ctx.moveTo(pos.x, pos.y + pos.height + 2);
        ctx.lineTo(pos.x + pos.width + 2 + markLen, pos.y + pos.height);
        ctx.moveTo(pos.x + pos.width, pos.y + pos.height + 2);
        ctx.lineTo(pos.x + pos.width, pos.y + pos.height + 2 + markLen);
        ctx.stroke();
      }
    }

    return sheet;
  }
}
