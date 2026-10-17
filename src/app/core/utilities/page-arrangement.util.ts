/**
 * Pure index-permutation functions for PDF page arrangement modes.
 *
 * Supported arrangement modes:
 *   • Reverse:        Last page first (e.g. 1,2,3,4,5,6 → 6,5,4,3,2,1).
 *   • Odd-Even Split: All odd pages first, followed by all even pages
 *                     (e.g. 1,2,3,4,5,6 → 1,3,5, 2,4,6).
 *   • Odd-Even Merge: The inverse of split — interleaves the first half
 *                     with the second half (e.g. 1,3,5, 2,4,6 → 1,2,3,4,5,6).
 *   • Duplex Sort:    Document is all front pages in order followed by all back
 *                     pages (frequently reversed by ADF scanners). Interleaves
 *                     to true reading order, with a toggle for whether backs
 *                     are reversed.
 *
 * Each permutation function returns an array of 0-based indices where:
 *   permutation[newIndex] = oldIndex
 * Applying the permutation: newArray = permutation.map(oldIdx => oldArray[oldIdx])
 */

export type PageArrangementMode =
  | 'reverse'
  | 'odd-even-split'
  | 'odd-even-merge'
  | 'duplex-sort'
  | 'custom-expression';

export interface PageArrangementOptions {
  /**
   * For Duplex Sort: whether the back pages were scanned in reverse order
   * (e.g. last sheet's back appears first in the back stack). Default is true.
   */
  backsReversed?: boolean;
}

export interface PageArrangementPreview {
  mode: PageArrangementMode;
  pageCount: number;
  permutation: number[]; // 0-indexed: permutation[newIndex] = oldIndex
  previousOrder: number[]; // 1-indexed (e.g. [1, 2, 3, 4, 5, 6])
  newOrder: number[]; // 1-indexed (e.g. [6, 5, 4, 3, 2, 1])
}

export class PageArrangementUtil {
  /**
   * Pure permutation for Reverse:
   * Maps 0..count-1 to count-1..0.
   */
  static permuteReverse(count: number): number[] {
    if (!Number.isFinite(count) || count <= 0) return [];
    const n = Math.floor(count);
    const p: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      p[i] = n - 1 - i;
    }
    return p;
  }

  /**
   * Pure permutation for Odd-Even Split:
   * 1-indexed odd pages first (indices 0, 2, 4, ...),
   * followed by 1-indexed even pages (indices 1, 3, 5, ...).
   */
  static permuteOddEvenSplit(count: number): number[] {
    if (!Number.isFinite(count) || count <= 0) return [];
    const n = Math.floor(count);
    const p: number[] = [];
    // Odds (1-indexed: 1, 3, 5, ...) -> 0-based: 0, 2, 4, ...
    for (let i = 0; i < n; i += 2) {
      p.push(i);
    }
    // Evens (1-indexed: 2, 4, 6, ...) -> 0-based: 1, 3, 5, ...
    for (let i = 1; i < n; i += 2) {
      p.push(i);
    }
    return p;
  }

  /**
   * Pure permutation for Odd-Even Merge:
   * The inverse of Odd-Even Split.
   * Splits input into first half (ceil(count/2) elements) and second half (floor(count/2) elements),
   * then interleaves them: first[0], second[0], first[1], second[1], ...
   */
  static permuteOddEvenMerge(count: number): number[] {
    if (!Number.isFinite(count) || count <= 0) return [];
    const n = Math.floor(count);
    const nFirst = Math.ceil(n / 2);
    const p: number[] = [];
    for (let i = 0; i < nFirst; i++) {
      p.push(i);
      const secondIdx = nFirst + i;
      if (secondIdx < n) {
        p.push(secondIdx);
      }
    }
    return p;
  }

  /**
   * Pure permutation for Duplex Sort:
   * The document has all front sides in order followed by all back sides.
   * Number of fronts = ceil(count/2), backs = floor(count/2).
   *
   * If backsReversed is true (common with ADF scanning where the last sheet
   * ends up on top of the back stack), the back indices are reversed before interleaving.
   *
   * Interleaving: Front 1, Back 1, Front 2, Back 2, ...
   */
  static permuteDuplexSort(count: number, backsReversed = true): number[] {
    if (!Number.isFinite(count) || count <= 0) return [];
    const n = Math.floor(count);
    const nFronts = Math.ceil(n / 2);
    const nBacks = Math.floor(n / 2);

    const frontIndices: number[] = [];
    for (let i = 0; i < nFronts; i++) {
      frontIndices.push(i);
    }

    const backIndices: number[] = [];
    for (let i = 0; i < nBacks; i++) {
      backIndices.push(nFronts + i);
    }

    if (backsReversed) {
      backIndices.reverse();
    }

    const p: number[] = [];
    for (let i = 0; i < nFronts; i++) {
      p.push(frontIndices[i]);
      if (i < backIndices.length) {
        p.push(backIndices[i]);
      }
    }
    return p;
  }

  /**
   * Dispatches to the corresponding pure permutation function based on mode.
   */
  static getPermutation(
    mode: PageArrangementMode,
    count: number,
    options?: PageArrangementOptions
  ): number[] {
    if (!Number.isFinite(count) || count <= 0) return [];

    switch (mode) {
      case 'reverse':
        return this.permuteReverse(count);
      case 'odd-even-split':
        return this.permuteOddEvenSplit(count);
      case 'odd-even-merge':
        return this.permuteOddEvenMerge(count);
      case 'duplex-sort':
        return this.permuteDuplexSort(count, options?.backsReversed !== false);
      case 'custom-expression':
        return [];
      default: {
        const exhaustiveCheck: never = mode;
        throw new Error(`Unknown arrangement mode: ${exhaustiveCheck}`);
      }
    }
  }

  /**
   * Applies an index permutation to any array of items.
   * Returns a new array with items in the permuted order.
   */
  static applyPermutation<T>(items: T[], permutation: number[]): T[] {
    if (!Array.isArray(items) || !Array.isArray(permutation)) return [];
    return permutation.map(oldIdx => items[oldIdx]);
  }
}
