import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { undo } from '@/store/history';
import { SAVED_MAP_STYLES_STORAGE_KEY, useSavedMapStyles } from '@/customMapStyles/savedStyles';
import { MAP_COLOR_ROLE_IDS } from '@/customMapStyles/model';
import { useAgentStore } from '../store';
import { runAgentTool } from '../runner';
import { historyPast, resetAgentTestState, resultJson } from '../testHelpers';

const state = () => useProjectStore.getState();
const steps = () => useProjectStore.temporal.getState().pastStates.length;

describe('custom map style tools', () => {
  beforeEach(() => {
    resetAgentTestState();
    useAgentStore.setState({ paidPlan: true });
    localStorage.removeItem(SAVED_MAP_STYLES_STORAGE_KEY);
    useSavedMapStyles.getState().reload();
  });

  it('need a paid plan', async () => {
    useAgentStore.setState({ paidPlan: false });
    for (const [name, input] of [
      ['set_custom_map_style', { colors: { land: '#000000' } }],
      ['save_map_style', {}],
      ['list_saved_map_styles', {}],
      ['apply_saved_map_style', { id: 'x' }],
    ] as const) {
      expect(resultJson(await runAgentTool(name, input)).error, name).toBe('plan_limit');
    }
    expect(state().customStyle).toBeNull();
  });

  it('makes a custom style over the current style in one undo step, and lists the roles Standard shows', async () => {
    const result = await runAgentTool('set_custom_map_style', {
      name: 'Risograph', colors: { land: '#F2E8D5', water: '#1d3557' }, theme: 'monochrome',
    });
    expect(result.isError).toBeUndefined();
    expect(state()).toMatchObject({
      mapStyle: 'standard',
      customStyle: { name: 'Risograph', colors: { land: '#f2e8d5', water: '#1d3557' }, theme: 'monochrome' },
    });
    expect(resultJson<{ colorRoles: string[] }>(result).colorRoles).toEqual(MAP_COLOR_ROLE_IDS);
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai', label: 'AI: set custom map style (Risograph)' });
    undo();
    expect(state().customStyle).toBeNull();
  });

  it('adds to the current custom style, removes colours with null, and starts again on reset or a new base', async () => {
    await runAgentTool('set_custom_map_style', { name: 'Ink', colors: { land: '#101820', water: '#2a4b5c' } });
    await runAgentTool('set_custom_map_style', { colors: { water: null, roads: '#ffcc00' } });
    expect(state().customStyle).toEqual({ name: 'Ink', colors: { land: '#101820', roads: '#ffcc00' }, theme: 'default' });

    await runAgentTool('set_custom_map_style', { reset: true, colors: { buildings: '#333333' } });
    expect(state().customStyle).toEqual({ name: 'Ink', colors: { buildings: '#333333' }, theme: 'default' });

    await runAgentTool('set_custom_map_style', { baseStyle: 'light', colors: { land: '#000000' } });
    expect(state()).toMatchObject({ mapStyle: 'light', customStyle: { name: 'Custom style', colors: { land: '#000000' } } });
  });

  it('warns about a theme or colours the base style cannot show', async () => {
    state().setMapStyle('satellite');
    state().setDetectedCapabilities({ ...state().detectedCapabilities!, labelGroups: [], colorRoles: ['land', 'roads', 'placeLabels'] });
    const body = resultJson<{ warnings: string[] }>(await runAgentTool('set_custom_map_style', { theme: 'faded', colors: { roads: '#ffffff', water: '#000000' } }));
    expect(body.warnings).toEqual([
      'theme only changes the Standard style; satellite ignores it.',
      'satellite has nothing to paint for: water.',
    ]);
  });

  it('refuses bad colours, unknown roles and empty calls', async () => {
    for (const input of [{ colors: { land: 'red' } }, { colors: { land: '#fff' } }, { colors: { sky: '#ffffff' } }, { baseStyle: 'nope' }]) {
      expect(resultJson(await runAgentTool('set_custom_map_style', input)).error).toBe('invalid_input');
    }
    expect(resultJson(await runAgentTool('set_custom_map_style', {})).error).toBe('empty_patch');
    expect(steps()).toBe(0);
  });

  it('saves, lists and applies saved styles', async () => {
    expect(resultJson(await runAgentTool('save_map_style', {})).error).toBe('no_custom_style');

    await runAgentTool('set_custom_map_style', { baseStyle: 'light', name: 'Ink', colors: { land: '#101820' } });
    const saved = resultJson<{ saved: { id: string; name: string; baseStyle: string }; replaced: boolean }>(await runAgentTool('save_map_style', {}));
    expect(saved).toMatchObject({ saved: { name: 'Ink', baseStyle: 'light' }, replaced: false });
    await runAgentTool('set_custom_map_style', { colors: { land: '#000000' } });
    expect(resultJson(await runAgentTool('save_map_style', {})).replaced).toBe(true);

    const list = resultJson<{ styles: Array<{ id: string; colors: object }> }>(await runAgentTool('list_saved_map_styles', {}));
    expect(list.styles).toEqual([expect.objectContaining({ id: saved.saved.id, colors: { land: '#000000' } })]);

    await runAgentTool('update_project_settings', { mapStyle: 'standard' });
    expect(state().customStyle).toBeNull();
    const before = steps();
    await runAgentTool('apply_saved_map_style', { id: saved.saved.id });
    expect(state()).toMatchObject({ mapStyle: 'light', customStyle: { name: 'Ink', colors: { land: '#000000' } } });
    expect(steps()).toBe(before + 1);
    expect(resultJson(await runAgentTool('apply_saved_map_style', { id: 'missing' })).error).toBe('saved_style_not_found');
  });

  it('drops the custom style when update_project_settings picks the same built-in style', async () => {
    await runAgentTool('set_custom_map_style', { colors: { land: '#101820' } });
    const body = resultJson<{ changed: Record<string, unknown> }>(await runAgentTool('update_project_settings', { mapStyle: 'standard' }));
    expect(state().customStyle).toBeNull();
    expect(Object.keys(body.changed)).toEqual(['customStyle']);
  });

  it('shows the custom style in get_project', async () => {
    await runAgentTool('set_custom_map_style', { colors: { land: '#101820' } });
    expect(resultJson(await runAgentTool('get_project', {}))).toMatchObject({
      mapStyle: 'standard',
      customStyle: { colors: { land: '#101820' } },
      colorRoles: MAP_COLOR_ROLE_IDS,
    });
  });
});
