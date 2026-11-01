import { useState } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteAddDropdown } from '@/components/Toolbar/RouteAddDropdown';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { pickProject } from '@/store/projectDocument';
import { clearHistory, getHistoryEntries, installGestureTracking } from '@/store/history';
import { createEndpointRouteItem, createImportedRouteItem, createWalkRouteItem, wrapGeometry } from '@/store/itemFactories';
import { loadAirports } from '@/services/airports/airportService';
import { createProject } from '@/store/projectDocument';
import type { Project, RouteItem, TimelineItem } from '@/store/types';
import { installPointerCapturePatch } from './actions';
import { clearMocks, installFetchMocks } from './mocks';
import { planDemo, type DemoStep } from './plan';
import { runStep } from './runners';
import { startingProject } from './startState';
import { testContext } from './testContext';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));

/** The Plan Route button and panel with the inspector, and a file input the import entry would open. */
function Editor({ onChooser }: { onChooser: (prevented: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <RouteAddDropdown
        isOpen={open}
        onOpenChange={setOpen}
        onImportClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
      />
      <input type="file" onClick={(e) => queueMicrotask(() => onChooser(e.defaultPrevented))} />
      <InspectorPanel />
    </div>
  );
}

const PARIS: [number, number] = [2.35, 48.85];
const LYON: [number, number] = [4.83, 45.76];
const BORDEAUX: [number, number] = [-0.57, 44.84];
const NICE: [number, number] = [7.26, 43.7];

const line = (...coordinates: [number, number][]) => wrapGeometry({ type: 'LineString', coordinates });

/** A drive as a user leaves it after editing it in the inspector. */
function editedCar(): RouteItem {
  const route = createEndpointRouteItem({
    id: 'r-car',
    mode: 'car',
    geojson: line(PARIS, [3.1, 47.2], LYON),
    start: PARIS,
    end: LYON,
    startName: 'Paris',
    endName: 'Lyon',
    name: 'Road trip',
    startTime: 2,
    endTime: 9,
    pro: true,
  });
  return {
    ...route,
    easing: 'linear',
    exitAnimation: 'fade',
    style: { ...route.style, color: '#ef4444', width: 8, dashPattern: [8, 4], glow: false },
    calculation: { ...route.calculation!, vehicle: { enabled: true, type: 'car', modelId: '', scale: 3 } } as RouteItem['calculation'],
  };
}

function fileWith(...items: TimelineItem[]): Project {
  const empty = createProject({ id: 'file', mapCenter: PARIS });
  return {
    ...empty,
    items: { ...empty.items, ...Object.fromEntries(items.map((i) => [i.id, i])) },
    itemOrder: [...empty.itemOrder, ...items.map((i) => i.id)],
  };
}

let stopGestures: () => void;
let uninstallMocks: () => void;
let restoreCapture: () => void;
let warn: ReturnType<typeof vi.spyOn>;
let chooserPrevented: boolean[];

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(async () => {
  await loadAirports();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  uninstallMocks = installFetchMocks();
  stopGestures = installGestureTracking();
  chooserPrevented = [];
  // As in the frame: a synthetic press cannot capture the pointer, and a slider has a width to drag along.
  Element.prototype.setPointerCapture = () => {
    throw new DOMException('No active pointer', 'NotFoundError');
  };
  restoreCapture = installPointerCapturePatch();
  const measure = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.matches('[data-slot="slider"]') ? ({ x: 100, y: 0, left: 100, top: 0, right: 500, bottom: 10, width: 400, height: 10, toJSON: () => ({}) } as DOMRect) : measure.call(this);
  });
  useAuthStore.setState({ user: { id: 'demo' } as never });
  useUiPreferencesStore.setState({ inspectorSections: {} });
  clearHistory();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  restoreCapture();
  vi.mocked(Element.prototype.getBoundingClientRect).mockRestore();
  stopGestures();
  uninstallMocks();
  clearMocks();
  warn.mockRestore();
  vi.unstubAllGlobals();
  useAuthStore.setState({ user: null });
});

/** Starts the run's empty project for `file`, renders the editor, runs the route's step; every version of the UI's route is recorded. */
async function runRoute(file: Project, id: string) {
  useProjectStore.setState({ ...startingProject(file), ...createTransientState(), isInspectorOpen: true });
  clearHistory();
  render(<Editor onChooser={(prevented) => chooserPrevented.push(prevented)} />);
  const step = planDemo(file).find((s): s is Extract<DemoStep, { kind: 'item' }> => s.kind === 'item' && s.itemId === id)!;
  const seen: RouteItem[] = [];
  const unsubscribe = useProjectStore.subscribe((s) => {
    for (const item of Object.values(s.items)) if (item.kind === 'route' && item.id !== id) seen.push(item);
  });
  await runStep(testContext(), step, file);
  unsubscribe();
  return { seen, last: seen[seen.length - 1] };
}

// Runs are not wrapped in act(): act holds React's renders until it exits, and a run needs
// each click's render before the next control can be found.
describe('route runner', () => {
  it('plans a drive in the Plan Route panel, edits it in the inspector, then swaps in the file’s route', async () => {
    const car = { ...editedCar(), autoCam: { enabled: true, mode: 'navigation', pitch: 55, smoothing: 0.4, distance: 300, zoom: 15, lookAhead: 400, dynamics: 0.8 } } as RouteItem;
    const file = fileWith(car);
    const { last } = await runRoute(file, 'r-car');

    // What the panel made and the inspector edited, before the file's route replaced it.
    expect(last).toMatchObject({
      name: 'Road trip',
      startTime: 2,
      endTime: 9,
      easing: 'linear',
      exitAnimation: 'fade',
      style: { color: '#ef4444', width: 8, dashPattern: [8, 4], glow: false },
      calculation: { mode: 'car', startPoint: PARIS, endPoint: LYON, startName: 'Paris', endName: 'Lyon', vehicle: { type: 'car' } },
      autoCam: { enabled: true, mode: 'navigation' },
    });
    expect(last.calculation?.vehicle?.scale).toBeCloseTo(3, 1);
    expect(last.autoCam?.pitch).toBe(55);
    expect(last.autoCam?.zoom).toBe(15);
    // The drawn line is the file’s, from the directions answer.
    expect(last.geojson.features[0].geometry).toMatchObject({ type: 'LineString' });
    expect(warn).not.toHaveBeenCalled();

    const state = useProjectStore.getState();
    expect(state.items['r-car']).toEqual(car);
    expect(Object.keys(state.items)).toEqual(['camera-track', 'r-car']);
    expect(state.selectedItemId).toBe('r-car');
    expect(state.selectedAutoCamRouteId).toBeNull();
    expect(getHistoryEntries().past.length).toBeGreaterThan(8);
    expect(getHistoryEntries().past.every((entry) => entry.source === 'user')).toBe(true);
  }, 30_000);
});
