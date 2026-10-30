// Polyfill Iterator for pdfjs-dist v6 in environments where Iterator is not yet global
if (typeof (globalThis as any).Iterator === 'undefined') {
  (globalThis as any).Iterator = class {};
}

// Polyfill Promise.withResolvers for pdfjs-dist v6 in environments prior to Node 22 / ES2024
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Polyfill Promise.try for pdfjs-dist v6 in environments prior to ES2024
if (typeof (Promise as any).try === 'undefined') {
  (Promise as any).try = function <T>(fn: (...args: any[]) => T | PromiseLike<T>, ...args: any[]): Promise<T> {
    return new Promise(resolve => resolve(fn(...args)));
  };
}

// Polyfill Uint8Array.prototype.toHex for pdfjs-dist v6 in environments prior to Node 22
if (typeof Uint8Array !== 'undefined' && !(Uint8Array.prototype as any).toHex) {
  (Uint8Array.prototype as any).toHex = function () {
    return Array.from(this)
      .map((b: any) => b.toString(16).padStart(2, '0'))
      .join('');
  };
}

// Polyfill Map.prototype.getOrInsertComputed for pdfjs-dist v6
if (typeof Map !== 'undefined' && !(Map.prototype as any).getOrInsertComputed) {
  (Map.prototype as any).getOrInsertComputed = function (key: any, callback: (key: any) => any) {
    if (this.has(key)) {
      return this.get(key);
    }
    const value = callback(key);
    this.set(key, value);
    return value;
  };
}

// Polyfill Math.sumPrecise for pdfjs-dist v6 in environments prior to ES2024 / Node 22 full rollout
if (typeof (Math as any).sumPrecise !== 'function') {
  (Math as any).sumPrecise = function (iterable: Iterable<number>): number {
    let sum = 0;
    for (const val of iterable) {
      sum += Number(val);
    }
    return sum;
  };
}

// Polyfill Path2D for pdfjs-dist in headless / jsdom environments
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    points: { x: number; y: number }[] = [];

    addPath(other: any) {
      if (other?.points) this.points.push(...other.points);
    }
    closePath() {}
    moveTo(x: number, y: number) {
      this.points.push({ x, y });
    }
    lineTo(x: number, y: number) {
      this.points.push({ x, y });
    }
    bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, x: number, y: number) {
      this.points.push({ x, y });
    }
    quadraticCurveTo(_cpx: number, _cpy: number, x: number, y: number) {
      this.points.push({ x, y });
    }
    arc(x: number, y: number, r: number) {
      this.points.push({ x: x - r, y: y - r }, { x: x + r, y: y + r });
    }
    arcTo(x1: number, y1: number, x2: number, y2: number) {
      this.points.push({ x: x1, y: y1 }, { x: x2, y: y2 });
    }
    ellipse(x: number, y: number, rx: number, ry: number) {
      this.points.push({ x: x - rx, y: y - ry }, { x: x + rx, y: y + ry });
    }
    rect(x: number, y: number, w: number, h: number) {
      this.points.push(
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h }
      );
    }
  };
}
