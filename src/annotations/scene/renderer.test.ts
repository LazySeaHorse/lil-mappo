import { describe, it, expect, vi } from 'vitest';
import { renderScene } from './renderer';
import { circle, group, line, polyline, rect, text } from './primitives';

/** A context that records the calls and state changes the renderer makes. */
function recordingContext() {
  const calls: Array<[string, ...unknown[]]> = [];
  const state: Record<string, unknown> = { globalAlpha: 1 };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_, prop: string) {
      if (prop in state) return state[prop];
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
      };
    },
    set(_, prop: string, value) {
      state[prop] = value;
      calls.push([`set ${prop}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, state };
}

const names = (calls: Array<[string, ...unknown[]]>) => calls.map((c) => c[0]);

describe('renderScene', () => {
  it('clips group children to the clip rectangle before drawing them', () => {
    const { ctx, calls } = recordingContext();
    renderScene(ctx, group({
      clip: { x: -5, y: -10, width: 40, height: 12 },
      children: [rect({ x: 0, y: 0, width: 10, height: 10, fill: '#fff' })],
    }));

    expect(calls).toContainEqual(['rect', -5, -10, 40, 12]);
    expect(names(calls).indexOf('clip')).toBeGreaterThan(-1);
    expect(names(calls).indexOf('clip')).toBeLessThan(names(calls).indexOf('fillRect'));
  });

  it('paints a text halo behind the fill with round joins', () => {
    const { ctx, calls, state } = recordingContext();
    renderScene(ctx, text({
      x: 1, y: 2, text: 'Harbour', fontSize: 20, fontFamily: 'Outfit',
      fill: '#fff', stroke: '#000', strokeWidth: 4,
    }));

    const stroke = names(calls).indexOf('strokeText');
    const fill = names(calls).indexOf('fillText');
    expect(stroke).toBeGreaterThan(-1);
    expect(stroke).toBeLessThan(fill);
    expect(calls).toContainEqual(['set lineJoin', 'round']);
    expect(calls).toContainEqual(['set lineWidth', 4]);
    expect(state.strokeStyle).toBe('#000');
  });

  it('casts a soft shadow from text and polylines', () => {
    const shadow = { color: 'rgba(0,0,0,0.5)', blur: 6, offsetX: 0, offsetY: 0 };
    const t = recordingContext();
    renderScene(t.ctx, text({ x: 0, y: 0, text: 'Shade', fontSize: 12, fontFamily: 'Outfit', fill: '#fff', shadow }));
    expect(t.calls).toContainEqual(['set shadowBlur', 6]);
    expect(names(t.calls).indexOf('set shadowBlur')).toBeLessThan(names(t.calls).indexOf('fillText'));

    const p = recordingContext();
    renderScene(p.ctx, polyline({ points: [[0, 0], [5, 5]], stroke: '#fff', shadow }));
    expect(p.calls).toContainEqual(['set shadowColor', 'rgba(0,0,0,0.5)']);
  });

  it('draws no halo when the text has no stroke', () => {
    const { ctx, calls } = recordingContext();
    renderScene(ctx, text({ x: 0, y: 0, text: 'Plain', fontSize: 12, fontFamily: 'Outfit', fill: '#fff' }));
    expect(names(calls)).not.toContain('strokeText');
    expect(names(calls)).toContain('fillText');
  });

  it('applies cap, join and dash options to strokes', () => {
    const { ctx, calls } = recordingContext();
    renderScene(ctx, line({
      x1: 0, y1: 0, x2: 10, y2: 0, stroke: '#fff', strokeWidth: 2,
      lineCap: 'round', lineJoin: 'bevel', dashPattern: [4, 2],
    }));
    expect(calls).toContainEqual(['set lineCap', 'round']);
    expect(calls).toContainEqual(['set lineJoin', 'bevel']);
    expect(calls).toContainEqual(['setLineDash', [4, 2]]);
  });

  it('draws only the requested fraction of a polyline', () => {
    const { ctx, calls } = recordingContext();
    renderScene(ctx, polyline({ points: [[0, 0], [10, 0], [10, 10]], stroke: '#fff', progress: 0.75 }));
    expect(calls.filter((c) => c[0] === 'moveTo')).toEqual([['moveTo', 0, 0]]);
    expect(calls.filter((c) => c[0] === 'lineTo')).toEqual([['lineTo', 10, 0], ['lineTo', 10, 5]]);
    expect(names(calls)).toContain('stroke');
  });

  it('draws nothing for a polyline at zero progress', () => {
    const { ctx, calls } = recordingContext();
    renderScene(ctx, polyline({ points: [[0, 0], [10, 0]], stroke: '#fff', progress: 0 }));
    expect(names(calls)).not.toContain('stroke');
  });

  it('closes a closed polyline only once it is fully drawn', () => {
    const points: Array<[number, number]> = [[0, 0], [10, 0], [10, 10]];
    const partial = recordingContext();
    renderScene(partial.ctx, polyline({ points, closed: true, stroke: '#fff', progress: 0.5 }));
    expect(names(partial.calls)).not.toContain('closePath');

    const full = recordingContext();
    renderScene(full.ctx, polyline({ points, closed: true, stroke: '#fff' }));
    expect(names(full.calls)).toContain('closePath');
  });

  it('strokes a partial circle arc but fills the whole disc', () => {
    const { ctx, calls } = recordingContext();
    renderScene(ctx, circle({
      cx: 1, cy: 2, r: 5, fill: '#f00', stroke: '#fff',
      startAngle: -Math.PI / 2, endAngle: 0,
    }));
    const arcs = calls.filter((c) => c[0] === 'arc');
    expect(arcs).toEqual([
      ['arc', 1, 2, 5, 0, Math.PI * 2],
      ['arc', 1, 2, 5, -Math.PI / 2, 0],
    ]);
    expect(names(calls).indexOf('fill')).toBeLessThan(names(calls).indexOf('stroke'));
  });

  it('strokes a whole circle without rebuilding the path', () => {
    const { ctx, calls } = recordingContext();
    renderScene(ctx, circle({ cx: 0, cy: 0, r: 5, stroke: '#fff' }));
    expect(calls.filter((c) => c[0] === 'arc')).toHaveLength(1);
  });

  it('keeps the shared context balanced', () => {
    const { ctx, calls } = recordingContext();
    renderScene(ctx, group({ children: [group({ clip: { x: 0, y: 0, width: 1, height: 1 }, children: [] })] }));
    expect(names(calls).filter((n) => n === 'save')).toHaveLength(names(calls).filter((n) => n === 'restore').length);
    vi.restoreAllMocks();
  });
});
