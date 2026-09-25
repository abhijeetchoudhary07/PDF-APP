/**
 * Built-ins the app uses that older Android WebViews do not ship.
 *
 * `.browserslistrc` makes esbuild downlevel modern *syntax*, but it cannot
 * invent missing *runtime* APIs. The app declares `minSdkVersion 24`, and the
 * WebView on those devices is whatever the vendor shipped -- Chrome 91 on the
 * Android 10 image, older still on 7/8/9. Without these shims the very first
 * Angular bootstrap throws `Object.hasOwn is not a function` and the person
 * gets a blank white screen with nothing on it to explain why.
 *
 * Each entry is feature-detected, so on a current WebView this file costs one
 * `typeof` check per API and changes nothing. Keep it in sync with what the
 * bundle actually calls rather than pulling in the whole of core-js.
 */

/* globalThis -- Chrome 71. Everything below refers to it. */
(function ensureGlobalThis(): void {
  if (typeof globalThis === 'object') return;
  Object.defineProperty(Object.prototype, '__magic__', {
    get(): unknown {
      return this;
    },
    configurable: true,
  });
  // @ts-expect-error -- bootstrapping the very symbol we are defining.
  __magic__.globalThis = __magic__;
  // @ts-expect-error -- see above.
  delete Object.prototype.__magic__;
})();

const g = globalThis as unknown as Record<string, unknown>;

/* Object.hasOwn -- Chrome 93. Angular's own runtime calls this on bootstrap. */
if (typeof (Object as { hasOwn?: unknown }).hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    value: function hasOwn(target: object, key: PropertyKey): boolean {
      if (target === null || target === undefined) {
        throw new TypeError('Cannot convert undefined or null to object');
      }
      return Object.prototype.hasOwnProperty.call(Object(target), key);
    },
    configurable: true,
    writable: true,
  });
}

/* Array.prototype.at / String.prototype.at -- Chrome 92. */
function at(this: { length: number; [i: number]: unknown }, index: number): unknown {
  const len = this.length;
  // Truncate toward zero the way the spec's ToIntegerOrInfinity does.
  let i = Math.trunc(Number(index)) || 0;
  if (i < 0) i += len;
  return i < 0 || i >= len ? undefined : this[i];
}
for (const proto of [Array.prototype, String.prototype] as Array<Record<string, unknown>>) {
  if (typeof proto['at'] !== 'function') {
    Object.defineProperty(proto, 'at', { value: at, configurable: true, writable: true });
  }
}

/* String.prototype.replaceAll -- Chrome 85. */
if (typeof String.prototype.replaceAll !== 'function') {
  Object.defineProperty(String.prototype, 'replaceAll', {
    value: function replaceAll(this: string, search: unknown, replacement: unknown): string {
      if (search instanceof RegExp) {
        if (!search.global) {
          throw new TypeError('replaceAll must be called with a global RegExp');
        }
        return this.replace(search, replacement as string);
      }
      // split/join rather than a built RegExp: the needle is literal text and
      // must not be reinterpreted as a pattern.
      return this.split(String(search)).join(String(replacement));
    },
    configurable: true,
    writable: true,
  });
}

/* Array.prototype.findLast / findLastIndex -- Chrome 97. */
if (typeof (Array.prototype as { findLastIndex?: unknown }).findLastIndex !== 'function') {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value: function findLastIndex(this: unknown[], predicate: Function, thisArg?: unknown): number {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate.call(thisArg, this[i], i, this)) return i;
      }
      return -1;
    },
    configurable: true,
    writable: true,
  });
}
if (typeof (Array.prototype as { findLast?: unknown }).findLast !== 'function') {
  Object.defineProperty(Array.prototype, 'findLast', {
    value: function findLast(this: unknown[], predicate: Function, thisArg?: unknown): unknown {
      const i = (this as unknown[] & { findLastIndex: Function }).findLastIndex(predicate, thisArg);
      return i === -1 ? undefined : this[i];
    },
    configurable: true,
    writable: true,
  });
}

