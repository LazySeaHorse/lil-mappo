import { describe, it, expect } from 'vitest';
import { hash01, hashInts, seededRandom } from './random';

describe('random', () => {
  it('hashes the same inputs to the same value and different inputs apart', () => {
    expect(hashInts(1, 2, 3)).toBe(hashInts(1, 2, 3));
    expect(hashInts(1, 2, 3)).not.toBe(hashInts(3, 2, 1));
    expect(hash01(7, 0)).not.toBe(hash01(7, 1));
  });

  it('keeps hash01 in [0, 1) and roughly uniform', () => {
    const values = Array.from({ length: 2000 }, (_, i) => hash01(42, i));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('replays a seeded sequence exactly', () => {
    const a = seededRandom(5);
    const b = seededRandom(5);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(seededRandom(6)()).not.toBe(first[0]);
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
