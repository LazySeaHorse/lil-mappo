import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { undo } from '@/store/history';
import { useAgentStore } from '../store';
import { runAgentTool } from '../runner';
import { historyPast, resetAgentTestState, resultJson } from '../testHelpers';

const state = () => useProjectStore.getState();
const steps = () => useProjectStore.temporal.getState().pastStates.length;

describe('update_project_settings', () => {
  beforeEach(() => {
    resetAgentTestState();
    useAgentStore.getState().setExportLimits({ maxDuration: 120, maxResolution: '1080p', maxFps: 60, limited: false });
  });

  it('applies several fields as one ai step and keeps derived resolution correct', async () => {
    const result = await runAgentTool('update_project_settings', {
      name: 'Trip', duration: 45, aspectRatio: '1:1', exportResolution: '1080p', isVertical: false,
      mapStyle: 'dark', terrainEnabled: true, starIntensity: 0.2, fogColor: '#112233',
      labelVisibility: { road: false, poi: false }, show3dTrees: false, lightPreset: 'dusk', projection: 'mercator',
    });
    expect(result.isError).toBeUndefined();
    expect(state()).toMatchObject({
      name: 'Trip', duration: 45, aspectRatio: '1:1', exportResolution: '1080p', resolution: [1080, 1080],
      mapStyle: 'dark', terrainEnabled: true, starIntensity: 0.2, fogColor: '#112233',
      show3dTrees: false, lightPreset: 'dusk', projection: 'mercator',
    });
    expect(state().labelVisibility).toMatchObject({ road: false, poi: false });
    const body = resultJson<{ changed: Record<string, { from: unknown; to: unknown }> }>(result);
    expect(body.changed.duration).toEqual({ from: 30, to: 45 });
    expect(body.changed.resolution).toEqual({ from: [1280, 720], to: [1080, 1080] });
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai' });
    expect(historyPast()[0].label).toContain('AI: update project settings');
    undo();
    expect(state()).toMatchObject({ duration: 30, mapStyle: 'standard', resolution: [1280, 720] });
  });

  it('validates enums against the real config', async () => {
    for (const patch of [{ mapStyle: 'nope' }, { lightPreset: 'noon' }, { aspectRatio: '3:2' }, { labelVisibility: { bogus: true } }, { fps: 24 }, { starIntensity: 2 }, { unknownField: 1 }]) {
      expect(resultJson(await runAgentTool('update_project_settings', patch)).error).toBe('invalid_input');
    }
    expect(resultJson(await runAgentTool('update_project_settings', {})).error).toBe('empty_patch');
    expect(steps()).toBe(0);
  });

  it('enforces plan limits', async () => {
    useAgentStore.getState().setExportLimits({ maxDuration: 30, maxResolution: '720p', maxFps: 30, limited: true });
    expect(resultJson(await runAgentTool('update_project_settings', { duration: 60 })).error).toBe('plan_limit');
    expect(resultJson(await runAgentTool('update_project_settings', { exportResolution: '1080p' })).error).toBe('plan_limit');
    expect(resultJson(await runAgentTool('update_project_settings', { fps: 60 })).error).toBe('plan_limit');
    expect((await runAgentTool('update_project_settings', { exportResolution: '480p' })).isError).toBeUndefined();
    expect(steps()).toBe(1);
  });

  it('warns about items that outlast a shorter duration', async () => {
    await runAgentTool('add_camera_keyframe', { time: 1, center: [0, 0], zoom: 3 });
    const { addItem } = state();
    addItem({ kind: 'boundary', id: 'b1', placeName: 'x', geojson: null, resolveStatus: 'resolved', startTime: 10, endTime: 25, easing: 'linear',
      style: { strokeColor: '#fff', fillColor: '#fff', strokeWidth: 1, glow: false, fillOpacity: 0, animateStroke: false, animationStyle: 'fade', traceLength: 0.1 } });
    const body = resultJson<{ warnings: string[] }>(await runAgentTool('update_project_settings', { duration: 20 }));
    expect(body.warnings[0]).toContain('b1');
  });
});
