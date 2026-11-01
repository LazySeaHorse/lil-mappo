import { describe, expect, it } from 'vitest';
import { pickProject } from '@/store/projectDocument';
import { applyStep, boundaryBaseline, boundaryEdits, deepEqual, diffLeaves, orderLikeFile, planDemo, setPath } from './plan';
import { startingProject } from './startState';
import { demoFixture, editedBoundary } from './testFixture';

describe('planDemo', () => {
  const file = demoFixture();
  const steps = planDemo(file);

  it('builds in a person’s order: style, settings, boundaries, routes, callouts, models, timeline, camera, play, export', () => {
    expect(steps.map((s) => (s.kind === 'item' ? `${s.itemKind}:${s.itemId}` : s.kind))).toEqual([
      'map-style',
      'settings',
      // Within a kind, the file's timeline order.
      'boundary:b-spain',
      'boundary:b-france',
      'route:r-paris-lyon',
      'callout:c-paris',
      'model:mi-tower',
      'timeline',
      'camera',
      'play',
      'export',
    ]);
    expect(steps[0]).toMatchObject({ kind: 'map-style', mapStyle: 'dark', customStyle: null });
  });

  it('edits only the settings that differ from a new project, toolbar toggles first', () => {
    const settings = steps.find((s) => s.kind === 'settings');
    expect(settings && 'edits' in settings ? settings.edits : null).toEqual([
      { path: 'terrainEnabled', value: true },
      { path: 'name', value: 'Tour de France' },
      { path: 'duration', value: 45 },
      { path: 'projection', value: 'mercator' },
      { path: 'labelVisibility.poi', value: false },
      { path: 'show3dTrees', value: false },
    ]);
  });

  it('has no settings or style step for a file that keeps the defaults', () => {
    const plain = { ...startingProject(file), items: {}, itemOrder: [] };
    expect(planDemo(plain).map((s) => s.kind)).toEqual(['timeline', 'play', 'export']);
  });

  it('gives a boundary the inspector edits that differ from what Add makes, in screen order', () => {
    const step = steps.find((s) => s.kind === 'item' && s.itemId === 'b-france');
    expect(step && 'edits' in step ? step.edits : null).toEqual([
      { path: 'style.strokeColor', value: '#3b82f6' },
      { path: 'style.strokeWidth', value: 8 },
      { path: 'style.glow', value: false },
      { path: 'style.fillOpacity', value: 0.35 },
      { path: 'style.maskOutside', value: true },
      { path: 'style.maskOpacity', value: 0.6 },
      { path: 'style.animationStyle', value: 'trace' },
      { path: 'style.traceLength', value: 0.25 },
      { path: 'startTime', value: 1.5 },
      { path: 'endTime', value: 9 },
      { path: 'easing', value: 'linear' },
      { path: 'exitAnimation', value: 'fade' },
    ]);
    // A boundary left as Add made it (at its start time) has only its timing to change.
    const spain = steps.find((s) => s.kind === 'item' && s.itemId === 'b-spain');
    expect(spain && 'edits' in spain ? spain.edits : null).toEqual([
      { path: 'endTime', value: 15 },
      { path: 'startTime', value: 10 },
    ]);
  });

  it('moves the end first when the new start is past the current end', () => {
    const item = { ...editedBoundary(), startTime: 6, endTime: 12 };
    const paths = boundaryEdits(boundaryBaseline(item), item).map((e) => e.path).filter((p) => p.endsWith('Time'));
    expect(paths).toEqual(['endTime', 'startTime']);
  });

  it('labels each step for the progress line', () => {
    expect(steps.map((s) => s.label)).toEqual([
      'Map style: dark', 'Project settings', 'Boundary: Spain', 'Boundary: France', 'Route: Paris to Lyon',
      'Callout: Paris', '3D model: Tower', 'Timeline', 'Camera views', 'Play', 'Export',
    ]);
  });

  it('ends exactly on the file: every step’s final write, from the starting project', () => {
    const end = steps.reduce((project, step) => applyStep(project, step, file), startingProject(file));
    expect(deepEqual(pickProject(end), pickProject(file))).toBe(true);
    expect(pickProject(end)).toEqual(pickProject(file));
  });

  it('keeps the file’s timeline order as items arrive kind by kind', () => {
    const afterBoundaries = steps.slice(0, 4).reduce((p, s) => applyStep(p, s, file), startingProject(file));
    expect(afterBoundaries.itemOrder).toEqual(['camera-track', 'b-spain', 'b-france']);
  });
});

describe('plan helpers', () => {
  it('diffLeaves walks objects, treats arrays as values and skips paths', () => {
    expect(diffLeaves({ a: 1, b: { c: [1, 2], d: 'x' }, id: 1 }, { a: 1, b: { c: [1, 3], d: 'y' }, id: 2 }, ['id'])).toEqual([
      { path: 'b.c', value: [1, 3] },
      { path: 'b.d', value: 'y' },
    ]);
  });

  it('setPath copies on the way and drops undefined', () => {
    const obj = { a: { b: 1, c: 2 } };
    const next = setPath(obj, 'a.b', 5);
    expect(next).toEqual({ a: { b: 5, c: 2 } });
    expect(obj.a.b).toBe(1);
    expect(setPath(obj, 'a.c', undefined)).toEqual({ a: { b: 1 } });
    expect(setPath({}, 'x.y', true)).toEqual({ x: { y: true } });
  });

  it('orderLikeFile sorts by the file and keeps unknown ids last', () => {
    expect(orderLikeFile(['c', 'x', 'a', 'a'], ['a', 'b', 'c'])).toEqual(['a', 'c', 'x']);
  });
});
