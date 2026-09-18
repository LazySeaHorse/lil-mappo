import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../../e2e/fuzz/prng';
import { FlightRecorder } from '../../e2e/fuzz/flightRecorder';

describe('SeededRandom (Mulberry32)', () => {
  it('produces identical sequences for the same seed', () => {
    const rng1 = new SeededRandom(123456);
    const rng2 = new SeededRandom(123456);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = new SeededRandom(1111);
    const rng2 = new SeededRandom(2222);

    expect(rng1.next()).not.toEqual(rng2.next());
  });

  it('respects integer bounds [min, max]', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 50; i++) {
      const val = rng.int(5, 10);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  it('weightedPick respects weights', () => {
    const rng = new SeededRandom(999);
    const options = [
      { item: 'rare', weight: 0 },
      { item: 'common', weight: 100 },
    ];
    for (let i = 0; i < 20; i++) {
      expect(rng.weightedPick(options)).toBe('common');
    }
  });
});

describe('FlightRecorder', () => {
  it('records actions and maintains ring buffer within capacity', () => {
    const recorder = new FlightRecorder(5);
    for (let i = 1; i <= 10; i++) {
      recorder.record('timeline', `Action ${i}`, { index: i });
    }

    expect(recorder.getTotalSteps()).toBe(10);
    const recent = recorder.getRecent();
    expect(recent).toHaveLength(5);
    expect(recent[0].name).toBe('Action 6');
    expect(recent[4].name).toBe('Action 10');
  });

  it('formats readable reproduction trace with seed and reason', () => {
    const recorder = new FlightRecorder(10);
    recorder.record('timeline', 'Scrub playhead', { time: 4.2 });
    recorder.record('canvas', 'Drag map', { dx: 50, dy: -20 });

    const trace = recorder.formatTrace(777, 'Invariant error: NaN pitch');
    expect(trace).toContain('Seed: 777');
    expect(trace).toContain('Invariant error: NaN pitch');
    expect(trace).toContain('Scrub playhead');
    expect(trace).toContain('Drag map');
  });
});