/* Array.prototype.flatMap / flat -- Chrome 69. */
if (typeof (Array.prototype as { flat?: unknown }).flat !== 'function') {
  Object.defineProperty(Array.prototype, 'flat', {
    value: function flat(this: unknown[], depth = 1): unknown[] {
      return depth < 1
        ? this.slice()
        : this.reduce<unknown[]>(
            (acc, v) =>
              acc.concat(
                Array.isArray(v) ? (v as unknown[] & { flat: Function }).flat(depth - 1) : v,
              ),
            [],
          );
    },
    configurable: true,
    writable: true,
  });
}
if (typeof (Array.prototype as { flatMap?: unknown }).flatMap !== 'function') {
  Object.defineProperty(Array.prototype, 'flatMap', {
    value: function flatMap(this: unknown[], fn: Function, thisArg?: unknown): unknown[] {
      return (this.map(fn as never, thisArg) as unknown[] & { flat: Function }).flat(1);
    },
    configurable: true,
    writable: true,
  });
}

/*
 * structuredClone -- Chrome 98.
 *
 * The real algorithm walks cyclic graphs and handles Blob, File, Map, Set,
 * TypedArray and Date. This covers those plus cycles, which is everything the
 * app clones; it deliberately throws on functions and DOM nodes exactly as the
 * native version does, rather than silently dropping them.
 */
if (typeof g['structuredClone'] !== 'function') {
  g['structuredClone'] = function structuredClone(input: unknown): unknown {
    const seen = new WeakMap<object, unknown>();
    const walk = (value: unknown): unknown => {
      if (value === null || typeof value !== 'object') {
        if (typeof value === 'function') {
          throw new DOMException('Function could not be cloned.', 'DataCloneError');
        }
        return value;
      }
      const obj = value as object;
      if (seen.has(obj)) return seen.get(obj);

      // Host objects are passed through by reference: the platform owns them
      // and a field-by-field copy would produce something subtly broken.
      if (obj instanceof Blob || obj instanceof ArrayBuffer) return obj;
      if (obj instanceof Date) return new Date(obj.getTime());
      if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);
      if (ArrayBuffer.isView(obj)) return (obj as Uint8Array).slice();

      if (obj instanceof Map) {
        const copy = new Map();
        seen.set(obj, copy);
        obj.forEach((v, k) => copy.set(walk(k), walk(v)));
        return copy;
      }
      if (obj instanceof Set) {
        const copy = new Set();
        seen.set(obj, copy);
        obj.forEach((v) => copy.add(walk(v)));
        return copy;
      }
      if (Array.isArray(obj)) {
        const copy: unknown[] = [];
        seen.set(obj, copy);
        obj.forEach((v, i) => (copy[i] = walk(v)));
        return copy;
      }

      const copy: Record<string, unknown> = {};
      seen.set(obj, copy);
      for (const key of Object.keys(obj)) {
        copy[key] = walk((obj as Record<string, unknown>)[key]);
      }
      return copy;
    };
    return walk(input);
  };
}

/*
 * The `Iterator` global -- Chrome 122.
 *
 * pdfjs-dist ships its own shim for `Iterator.prototype.join`, but it guards
 * with `typeof Iterator.prototype.join !== 'function'`, which dereferences a
 * global that does not exist on an older WebView. The *guard* is what throws:
 * `ReferenceError: Iterator is not defined`, at import time, before any of the
 * app runs.
 *
 * Handing it the real %IteratorPrototype% -- reached through a live iterator,
 * since the intrinsic is not otherwise exposed -- makes that check evaluate
 * normally and lets the library install its own method where it expects to.
 * This is not the ES2025 Iterator Helpers API and does not pretend to be; it
 * exists so feature detection can run.
 */
if (typeof g['Iterator'] === 'undefined') {
  const iteratorPrototype = Object.getPrototypeOf(
    Object.getPrototypeOf([][Symbol.iterator]()),
  );
  function Iterator(this: unknown): void {
    throw new TypeError('Abstract class Iterator not directly constructable');
  }
  Iterator.prototype = iteratorPrototype;
  g['Iterator'] = Iterator;
}
