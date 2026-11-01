import { useState } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoundaryAddDropdown } from '@/components/Toolbar/BoundaryAddDropdown';
import { MapStylePicker } from '@/components/Toolbar/MapStylePicker';
import { ToolbarButton, ToolbarToggle } from '@/components/Toolbar/ToolbarPrimitives';
import { openProjectSettings } from '@/components/Toolbar/openProjectSettings';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { pickProject } from '@/store/projectDocument';
import { clearHistory, getHistoryEntries, installGestureTracking } from '@/store/history';
import type { BoundaryItem, TimelineItem } from '@/store/types';
import { clearMocks, installFetchMocks } from './mocks';
import { planDemo, type DemoStep } from './plan';
import { runStep } from './runners';
import { startingProject } from './startState';
import { testContext } from './testContext';
import { demoFixture } from './testFixture';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));
vi.mock('@/components/MapViewport/runtime/flagImages', async (importActual) => ({
  ...(await importActual<typeof import('@/components/MapViewport/runtime/flagImages')>()),
  loadFlagSvg: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"/>'),
}));

/** The parts of the editor the runners drive: the toolbar's style, settings, terrain and boundary controls, and the inspector. */
function Editor() {
  const [open, setOpen] = useState(false);
  const terrain = useProjectStore((s) => s.terrainEnabled);
  return (
    <div>
      <MapStylePicker />
      <ToolbarButton label="Map Settings" icon={null} hideLabel onClick={() => openProjectSettings()} walkthroughTarget="map-settings" />
      <ToolbarToggle label="Terrain" icon={null} hideLabel active={terrain} onClick={() => useProjectStore.getState().setTerrainEnabled(!terrain)} />
      <BoundaryAddDropdown isOpen={open} onOpenChange={setOpen} />
      <InspectorPanel />
    </div>
  );
}

const file = demoFixture();
const steps = planDemo(file);
const stepFor = (id: string) => steps.find((s): s is Extract<DemoStep, { kind: 'item' }> => s.kind === 'item' && s.itemId === id)!;

let stopGestures: () => void;
let uninstallMocks: () => void;
let warn: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  uninstallMocks = installFetchMocks();
  stopGestures = installGestureTracking();
  useUiPreferencesStore.setState({ inspectorSections: {} });
  useProjectStore.setState({ ...startingProject(file), ...createTransientState(), isInspectorOpen: true });
  useProjectStore.getState().setBoundaryDetail('standard');
  clearHistory();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  stopGestures();
  uninstallMocks();
  clearMocks();
  warn.mockRestore();
  vi.unstubAllGlobals();
});

// Runs are not wrapped in act(): act holds React's renders until it exits, and a run needs
// each click's render before the next control can be found.
describe('boundary runner', () => {
  it('adds the boundary through the Add panel, edits it in the inspector, then swaps in the file’s item', async () => {
    render(<Editor />);
    const target = file.items['b-france'] as BoundaryItem;
    // Every version of the boundary the UI made, to see what was shown on screen.
    const seen: TimelineItem[] = [];
    const unsubscribe = useProjectStore.subscribe((s) => {
      for (const item of Object.values(s.items)) if (item.kind === 'boundary' && item.id !== target.id) seen.push(item);
    });

    await (runStep(testContext(), stepFor('b-france'), file));
    unsubscribe();

    const shown = seen[seen.length - 1] as BoundaryItem;
    expect(shown.style).toMatchObject({
      strokeColor: '#3b82f6',
      strokeWidth: 8,
      glow: false,
      maskOutside: true,
      animateStroke: true,
      animationStyle: 'trace',
    });
    // Sliders glide to within a step; the final write makes them exact.
    expect(shown.style.fillOpacity).toBeCloseTo(0.35, 2);
    expect(shown.style.maskOpacity).toBeCloseTo(0.6, 2);
    expect(shown.style.traceLength).toBeCloseTo(0.25, 2);
    expect(shown).toMatchObject({ easing: 'linear' });
    // The timing is the timeline step's: the boundary keeps the span Add gave it.
    expect(shown).toMatchObject({ startTime: 0 });
    expect(warn).not.toHaveBeenCalled();

    const state = useProjectStore.getState();
    expect(Object.keys(state.items)).toEqual(['camera-track', 'b-france']);
    expect(state.items['b-france']).toEqual({ ...target, startTime: shown.startTime, endTime: shown.endTime });
    expect(state.itemOrder).toEqual(['camera-track', 'b-france']);
    expect(state.selectedItemId).toBe('b-france');
    // The add, each edit and the final swap are undo steps, as a user's would be.
    expect(getHistoryEntries().past.length).toBeGreaterThan(5);
    expect(getHistoryEntries().past.every((entry) => entry.source === 'user')).toBe(true);
  }, 15_000);

  it('still ends on the file’s boundary when the panel cannot be found', async () => {
    render(<InspectorPanel />);
    await (runStep(testContext(), stepFor('b-spain'), file));
    expect(useProjectStore.getState().items['b-spain']).toEqual({ ...file.items['b-spain'], ...stepFor('b-spain').timing });
    expect(warn).toHaveBeenCalled();
  }, 15_000);
});

describe('map style and settings runners', () => {
  it('picks the style in the real picker and edits the settings in the real panel', async () => {
    render(<Editor />);
    const ctx = testContext();
    const styleSteps: string[] = [];
    const unsubscribe = useProjectStore.subscribe((s, prev) => {
      if (s.mapStyle !== prev.mapStyle) styleSteps.push(s.mapStyle);
      if (s.projection !== prev.projection) styleSteps.push(s.projection);
    });
    await (runStep(ctx, steps[0], file));
    await (runStep(ctx, steps[1], file));
    unsubscribe();

    expect(styleSteps).toEqual(['dark', 'mercator']);
    const state = useProjectStore.getState();
    expect(state).toMatchObject({
      mapStyle: 'dark',
      terrainEnabled: true,
      name: 'Tour de France',
      duration: 45,
      projection: 'mercator',
      labelVisibility: { poi: false },
      show3dTrees: false,
    });
    // Typed one character at a time: a step per keystroke, like a user's typing.
    expect(getHistoryEntries().past.length).toBeGreaterThan(10);
  }, 15_000);
});

describe('a whole run', () => {
  it('ends with the store holding exactly the file’s project', async () => {
    render(<Editor />);
    const ctx = testContext();
    for (const step of steps) await runStep(ctx, step, file);
    expect(pickProject(useProjectStore.getState())).toEqual(pickProject(file));
  }, 20_000);
});
