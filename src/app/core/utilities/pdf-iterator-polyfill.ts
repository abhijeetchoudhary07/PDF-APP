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
