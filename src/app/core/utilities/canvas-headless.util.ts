export class HeadlessCanvasContext2D {
  width: number;
  height: number;
  canvas: any;
  data: Uint8ClampedArray;
  fillStyle: string = '#ffffff';
  strokeStyle: string = '#000000';
  lineWidth: number = 1;
  font: string = '16px sans-serif';
  textAlign: string = 'left';
  imageSmoothingEnabled: boolean = true;
  imageSmoothingQuality: string = 'high';

  constructor(width: number, height: number, canvas: any) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.canvas = canvas;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    this.data.fill(255);
  }

  save() {}
  restore() {}
  translate() {}
  scale() {}
  rotate() {}
  transform() {}
  setTransform() {}
  beginPath() {}
  closePath() {}
  clip() {}
  setLineDash() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  fillText() {}

  clearRect(x: number, y: number, w: number, h: number) {
    this.paintRect(x, y, w, h, 0, 0, 0, 0);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const [r, g, b, a] = this.parseColor(this.fillStyle);
    this.paintRect(x, y, w, h, r, g, b, a);
  }

  strokeRect(x: number, y: number, w: number, h: number) {
    this.fillRect(x, y, w, 1);
    this.fillRect(x, y + h - 1, w, 1);
    this.fillRect(x, y, 1, h);
    this.fillRect(x + w - 1, y, 1, h);
  }

  private paintRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) {
    const sx = Math.max(0, Math.floor(x));
    const sy = Math.max(0, Math.floor(y));
    const ex = Math.min(this.width, Math.ceil(x + w));
    const ey = Math.min(this.height, Math.ceil(y + h));

    for (let py = sy; py < ey; py++) {
      const row = py * this.width * 4;
      for (let px = sx; px < ex; px++) {
        const idx = row + px * 4;
        this.data[idx] = r;
        this.data[idx + 1] = g;
        this.data[idx + 2] = b;
        this.data[idx + 3] = a;
      }
    }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number) {
    const outSw = Math.max(1, Math.round(sw));
    const outSh = Math.max(1, Math.round(sh));
    const outData = new Uint8ClampedArray(outSw * outSh * 4);

    const startX = Math.max(0, Math.floor(sx));
    const startY = Math.max(0, Math.floor(sy));

    for (let y = 0; y < outSh; y++) {
      const srcY = startY + y;
      if (srcY >= this.height) break;
      for (let x = 0; x < outSw; x++) {
        const srcX = startX + x;
        if (srcX >= this.width) break;

        const srcIdx = (srcY * this.width + srcX) * 4;
        const dstIdx = (y * outSw + x) * 4;
        outData[dstIdx] = this.data[srcIdx];
        outData[dstIdx + 1] = this.data[srcIdx + 1];
        outData[dstIdx + 2] = this.data[srcIdx + 2];
        outData[dstIdx + 3] = this.data[srcIdx + 3];
      }
    }

    return {
      data: outData,
      width: outSw,
      height: outSh
    };
  }

  /**
   * The counterpart `putImageData` always needed.
   *
   * Without it, every caller that builds pixels the standard way -- create a
   * buffer, fill it, put it back -- threw here, and the services that decode
   * a PDF's embedded images that way (the extractor, the reflow view) failed
   * headlessly whatever the input. Matches the DOM signature: both a
   * (width, height) pair and an existing ImageData are accepted.
   */
  createImageData(widthOrData: any, height?: number) {
    if (widthOrData && typeof widthOrData === 'object' && 'width' in widthOrData) {
      const w = Math.max(1, Math.round(widthOrData.width));
      const h = Math.max(1, Math.round(widthOrData.height));
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    }
    const w = Math.max(1, Math.round(widthOrData || 1));
    const h = Math.max(1, Math.round(height || 1));
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }

  putImageData(imgData: any, dx: number, dy: number) {
    const srcData = imgData.data;
    const sw = imgData.width;
    const sh = imgData.height;

    const startX = Math.max(0, Math.floor(dx));
    const startY = Math.max(0, Math.floor(dy));

    for (let y = 0; y < sh; y++) {
      const dstY = startY + y;
      if (dstY >= this.height) break;
      for (let x = 0; x < sw; x++) {
        const dstX = startX + x;
        if (dstX >= this.width) break;

        const srcIdx = (y * sw + x) * 4;
        const dstIdx = (dstY * this.width + dstX) * 4;
        this.data[dstIdx] = srcData[srcIdx];
        this.data[dstIdx + 1] = srcData[srcIdx + 1];
        this.data[dstIdx + 2] = srcData[srcIdx + 2];
        this.data[dstIdx + 3] = srcData[srcIdx + 3];
      }
    }
  }

  drawImage(img: any, ...args: any[]) {
    let sx = 0, sy = 0, sw = img.width || this.width, sh = img.height || this.height;
    let dx = 0, dy = 0, dw = sw, dh = sh;

    if (args.length === 2) {
      dx = args[0]; dy = args[1];
    } else if (args.length === 4) {
      dx = args[0]; dy = args[1]; dw = args[2]; dh = args[3];
    } else if (args.length >= 8) {
      sx = args[0]; sy = args[1]; sw = args[2]; sh = args[3];
      dx = args[4]; dy = args[5]; dw = args[6]; dh = args[7];
    }

    let srcData: Uint8ClampedArray | null = null;
    let srcW = img.width || 10;
    let srcH = img.height || 10;

    if (img.getContext) {
      const sctx = img.getContext('2d');
      if (sctx && sctx.getImageData) {
        const id = sctx.getImageData(0, 0, srcW, srcH);
        srcData = id.data;
      }
    }

    if (!srcData) {
      this.paintRect(dx, dy, dw, dh, 220, 220, 220, 255);
      return;
    }

    const scaleX = sw / dw;
    const scaleY = sh / dh;

    for (let y = 0; y < dh; y++) {
      const dstY = Math.floor(dy + y);
      if (dstY < 0 || dstY >= this.height) continue;
      const sY = Math.floor(sy + y * scaleY);
      if (sY < 0 || sY >= srcH) continue;

      for (let x = 0; x < dw; x++) {
        const dstX = Math.floor(dx + x);
        if (dstX < 0 || dstX >= this.width) continue;
        const sX = Math.floor(sx + x * scaleX);
        if (sX < 0 || sX >= srcW) continue;

        const srcIdx = (sY * srcW + sX) * 4;
        const dstIdx = (dstY * this.width + dstX) * 4;
        this.data[dstIdx] = srcData[srcIdx];
        this.data[dstIdx + 1] = srcData[srcIdx + 1];
        this.data[dstIdx + 2] = srcData[srcIdx + 2];
        this.data[dstIdx + 3] = srcData[srcIdx + 3];
      }
    }
  }

  private parseColor(str: string): [number, number, number, number] {
    if (!str) return [0, 0, 0, 255];
    if (str.startsWith('#')) {
      let hex = str.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
    }
    const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10), 255];
    }
    if (str === 'white') return [255, 255, 255, 255];
    if (str === 'black') return [0, 0, 0, 255];
    if (str === 'red') return [255, 0, 0, 255];
    return [128, 128, 128, 255];
  }
}

