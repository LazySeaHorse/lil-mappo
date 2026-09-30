/**
 * Deterministic pseudo-randomness. Styles must never use Math.random: the live
 * preview and the export render the same frame independently and have to agree
 * pixel for pixel, so anything that looks random is derived from a seed.
 */

/** 32-bit integer hash of a list of integers (or floats, which are floored). */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const value of values) {
    h ^= Math.floor(value) | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}

/** A stable number in [0, 1) for the given integers, e.g. (seed, index, tick). */
export function hash01(...values: number[]): number {
  return hashInts(...values) / 0x100000000;
}

/** A seeded generator (mulberry32) returning numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
