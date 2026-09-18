/**
 * Mulberry32 32-bit Pseudo-Random Number Generator.
 * Provides deterministic pseudo-random sequences given an integer seed.
 */
export class SeededRandom {
  private state: number;
  public readonly seed: number;

  constructor(seed: number = Math.floor(Math.random() * 1_000_000_000)) {
    this.seed = seed;
    this.state = seed >>> 0;
  }

  /**
   * Returns a pseudorandom number between 0 (inclusive) and 1 (exclusive).
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a pseudorandom integer between min and max (inclusive).
   */
  int(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(this.next() * (hi - lo + 1)) + lo;
  }

  /**
   * Returns a pseudorandom float between min and max.
   */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Returns true with probability `chance` (0 to 1).
   */
  boolean(chance = 0.5): boolean {
    return this.next() < chance;
  }

  /**
   * Randomly selects one element from an array.
   */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from an empty array');
    }
    return array[this.int(0, array.length - 1)];
  }

  /**
   * Selects an item based on relative weights.
   */
  weightedPick<T>(options: Array<{ item: T; weight: number }>): T {
    const totalWeight = options.reduce((sum, opt) => sum + Math.max(0, opt.weight), 0);
    if (totalWeight <= 0) {
      return this.pick(options.map((o) => o.item));
    }
    let threshold = this.next() * totalWeight;
    for (const opt of options) {
      threshold -= Math.max(0, opt.weight);
      if (threshold <= 0) {
        return opt.item;
      }
    }
    return options[options.length - 1].item;
  }

  /**
   * Generates edge-case strings for fuzzing input fields.
   */
  fuzzyString(): string {
    const corpus = [
      '', // empty
      '   ', // whitespace only
      'Tokyo → Paris (High Speed)',
      'Waypoints: 35.6762, 139.6503',
      '🎉 Map Animation 🚀 100% 📍',
      '<script>alert("xss")</script>',
      'DROP TABLE projects;--',
      'VeryLongRouteName'.repeat(20),
      '!@#$%^&*()_+-=[]{}|;:",.<>?/`~',
      '0',
      '-1',
      'NaN',
      'null',
      'undefined',
      '1e10',
      'مرحبا بالعالم', // RTL Arabic
      'София → Варна', // Cyrillic
      '🇨🇭 Bern 🗻',
    ];
    return this.pick(corpus);
  }

  /**
   * Generates edge-case numbers for numeric inputs.
   */
  fuzzyNumber(fallbackRange: [number, number] = [0, 100]): number {
    const edgeCases = [
      0,
      -1,
      -999,
      0.0001,
      1,
      24,
      30,
      60,
      120,
      999999,
      fallbackRange[0],
      fallbackRange[1],
      (fallbackRange[0] + fallbackRange[1]) / 2,
    ];
    if (this.boolean(0.6)) {
      return this.pick(edgeCases);
    }
    return this.float(fallbackRange[0], fallbackRange[1]);
  }
}
