import { useState } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteAddDropdown } from '@/components/Toolbar/RouteAddDropdown';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { clearHistory, installGestureTracking } from '@/store/history';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import { loadAirports } from '@/services/airports/airportService';
import { createProject } from '@/store/projectDocument';
import type { Project, RouteItem } from '@/store/types';
import { click, installPointerCapturePatch, query, type DemoContext, type Target } from './actions';
import { clearMocks, installFetchMocks } from './mocks';
import { planDemo, type DemoStep } from './plan';
import { runStep } from './runners';
import { startingProject } from './startState';
import { testContext } from './testContext';

// The map is not there to click in tests: pickOnMap is replaced by a stand-in that
// presses the real button and lets the app's picker take the point, as a map click does.
const pickOnMap = vi.hoisted(() => vi.fn());
vi.mock('./mapPick', () => ({ pickOnMap }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));

function Editor() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <RouteAddDropdown isOpen={open} onOpenChange={setOpen} onImportClick={() => {}} />
      <InspectorPanel />
    </div>
  );
}

const PARIS: [number, number] = [2.35, 48.85];
const LYON: [number, number] = [4.83, 45.76];
const BORDEAUX: [number, number] = [-0.57, 44.84];
const line = (...coordinates: [number, number][]) => wrapGeometry({ type: 'LineString', coordinates });

function fileWith(...items: RouteItem[]): Project {
  const empty = createProject({ id: 'file', mapCenter: PARIS });
  return { ...empty, items: { ...empty.items, ...Object.fromEntries(items.map((i) => [i.id, i])) }, itemOrder: [...empty.itemOrder, ...items.map((i) => i.id)] };
}

/** Which field a Pick on the map button belongs to: the label above its row. */
const fieldOf = (target: Target) => {
  const button = (target instanceof Element ? target : query(target)) as Element;
  for (let node = button.parentElement; node; node = node.parentElement) {
    if (node.matches('[data-testid="hub-spoke-list"]')) return 'List';
    const label = node.querySelector(':scope > span')?.textContent;
    if (label) return label;
  }
  return undefined;
};

let stopGestures: () => void;
let uninstallMocks: () => void;
let restoreCapture: () => void;
let warn: ReturnType<typeof vi.spyOn>;
let picked: Array<{ field: string | undefined; point: [number, number] }>;

beforeEach(async () => {
  await loadAirports();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  uninstallMocks = installFetchMocks();
  stopGestures = installGestureTracking();
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.setPointerCapture = () => {
    throw new DOMException('No active pointer', 'NotFoundError');
  };
  restoreCapture = installPointerCapturePatch();
  useAuthStore.setState({ user: { id: 'demo' } as never });
  useUiPreferencesStore.setState({ inspectorSections: {} });
  clearHistory();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  picked = [];
  pickOnMap.mockReset();
  pickOnMap.mockImplementation(async (ctx: DemoContext, button: Target, lngLat: [number, number]) => {
    picked.push({ field: fieldOf(button), point: lngLat });
    if (!(await click(ctx, button))) return false;
    useProjectStore.getState().activePicker?.onPick({ lngLat, name: `${lngLat[0].toFixed(5)}, ${lngLat[1].toFixed(5)}` });
    useProjectStore.getState().stopPicking();
    return true;
  });
});

afterEach(() => {
  restoreCapture();
  stopGestures();
  uninstallMocks();
  clearMocks();
  warn.mockRestore();
  vi.unstubAllGlobals();
  useAuthStore.setState({ user: null });
});

/** Runs the route's step in a fresh project; the routes the panel made are recorded as the UI left them. */
async function runRoute(file: Project, id: string) {
  useProjectStore.setState({ ...startingProject(file), ...createTransientState(), isInspectorOpen: true });
  clearHistory();
  render(<Editor />);
  const step = planDemo(file).find((s): s is Extract<DemoStep, { kind: 'item' }> => s.kind === 'item' && s.itemId === id)!;
  const seen: RouteItem[] = [];
  const unsubscribe = useProjectStore.subscribe((s) => {
    for (const item of Object.values(s.items)) if (item.kind === 'route' && item.id !== id) seen.push(item);
  });
  await runStep(testContext(), step, file);
  unsubscribe();
  return seen[seen.length - 1];
}

const drive = (startName: string, endName: string, start = PARIS, end = LYON) =>
  createEndpointRouteItem({ id: 'r-car', mode: 'car', geojson: line(start, end), start, end, startName, endName, name: 'Drive', startTime: 1, pro: true });

describe('route runner: places the file has no name for', () => {
  it('picks an unnamed place on the map and types the named one into its search', async () => {
    const last = await runRoute(fileWith(drive('', 'Lyon')), 'r-car');
    expect(picked).toEqual([{ field: 'Start', point: PARIS }]);
    expect(last.calculation).toMatchObject({ mode: 'car', startPoint: PARIS, endPoint: LYON, endName: 'Lyon' });
    expect(warn).not.toHaveBeenCalled();
  }, 30_000);

  it('picks both places of a drive with no names on the map', async () => {
    await runRoute(fileWith(drive('', '')), 'r-car');
    expect(picked).toEqual([{ field: 'Start', point: PARIS }, { field: 'End', point: LYON }]);
  }, 30_000);

  it('types the coordinates when the map cannot be picked on', async () => {
    pickOnMap.mockResolvedValue(false);
    const typed: string[] = [];
    const record = (e: Event) => typed.push((e.target as HTMLInputElement).value);
    document.addEventListener('input', record);
    await runRoute(fileWith(drive('', 'Lyon')), 'r-car');
    document.removeEventListener('input', record);
    expect(pickOnMap).toHaveBeenCalledTimes(1);
    // Typed one character at a time into the Start field; the End was searched by name.
    expect(typed).toContain('2.35, 48.85');
    expect(typed).toContain('Lyon');
  }, 30_000);

  it('picks a flight endpoint that is no airport on the map, and searches the airport for the other', async () => {
    const airports = await loadAirports();
    const to = airports.find((a) => a.iata === 'LHR')!;
    const from: [number, number] = [10.123, 20.456];
    const flight = createEndpointRouteItem({
      id: 'r-car', mode: 'flight', geojson: line(from, to.coordinates), start: from, end: to.coordinates, startName: '', endName: to.name, name: 'Flight', startTime: 1, pro: true,
    });
    const last = await runRoute(fileWith(flight), 'r-car');
    expect(picked).toEqual([{ field: 'Departure', point: from }]);
    expect(last.calculation).toMatchObject({ mode: 'flight', startPoint: from, endName: to.name });
  }, 30_000);

  it('picks the unnamed places of a hub and spoke list on the map', async () => {
    const spoke = (id: string, from: [number, number]) =>
      createEndpointRouteItem({ id, mode: 'car', geojson: line(from, PARIS), start: from, end: PARIS, startName: '', endName: 'Paris', name: id, startTime: 1, pro: true });
    const file = fileWith(spoke('r-car', LYON), spoke('r-bordeaux', BORDEAUX));
    await runRoute(file, 'r-car');
    expect(picked.map((p) => p.point)).toEqual([LYON, BORDEAUX]);
    expect(picked.map((p) => p.field)).toEqual(['Start', 'List']);
    expect(warn).not.toHaveBeenCalled();
  }, 30_000);
});
