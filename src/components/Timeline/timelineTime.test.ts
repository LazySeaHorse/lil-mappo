import { describe, expect, it } from 'vitest';
import { formatRulerLabel, formatTimelineTime, parseTimelineTime, rulerSteps } from './timelineTime';

describe('formatTimelineTime', () => {
  it.each([
    [0, '00:00.00'],
    [5.2, '00:05.20'],
    [59.99, '00:59.99'],
    [60, '01:00.00'],
    [125.349, '02:05.34'],
    // Binary floats: 2.3 is 2.2999..., 4.35 is 4.3499...
    [2.3, '00:02.30'],
    [4.35, '00:04.35'],
    [7.07, '00:07.07'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatTimelineTime(seconds)).toBe(expected);
  });
});

describe('parseTimelineTime', () => {
  it.each([
    ['2', 2],
    ['2.5', 2.5],
    ['00:05.20', 5.2],
    ['1:05.5', 65.5],
    ['01:00', 60],
    [' 3.25 ', 3.25],
  ])('reads %j as %s seconds', (text, expected) => {
    expect(parseTimelineTime(text)).toBeCloseTo(expected, 5);
  });

  it.each(['', 'abc', '-1', '1:2:3', '1:75', '1,5'])('rejects %j', (text) => {
    expect(parseTimelineTime(text)).toBeNull();
  });

  it('reads back what formatTimelineTime writes', () => {
    for (const value of [0, 0.01, 2.3, 4.35, 59.99, 125.34]) {
      expect(parseTimelineTime(formatTimelineTime(value))).toBeCloseTo(value, 5);
    }
  });
});

describe('rulerSteps', () => {
  it('labels every second at the default zoom, with half-second ticks between', () => {
    expect(rulerSteps(100)).toEqual({ labelStep: 1, tickStep: 0.5 });
  });

  it('keeps labels at least 64px apart at every zoom', () => {
    for (let pps = 1; pps <= 300; pps += 1) {
      expect(rulerSteps(pps).labelStep * pps).toBeGreaterThanOrEqual(64);
    }
  });

  it('thins the labels to round times as the timeline zooms out', () => {
    expect(rulerSteps(10).labelStep).toBe(10);
    expect(rulerSteps(4).labelStep).toBe(30);
    expect(rulerSteps(1).labelStep).toBe(120);
  });

  it('only draws ticks that are at least 6px apart', () => {
    for (let pps = 1; pps <= 300; pps += 1) {
      const { tickStep } = rulerSteps(pps);
      expect(tickStep * pps).toBeGreaterThanOrEqual(6);
    }
  });

  it('puts ticks on whole divisions of the label step', () => {
    for (let pps = 1; pps <= 300; pps += 1) {
      const { labelStep, tickStep } = rulerSteps(pps);
      expect(Math.round(labelStep / tickStep)).toBe(labelStep / tickStep);
    }
  });
});

describe('formatRulerLabel', () => {
  it.each([
    [0, 1, '0:00'],
    [65, 1, '1:05'],
    [2.5, 0.5, '0:02.5'],
    [600, 60, '10:00'],
  ])('writes %s s (label step %s) as %s', (seconds, step, expected) => {
    expect(formatRulerLabel(seconds, step)).toBe(expected);
  });
});