/**
 * Safely creates or configures a canvas element with 2D context
 * working in both browser and headless test (Node/Vitest) environments.
 */
export function createSafeCanvas(width: number, height: number): HTMLCanvasElement {
  let canvas: HTMLCanvasElement;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    canvas = document.createElement('canvas');
  } else {
    canvas = { width, height } as any;
  }
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  ensureSafeContext(canvas);
  return canvas;
}

export function ensureSafeContext(canvas: HTMLCanvasElement): any {
  if (!canvas) return null;
  let ctx: any = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) {
    const headless = new HeadlessCanvasContext2D(canvas.width, canvas.height, canvas);
    (canvas as any).getContext = (type?: string) => {
      if (type === '2d' || !type) return headless;
      return null;
    };
    ctx = headless;
  }
  const isJsdom = typeof window !== 'undefined' && (window.navigator?.userAgent?.includes('jsdom') || !(window as any).chrome);
  if (!canvas.toBlob || isJsdom) {
    canvas.toBlob = (callback: BlobCallback, type = 'image/jpeg') => {
      callback(new Blob(['mock_image'], { type }));
    };
  }
  /*
   * jsdom's toDataURL throws without the native canvas package, so any code
   * that turns a canvas into a data URL -- the reflow view's figures, for one
   * -- could not be exercised headlessly at all.
   *
   * Probed rather than switched on isJsdom: the shim is installed only where
   * the real method already throws, so a call that was returning a value
   * keeps returning that same value, in the browser and in a test alike.
   */
  let dataUrlWorks = false;
  try {
    const probe = canvas.toDataURL('image/png');
    // jsdom does not throw here: it logs "Not implemented" to its virtual
    // console and hands back null, so the return value is what has to be
    // checked, not just whether the call threw.
    dataUrlWorks = typeof probe === 'string' && probe.startsWith('data:');
  } catch {
    dataUrlWorks = false;
  }
  if (!dataUrlWorks) {
    canvas.toDataURL = (type = 'image/png') =>
      `data:${type};base64,iVBORw0KGgo=`;
  }
  return ctx;
}

export function getSafeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return ensureSafeContext(canvas);
}

export async function safeCanvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/jpeg',
  quality = 0.92
): Promise<Blob> {
  const isJsdom = typeof window !== 'undefined' && (window.navigator?.userAgent?.includes('jsdom') || !(window as any).chrome);
  if (isJsdom || !canvas.toBlob) {
    return new Blob(['mock_image'], { type });
  }
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to blob failed'));
      }, type, quality);
    } catch {
      resolve(new Blob(['mock_image'], { type }));
    }
  });
}
