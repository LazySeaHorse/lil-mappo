import { describe, it, expect } from 'vitest';
import { measureScene } from './measure';
import { circle, group, line, path, polyline, rect, text } from './primitives';
import { measureTextWidth } from './textMetrics';

describe('measureScene', () => {
  it('measures an empty scene as a point at the origin', () => {
    expect(measureScene(group({}))).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 });
  });

  it('includes stroke width on rects and circles', () => {
    expect(measureScene(rect({ x: 0, y: 0, width: 10, height: 6, stroke: '#fff', strokeWidth: 2 }))).toMatchObject({
      minX: -1, minY: -1, maxX: 11, maxY: 7,
    });
    expect(measureScene(circle({ cx: 5, cy: 5, r: 4, stroke: '#fff', strokeWidth: 2 }))).toMatchObject({
      minX: 0, maxX: 10,
    });
  });

  it('measures a polyline by its full length regardless of progress', () => {
    const box = measureScene(polyline({
      points: [[0, 0], [30, 40], [80, 40]], stroke: '#fff', strokeWidth: 2, progress: 0.1,
    }));
    expect(box).toMatchObject({ minX: -1, minY: -1, maxX: 81, maxY: 41 });
  });

  it('measures lines with their stroke', () => {
    expect(measureScene(line({ x1: 0, y1: 0, x2: 10, y2: 0, stroke: '#fff', strokeWidth: 4 }))).toMatchObject({
      minX: -2, maxX: 12, minY: -2, maxY: 2,
    });
  });

  it('uses real text metrics, honouring alignment, transform and halo', () => {
    const width = measureTextWidth('HARBOUR', 20, 'Outfit', 600, '0.1em');
    const box = measureScene(text({
      x: 100, y: 0, text: 'Harbour', fontSize: 20, fontFamily: 'Outfit', fontWeight: 600,
      letterSpacing: '0.1em', textTransform: 'uppercase', align: 'right', baseline: 'bottom',
      stroke: '#000', strokeWidth: 6,
    }));
    expect(box.maxX).toBeCloseTo(100 + 3);
    expect(box.minX).toBeCloseTo(100 - width - 3);
    expect(box.maxY).toBeCloseTo(3);
    expect(box.minY).toBeCloseTo(-20 * 1.3 - 3);
  });

  it('grows boxes by their shadow blur and offset', () => {
    const shadow = { color: '#000', blur: 6, offsetX: 2, offsetY: -1 };
    expect(measureScene(polyline({ points: [[0, 0], [10, 0]], stroke: '#fff', strokeWidth: 2, shadow }))).toMatchObject({
      minX: -1 - 6, maxX: 11 + 6 + 2, minY: -1 - 6 - 1, maxY: 1 + 6,
    });
    expect(measureScene(rect({ x: 0, y: 0, width: 4, height: 4, shadow })).width).toBe(4 + 12 + 2);
  });

  it('places alphabetic text on its baseline', () => {
    const box = measureScene(text({ x: 0, y: 50, text: 'Base', fontSize: 20, fontFamily: 'Outfit', baseline: 'alphabetic' }));
    expect(box.minY).toBeCloseTo(30);
    expect(box.maxY).toBeCloseTo(50 + 20 * 0.3);
  });

  it('applies group translation, scale and rotation', () => {
    const child = rect({ x: 0, y: 0, width: 10, height: 10 });
    expect(measureScene(group({ x: 5, y: 7, children: [child] }))).toMatchObject({ minX: 5, minY: 7, maxX: 15, maxY: 17 });
    expect(measureScene(group({ scale: 2, anchorX: 5, anchorY: 5, children: [child] }))).toMatchObject({
      minX: -5, minY: -5, maxX: 15, maxY: 15,
    });
    const turned = measureScene(group({ rotation: Math.PI / 2, children: [child] }));
    expect(turned.minX).toBeCloseTo(-10);
    expect(turned.maxX).toBeCloseTo(0);
    expect(turned.maxY).toBeCloseTo(10);
  });

  it('applies per-axis scaleX and scaleY about the anchor', () => {
    const child = rect({ x: -10, y: -20, width: 20, height: 20 });
    expect(measureScene(group({ scaleY: 0.5, children: [child] }))).toMatchObject({ minX: -10, minY: -10, maxX: 10, maxY: 0 });
    expect(measureScene(group({ scale: 2, scaleX: 0.5, children: [child] }))).toMatchObject({ minX: -10, minY: -40, maxX: 10, maxY: 0 });
  });

  it('crops group content to its clip', () => {
    const box = measureScene(group({
      clip: { x: 0, y: -4, width: 20, height: 4 },
      children: [rect({ x: -10, y: -30, width: 100, height: 40 })],
    }));
    expect(box).toMatchObject({ minX: 0, minY: -4, maxX: 20, maxY: 0 });
  });

  it('ignores content that is entirely clipped away', () => {
    const box = measureScene(group({
      children: [
        group({ clip: { x: 0, y: 0, width: 5, height: 5 }, children: [rect({ x: 50, y: 50, width: 5, height: 5 })] }),
        rect({ x: 0, y: 0, width: 2, height: 2 }),
      ],
    }));
    expect(box).toMatchObject({ maxX: 2, maxY: 2 });
  });

  it('skips unmeasurable paths', () => {
    expect(measureScene(group({ children: [path({ d: 'M0 0L9 9', stroke: '#fff' }), rect({ x: 0, y: 0, width: 3, height: 3 })] })).width).toBe(3);
  });
});
