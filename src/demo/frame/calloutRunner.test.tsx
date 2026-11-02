import { useState } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationAddDropdown } from '@/annotations/toolbar/AnnotationAddDropdown';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import { setAgentMapRef } from '@/agent/mapRef';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { pickProject } from '@/store/projectDocument';
import { clearHistory, getHistoryEntries, installGestureTracking } from '@/store/history';
import { createCalloutItem, switchCalloutStyle } from '@/store/itemFactories';
import type { CalloutItem, Project, TimelineItem } from '@/store/types';
import { clearMocks, installFetchMocks } from './mocks';
import { planDemo, type DemoStep } from './plan';
import { runStep } from './runners';
import { startingProject } from './startState';
import { testContext } from './testContext';
import { demoFixture } from './testFixture';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));
vi.mock('@/annotations/inspector/stylePreview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/annotations/inspector/stylePreview')>()),
  getStylePreview: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/components/MapViewport/runtime/flagImages', async (importActual) => ({
  ...(await importActual<typeof import('@/components/MapViewport/runtime/flagImages')>()),
  loadFlagSvg: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"/>'),
}));

/** The Add Callout panel and the inspector, the parts of the editor the runner drives. */
function Editor() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <AnnotationAddDropdown isOpen={open} onOpenChange={setOpen} />
      <InspectorPanel />
    </div>
  );
}

/** A callout as a user leaves it after styling it: another style, text, colors, size, timing. */
function styledCallout(locationName: string): CalloutItem {
  const base = createCalloutItem({
    id: 'c-eiffel',
    styleId: 'leader-line',
    content: { title: 'Eiffel Tower' },
    lngLat: [2.2945, 48.8584],
    startTime: 2,
    endTime: 6.5,
    linkTitleToLocation: false,
    locationName,
  })!;
  const patch = switchCalloutStyle(base, 'big-number')!;
  return {
    ...base,
    ...patch,
    content: { title: 'Eiffel Tower', subtitle: 'Paris', metric: { value: 330, unit: 'm', label: 'tall' } },
    settings: { ...patch.settings, accentColor: '#ef4444', textColor: '#112233', prefix: '~' },
    scale: 1.5,
    sizeMode: 'map',
    transition: { ...base.transition, enter: 'scale-up', enterDuration: 0.8 },
  };
}

function fileWith(target: CalloutItem): Project {
  const file = demoFixture();
  return { ...file, items: { ...file.items, [target.id]: target }, itemOrder: [...file.itemOrder, target.id] };
}

const stepFor = (steps: DemoStep[], id: string) => steps.find((s): s is Extract<DemoStep, { kind: 'item' }> => s.kind === 'item' && s.itemId === id)!;

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
  useProjectStore.setState({ ...startingProject(demoFixture()), ...createTransientState(), isInspectorOpen: true });
  clearHistory();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  setAgentMapRef(null);
  stopGestures();
  uninstallMocks();
  clearMocks();
  warn.mockRestore();
  vi.unstubAllGlobals();
});

/** Every version of a callout the UI made (not the file's), to see what was shown on screen. */
function watchShown(targetId: string): { seen: TimelineItem[]; stop: () => void } {
  const seen: TimelineItem[] = [];
  const stop = useProjectStore.subscribe((s) => {
    for (const item of Object.values(s.items)) if (item.kind === 'callout' && item.id !== targetId) seen.push(item);
  });
  return { seen, stop };
}

describe('callout runner', () => {
  it('searches the place, adds the callout, picks the style card and edits each field in the inspector', async () => {
    const target = styledCallout('Eiffel Tower');
    const file = fileWith(target);
    const step = stepFor(planDemo(file), target.id);
    render(<Editor />);
    const { seen, stop } = watchShown(target.id);

    await runStep(testContext(), step, file);
    stop();

    const shown = seen[seen.length - 1] as CalloutItem;
    expect(shown).toMatchObject({
      styleId: 'big-number',
      content: { title: 'Eiffel Tower', subtitle: 'Paris', metric: { value: 330, unit: 'm', label: 'tall' } },
      sizeMode: 'map',
      ...step.timing,
      transition: { enter: 'scale-up' },
    });
    expect(shown.settings).toMatchObject({ accentColor: '#ef4444', textColor: '#112233', prefix: '~' });
    expect(shown.scale).toBeCloseTo(1.5, 1);
    expect(shown.transition.enterDuration).toBeCloseTo(0.8, 1);
    expect(warn).not.toHaveBeenCalled();

    const state = useProjectStore.getState();
    // The clip keeps the timing Add gave it; the timeline step drags it to the file's.
    expect(state.items['c-eiffel']).toEqual({ ...target, ...step.timing });
    expect(state.itemOrder).toContain('c-eiffel');
    expect(state.selectedItemId).toBe('c-eiffel');
    expect(Object.values(state.items).filter((i) => i.kind === 'callout')).toHaveLength(1);
    expect(getHistoryEntries().past.length).toBeGreaterThan(8);
    expect(getHistoryEntries().past.every((entry) => entry.source === 'user')).toBe(true);
  }, 30_000);

  it('picks a callout with no place name on the map', async () => {
    const target = styledCallout('');
    const file = fileWith(target);
    const step = stepFor(planDemo(file), target.id);

    // A map that projects everything to the same spot and reports a click there to the picker, as MapViewport does.
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    document.body.appendChild(canvas);
    canvas.addEventListener('click', () => {
      const { activePicker, stopPicking } = useProjectStore.getState();
      activePicker?.onPick({ lngLat: target.binding.kind === 'geographic' ? target.binding.lngLat : [0, 0], name: '2.29450, 48.85840' });
      stopPicking();
    });
    const map = {
      getCanvas: () => canvas,
      getContainer: () => ({ clientWidth: 1200, clientHeight: 800 }),
      project: () => ({ x: 600, y: 400 }),
      getZoom: () => 12,
      getCenter: () => ({ lng: 2, lat: 48 }),
      getBounds: () => null,
      easeTo: vi.fn(),
      fitBounds: vi.fn(),
      once: vi.fn(),
    };
    setAgentMapRef({ current: { getMap: () => map } } as never);
    render(<Editor />);

    await runStep(testContext(), step, file);
    canvas.remove();

    expect(map.easeTo).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(useProjectStore.getState().items['c-eiffel']).toEqual({ ...target, ...step.timing });
    expect(pickProject(useProjectStore.getState()).items['c-eiffel']).toEqual({ ...target, ...step.timing });
  }, 30_000);

  it('still ends on the file’s callout when the panel cannot be found', async () => {
    const target = styledCallout('Eiffel Tower');
    const file = fileWith(target);
    render(<InspectorPanel />);
    const step = stepFor(planDemo(file), target.id);
    await runStep(testContext(), step, file);
    expect(useProjectStore.getState().items['c-eiffel']).toEqual({ ...target, ...step.timing });
    expect(warn).toHaveBeenCalled();
  }, 15_000);
});
