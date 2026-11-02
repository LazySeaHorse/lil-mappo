import { describe, expect, it } from 'vitest';
import { boundaryStyleShape, routeStyleShape } from '@/agent/tools/schemas';
import { planDemo } from '../plan';
import { demoFixture } from '../testFixture';
import { BOUNDARY_STYLE_KEYS, CREATED, ROUTE_STYLE_KEYS, buildAiScript, type AiAction } from './script';

const file = demoFixture();
const steps = planDemo(file);
const script = buildAiScript(file, steps);

const tools = (actions: AiAction[] = script) =>
  actions.filter((a): a is Extract<AiAction, { kind: 'tool' }> => a.kind === 'tool');
const toolNames = (actions: AiAction[] = script) => tools(actions).map((t) => t.name);
const texts = () => script.filter((a): a is Extract<AiAction, { kind: 'text' }> => a.kind === 'text').map((a) => a.text);

describe('buildAiScript', () => {
  it('keeps the tool vocabulary in step with the tool schemas', () => {
    expect([...ROUTE_STYLE_KEYS].sort()).toEqual(Object.keys(routeStyleShape).sort());
    expect([...BOUNDARY_STYLE_KEYS].sort()).toEqual(Object.keys(boundaryStyleShape).sort());
  });

  it('reads first, builds in the plan’s order, then reads back, summarises and plays', () => {
    expect(toolNames()).toEqual([
      'get_guide',
      'get_project',
      'update_project_settings', // map style
      'update_project_settings', // settings
      'add_boundary', // Spain
      'add_boundary', // France
      'update_item', // France's easing and exit animation
      'add_route',
      'add_callout',
      'update_item', // the Tower's timing
      'add_camera_keyframe',
      'add_camera_keyframe',
      'get_project',
      'set_playhead',
    ]);
    const kinds = script.map((a) => a.kind);
    expect(kinds.at(-1)).toBe('finalize');
  });

  it('ends the turn on the closing message: the agent’s last calls and the playback start come before it', () => {
    const kinds = script.map((a) => a.kind);
    // set_playhead, playback starts, the closing summary, done; then the run waits out the playback, then finalises.
    expect(kinds.slice(-6)).toEqual(['tool', 'play', 'text', 'done', 'play-end', 'finalize']);
    expect(script.at(-6)).toMatchObject({ name: 'set_playhead', input: { time: 0 } });
    // Nothing the terminal would show as work follows done.
    const afterDone = script.slice(kinds.indexOf('done') + 1).map((a) => a.kind);
    expect(afterDone).toEqual(['play-end', 'finalize']);
    expect(texts().at(-1)).toBe(
      'Your map "Tour de France" is ready: 2 boundaries, 1 route, 1 callout, 1 3D model and 2 camera views. I\'ve set the playhead to the start and started playback.',
    );
  });

  it('never uses timeline drags or the export, and has no tool for the timeline step', () => {
    expect(toolNames().filter((n) => /export|drag|timeline/i.test(n))).toEqual([]);
    expect(script.some((a) => a.kind === 'commit' && (a.step.kind === 'timeline' || a.step.kind === 'export'))).toBe(false);
  });

  it('sends what an agent would: names and places, only the fields that differ from the defaults', () => {
    const [spain, france] = tools().filter((t) => t.name === 'add_boundary');
    expect(spain.input).toEqual({ query: 'Spain', detail: 'detailed', startTime: 10, endTime: 15 });
    expect(france.input).toMatchObject({
      query: 'France',
      startTime: 1.5,
      endTime: 9,
      style: { strokeColor: '#3b82f6', strokeWidth: 8, glow: false, maskOutside: true, animationStyle: 'trace' },
    });
    expect(tools().find((t) => t.name === 'update_item' && t.input.id === CREATED)?.input).toEqual({
      id: CREATED,
      patch: { easing: 'linear', exitAnimation: 'fade' },
    });

    const route = tools().find((t) => t.name === 'add_route')!;
    expect(route.input).toMatchObject({ mode: 'car', from: 'Paris', to: 'Lyon', startTime: 3, style: { color: '#ef4444', width: 6 } });
    expect(route.input).not.toHaveProperty('name');
    expect(route.mocks).toEqual([
      { kind: 'place', query: 'Paris', name: 'Paris', coordinates: [2.35, 48.85] },
      { kind: 'place', query: 'Lyon', name: 'Lyon', coordinates: [4.83, 45.76] },
      expect.objectContaining({ kind: 'route', start: [2.35, 48.85], end: [4.83, 45.76] }),
    ]);

    expect(tools().find((t) => t.name === 'add_callout')!.input).toMatchObject({ title: 'Paris', location: [2.35, 48.85], startTime: 2 });
    const camera = tools().filter((t) => t.name === 'add_camera_keyframe');
    expect(camera.map((t) => t.input)).toEqual([
      { time: 0, center: [2.35, 48.85], zoom: 5 },
      { time: 8, center: [-3, 40], zoom: 5, pitch: 40 },
    ]);
  });

  it('puts every settings change in one update_project_settings call', () => {
    const settings = tools().filter((t) => t.name === 'update_project_settings')[1];
    expect(settings.input).toEqual({
      terrainEnabled: true,
      name: 'Tour de France',
      duration: 45,
      projection: 'mercator',
      show3dTrees: false,
      labelVisibility: { poi: false },
    });
    expect(tools()[2].input).toEqual({ mapStyle: 'dark' });
  });

  it('narrates in item names, without emoji, and thinks 0.6 to 2 s between phases', () => {
    expect(texts()).toContain('Adding the Spain outline first.');
    expect(texts()).toContain('Now the France outline.');
    expect(texts().some((t) => t.includes('Paris') && t.includes('Lyon'))).toBe(true);
    expect(texts().at(-1)).toMatch(/^Your map "Tour de France" is ready: 2 boundaries, 1 route, 1 callout, 1 3D model and 2 camera views\./);
    expect(texts().join(' ')).not.toMatch(/\p{Extended_Pictographic}/u);
    const beats = script.filter((a): a is Extract<AiAction, { kind: 'think' }> => a.kind === 'think').map((a) => a.ms);
    expect(beats.length).toBeGreaterThan(5);
    for (const ms of beats) expect(ms).toBeGreaterThanOrEqual(600);
    for (const ms of beats) expect(ms).toBeLessThanOrEqual(2000);
  });

  it('commits each item after its calls, in the plan’s order', () => {
    const committed = script.filter((a) => a.kind === 'commit').map((a) => (a.kind === 'commit' ? a.step.label : ''));
    expect(committed).toEqual([
      'Map style: dark', 'Project settings', 'Boundary: Spain', 'Boundary: France', 'Route: Paris to Lyon',
      'Callout: Paris', '3D model: Tower', 'Camera views',
    ]);
    const finalize = script.at(-1);
    expect(finalize && finalize.kind === 'finalize' ? finalize.steps.map((s) => s.kind) : []).toContain('export');
  });

  it('swaps in the file’s exact items, timing included: the agent sets timing itself, nothing drags a clip', () => {
    expect(steps.some((s) => s.kind === 'item' && s.timing)).toBe(true);
    const itemSteps = script.flatMap((a) => (a.kind === 'commit' || a.kind === 'place') && a.step.kind === 'item' ? [a.step] : []);
    expect(itemSteps.length).toBeGreaterThan(0);
    expect(itemSteps.every((s) => s.kind === 'item' && !s.timing)).toBe(true);
  });

  it('places a model the user added, then only retimes it', () => {
    const at = script.findIndex((a) => a.kind === 'place');
    expect(script[at]).toMatchObject({ kind: 'place', file: { items: { 'mi-tower': { startTime: 0, endTime: 45 } } } });
    const retime = script.slice(at).find((a) => a.kind === 'tool');
    expect(retime).toMatchObject({ name: 'update_item', input: { id: 'mi-tower', patch: { startTime: 4 } } });
  });

  it('skips a model whose file is not loaded', () => {
    const skipped = buildAiScript(file, steps, { modelReady: () => false });
    expect(skipped.some((a) => a.kind === 'place')).toBe(false);
    expect(JSON.stringify(skipped)).not.toContain('Tower');
    expect(skipped.at(-1)).toMatchObject({ kind: 'finalize' });
    const last = skipped.at(-1);
    expect(last && last.kind === 'finalize' ? last.steps.map((s) => s.label) : []).not.toContain('3D model: Tower');
  });

  it('reports each step as it starts', () => {
    const progress = script.filter((a) => a.kind === 'progress').map((a) => (a.kind === 'progress' ? `${a.index + 1}/${steps.length}` : ''));
    expect(progress[0]).toBe('1/11');
    expect(progress.at(-1)).toBe('10/11');
  });
});
