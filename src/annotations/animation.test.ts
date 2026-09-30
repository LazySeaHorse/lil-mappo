import { describe, it, expect } from 'vitest';
import { evaluateTransition, STYLE_ANIMATION } from './animation';

describe('evaluateTransition', () => {
  it('leaves the block untouched for the style animation, in every phase', () => {
    for (const [phase, progress] of [['enter', 0], ['enter', 0.5], ['exit', 0.5], ['exit', 1], ['visible', 1]] as const) {
      expect(evaluateTransition(STYLE_ANIMATION, phase, progress)).toEqual({
        opacity: 1, scaleX: 1, scaleY: 1, translateY: 0,
      });
    }
  });

  it('still fades, scales and slides for block transitions', () => {
    expect(evaluateTransition('fade', 'enter', 0.25).opacity).toBe(0.25);
    expect(evaluateTransition('scale-up', 'enter', 0).scaleX).toBe(0.5);
    expect(evaluateTransition('slide-up', 'enter', 0).translateY).toBe(20);
    expect(evaluateTransition('scale-down', 'exit', 1).scaleX).toBe(0.5);
    expect(evaluateTransition('slide-down', 'exit', 1).translateY).toBe(20);
    expect(evaluateTransition('fade', 'visible', 1).opacity).toBe(1);
  });
});
