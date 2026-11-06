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
import { autoCamPresetPatch, routeFitOf } from '@/config/vehicles';
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
  return { seen, last: seen[seen.length - 1], step };
}

/** The route as an item step leaves it: the file's, on the timing the app gave the new clip (the timeline step moves it). */
const onUiTiming = (route: RouteItem, step: Extract<DemoStep, { kind: 'item' }>): RouteItem => ({ ...route, ...step.timing });

// Runs are not wrapped in act(): act holds React's renders until it exits, and a run needs
// each click's render before the next control can be found.
describe('route runner', () => {
  it('plans a drive in the Plan Route panel, edits it in the inspector, then swaps in the file’s route', async () => {
    const car = { ...editedCar(), autoCam: { enabled: true, mode: 'navigation', pitch: 55, smoothing: 0.4, distance: 300, zoom: 15, lookAhead: 400, dynamics: 0.8 } } as RouteItem;
    const file = fileWith(car);
    const { last, step } = await runRoute(file, 'r-car');
    const ui = step.timing!;

    // What the panel made and the inspector edited, before the file's route replaced it.
    expect(last).toMatchObject({
      name: 'Road trip',
      ...ui,
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
    expect(state.items['r-car']).toEqual(onUiTiming(car, step));
    expect(Object.keys(state.items)).toEqual(['camera-track', 'r-car']);
    expect(state.selectedItemId).toBe('r-car');
    expect(state.selectedAutoCamRouteId).toBeNull();
    expect(getHistoryEntries().past.length).toBeGreaterThan(8);
    expect(getHistoryEntries().past.every((entry) => entry.source === 'user')).toBe(true);
  }, 30_000);

  it('sets the Follow camera up in its panel: the Drone preset, then a tuned angle and a dragged distance', async () => {
    const car = editedCar();
    const drone = autoCamPresetPatch('drone', 'car', routeFitOf(car));
    const autoCam = { ...drone, enabled: true, mode: 'cinematic', pitch: 38, orbit: 0.3, distance: Math.round(drone.distance / 2) } as RouteItem['autoCam'];
    const target: RouteItem = { ...car, autoCam };
    const { last, step } = await runRoute(fileWith(target), 'r-car');

    expect(last.autoCam).toMatchObject({ enabled: true, mode: 'cinematic', preset: 'drone', pitch: 38 });
    expect(last.autoCam?.orbit).toBeCloseTo(0.3, 1);
    // The distance slider is dragged, so it lands within a pixel of the file's value.
    expect(last.autoCam!.distance / autoCam!.distance).toBeGreaterThan(0.9);
    expect(last.autoCam!.distance / autoCam!.distance).toBeLessThan(1.1);
    expect(useProjectStore.getState().items['r-car']).toEqual(onUiTiming(target, step));
    expect(useProjectStore.getState().selectedAutoCamRouteId).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  }, 30_000);

  it('places a walk’s points one by one, then tunes the curvature in the Path section', async () => {
    const points: [number, number][] = [PARIS, [2.9, 48.2], [3.4, 47.9], LYON];
    const walk = createWalkRouteItem({ id: 'r-walk', points, curved: true, name: 'Pilgrimage', startTime: 1 });
    const tuned: RouteItem = { ...walk, calculation: { ...walk.calculation!, sharpness: 0.7 } as RouteItem['calculation'] };
    const { seen, last, step } = await runRoute(fileWith(tuned), 'r-walk');

    // The panel inserts a walk through the file's points, then the inspector names and tunes it.
    const inserted = seen.find((r) => r.calculation?.mode === 'walk')!;
    expect(inserted.calculation).toMatchObject({ mode: 'walk', points });
    expect(inserted.name).toBe('Walk path');
    expect(last).toMatchObject({ name: 'Pilgrimage', ...step.timing });
    expect((last.calculation as { sharpness: number }).sharpness).toBeCloseTo(0.7, 1);
    expect(warn).not.toHaveBeenCalled();
    expect(useProjectStore.getState().items['r-walk']).toEqual(onUiTiming(tuned, step));
    expect(useProjectStore.getState().activePicker).toBeNull();
  }, 30_000);

  it('imports a walk of more than ten points as a route file instead of clicking them out', async () => {
    const many: [number, number][] = Array.from({ length: 11 }, (_, i) => [2 + i * 0.3, 48 - i * 0.2]);
    const walk = createWalkRouteItem({ id: 'r-long', points: many, curved: true, name: 'Camino', startTime: 1 });
    const { seen, last, step } = await runRoute(fileWith(walk), 'r-long');

    // The chooser's click was held back and the route first on screen is the imported one: no walk path, no placed points.
    expect(chooserPrevented).toEqual([true]);
    expect(seen[0].calculation).toBeUndefined();
    expect(seen[0].geojson).toEqual(walk.geojson);
    expect(seen.some((r) => r.name === 'Walk path')).toBe(false);
    expect(last).toMatchObject({ name: 'Camino', ...step.timing });
    expect(useProjectStore.getState().items['r-long']).toEqual(onUiTiming(walk, step));
    expect(warn).not.toHaveBeenCalled();
  }, 30_000);

  it('still clicks out a walk of exactly ten points', async () => {
    const ten: [number, number][] = Array.from({ length: 10 }, (_, i) => [2 + i * 0.3, 48 - i * 0.2]);
    const walk = createWalkRouteItem({ id: 'r-ten', points: ten, curved: true, startTime: 0 });
    const { seen } = await runRoute(fileWith(walk), 'r-ten');
    expect(chooserPrevented).toEqual([]);
    expect(seen.find((r) => r.calculation?.mode === 'walk')?.calculation).toMatchObject({ points: ten });
  }, 60_000);

  it('turns Smooth Curve off in the panel for a straight walk', async () => {
    const walk = createWalkRouteItem({ id: 'r-straight', points: [PARIS, LYON, NICE], curved: false, startTime: 0 });
    const { seen } = await runRoute(fileWith(walk), 'r-straight');
    expect(seen.find((r) => r.calculation?.mode === 'walk')?.calculation).toMatchObject({ curved: false, points: [PARIS, LYON, NICE] });
    expect(useProjectStore.getState().items['r-straight']).toEqual(walk);
  }, 30_000);

  it('searches the airports for a flight, and edits a comet trail and a plane marker', async () => {
    const airports = await loadAirports();
    const from = airports.find((a) => a.iata === 'JFK')!;
    const to = airports.find((a) => a.iata === 'LHR')!;
    const flight = createEndpointRouteItem({
      id: 'r-flight',
      mode: 'flight',
      geojson: line(from.coordinates, to.coordinates),
      start: from.coordinates,
      end: to.coordinates,
      startName: from.name,
      endName: to.name,
      name: 'Transatlantic',
      startTime: 4,
      pro: true,
    });
    const edited: RouteItem = {
      ...flight,
      style: { ...flight.style, animationType: 'comet', cometTrailLength: 0.4 },
      calculation: { ...flight.calculation!, vehicle: { enabled: true, type: 'plane', modelId: '', scale: 6 } } as RouteItem['calculation'],
    };
    const { last, step } = await runRoute(fileWith(edited), 'r-flight');
    expect(last.calculation).toMatchObject({ mode: 'flight', startName: from.name, endName: to.name, vehicle: { type: 'plane' } });
    expect(last.calculation?.vehicle?.scale).toBeCloseTo(6, 0);
    expect(last).toMatchObject({ name: 'Transatlantic', ...step.timing, style: { animationType: 'comet' } });
    expect(last.style.cometTrailLength).toBeCloseTo(0.4, 1);
    expect(warn).not.toHaveBeenCalled();
    expect(useProjectStore.getState().items['r-flight']).toEqual(onUiTiming(edited, step));
  }, 30_000);

  /** A drive from each spoke to Paris, as the Plan Route list makes them. */
  function spokeRoutes(starts: number[], mode: 'car' | 'flight' = 'car'): RouteItem[] {
    return [LYON, BORDEAUX, NICE].slice(0, starts.length).map((from, i) =>
      createEndpointRouteItem({
        id: `r-spoke-${i}`,
        mode,
        geojson: line(from, PARIS),
        start: from,
        end: PARIS,
        startName: ['Lyon', 'Bordeaux', 'Nice'][i],
        endName: 'Paris',
        name: `${['Lyon', 'Bordeaux', 'Nice'][i]} to Paris`,
        startTime: starts[i],
        pro: true,
      }),
    );
  }

  it('makes a hub and spoke list in the panel, then edits each of its routes in turn', async () => {
    const [lyon, bordeaux, nice] = spokeRoutes([1, 3.5, 6]);
    const edited: RouteItem = { ...bordeaux, name: 'Wine run', style: { ...bordeaux.style, color: '#22c55e' } };
    const file = fileWith(lyon, edited, nice);
    expect(planDemo(file).filter((s) => s.kind === 'item').map((s) => s.label)).toEqual(['Route: Lyon to Paris', 'Route: Wine run', 'Route: Nice to Paris']);

    const ctx = testContext();
    useProjectStore.setState({ ...startingProject(file), ...createTransientState(), isInspectorOpen: true });
    clearHistory();
    render(<Editor onChooser={() => {}} />);
    const steps = planDemo(file).filter((s): s is Extract<DemoStep, { kind: 'item' }> => s.kind === 'item');

    await runStep(ctx, steps[0], file);
    // One Create made all three routes; the first is now the file's, the other two wait their turn.
    let routes = Object.values(useProjectStore.getState().items).filter((i) => i.kind === 'route');
    expect(routes).toHaveLength(3);
    expect(routes.map((r) => r.id)).toContain('r-spoke-0');
    expect(routes.filter((r) => !file.items[r.id])).toHaveLength(2);
    expect(useProjectStore.getState().items['r-spoke-0']).toEqual(onUiTiming(lyon, steps[0]));

    // The gap typed into the panel spaced the starts 2.5 s apart, from the playhead.
    const pending = routes.filter((r) => !file.items[r.id]) as RouteItem[];
    expect(pending.map((r) => r.startTime)).toEqual([2.5, 5]);

    await runStep(ctx, steps[1], file);
    await runStep(ctx, steps[2], file);
    routes = Object.values(useProjectStore.getState().items).filter((i) => i.kind === 'route');
    expect(routes.map((r) => r.id)).toEqual(['r-spoke-0', 'r-spoke-1', 'r-spoke-2']);
    // Each keeps the start the list gave it, which the timeline step moves to the file's.
    expect(useProjectStore.getState().items['r-spoke-1']).toEqual({ ...edited, startTime: 2.5, endTime: 7.5 });
    expect(useProjectStore.getState().items['r-spoke-2']).toEqual({ ...nice, startTime: 5, endTime: 10 });
    expect(useProjectStore.getState().itemOrder).toEqual(['camera-track', 'r-spoke-0', 'r-spoke-1', 'r-spoke-2']);
    expect(warn).not.toHaveBeenCalled();
    // The timeline step (no timeline here, so it writes) puts every clip on the file's timing.
    await runStep(ctx, planDemo(file).find((s) => s.kind === 'timeline')!, file);
    expect(pickProject(useProjectStore.getState()).items).toEqual(file.items);
  }, 60_000);

  it('picks the all at once schedule and a flight hub from the airports', async () => {
    const airports = await loadAirports();
    const hub = airports.find((a) => a.iata === 'CDG')!;
    const spokes = ['JFK', 'LHR'].map((code) => airports.find((a) => a.iata === code)!);
    const flights = spokes.map((from, i) =>
      createEndpointRouteItem({
        id: `f-${i}`,
        mode: 'flight',
        geojson: line(from.coordinates, hub.coordinates),
        start: from.coordinates,
        end: hub.coordinates,
        startName: from.name,
        endName: hub.name,
        name: `${from.name} → ${hub.name}`,
        startTime: 0,
        pro: true,
      }),
    );
    const file = fileWith(...flights);
    const ctx = testContext();
    useProjectStore.setState({ ...startingProject(file), ...createTransientState(), isInspectorOpen: true });
    render(<Editor onChooser={() => {}} />);
    const steps = planDemo(file).filter((s): s is Extract<DemoStep, { kind: 'item' }> => s.kind === 'item');
    for (const step of steps) await runStep(ctx, step, file);
    expect(useProjectStore.getState().items['f-0']).toEqual(flights[0]);
    expect(useProjectStore.getState().items['f-1']).toEqual(flights[1]);
    expect(Object.keys(useProjectStore.getState().items)).toEqual(['camera-track', 'f-0', 'f-1']);
    expect(warn).not.toHaveBeenCalled();
  }, 60_000);

  it('clicks the import entry without opening the file dialog, then adds the imported route and edits it', async () => {
    const imported = createImportedRouteItem({ id: 'r-gpx', name: 'Morning ride', geojson: line(PARIS, [2.6, 48.4], LYON), startTime: 0 });
    const target: RouteItem = {
      ...imported,
      startTime: 3,
      style: { ...imported.style, color: '#a855f7', glow: true },
      // A marker on an imported route has a calculation with no places.
      calculation: { mode: 'car', startPoint: [0, 0], endPoint: [0, 0], startName: '', endName: '', vehicle: { enabled: true, type: 'plane', modelId: '', scale: 2 } },
    };
    const { seen, last, step } = await runRoute(fileWith(target), 'r-gpx');

    // The chooser's click was held back; the route is the imported one with the file's geometry.
    expect(chooserPrevented).toEqual([true]);
    expect(seen[0]).toMatchObject({ name: 'Morning ride', geojson: imported.geojson });
    expect(seen[0].calculation).toBeUndefined();
    expect(last).toMatchObject({ ...step.timing, style: { color: '#a855f7', glow: true }, calculation: { vehicle: { enabled: true, type: 'plane' } } });
    expect(useProjectStore.getState().items['r-gpx']).toEqual(onUiTiming(target, step));
    expect(useProjectStore.getState().activePicker).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  }, 30_000);

  it('runs a custom 3D marker on the model the project holds', async () => {
    const car = editedCar();
    const model = { id: 'm-bike', fileName: 'Bike.glb', byteSize: 10, sha256: 'cd'.repeat(32), bounds: { min: [0, 0, 0], max: [1, 2, 3] } } as Project['models'][string];
    const target: RouteItem = {
      ...car,
      calculation: { ...car.calculation!, vehicle: { enabled: true, type: 'custom', modelId: 'm-bike', scale: 2 } } as RouteItem['calculation'],
    };
    const file = { ...fileWith(target), models: { 'm-bike': model } };
    const { last, step } = await runRoute(file, 'r-car');
    expect(last.calculation?.vehicle).toMatchObject({ type: 'custom', modelId: 'm-bike' });
    expect(useProjectStore.getState().items['r-car']).toEqual(onUiTiming(target, step));
    expect(useProjectStore.getState().models).toEqual({ 'm-bike': model });
  }, 30_000);

  it('still ends on the file’s route when the panel cannot be found', async () => {
    const car = editedCar();
    const file = fileWith(car);
    useProjectStore.setState({ ...startingProject(file), ...createTransientState(), isInspectorOpen: true });
    render(<InspectorPanel />);
    const step = planDemo(file).find((s): s is Extract<DemoStep, { kind: 'item' }> => s.kind === 'item')!;
    await runStep(testContext(), step, file);
    expect(useProjectStore.getState().items['r-car']).toEqual(onUiTiming(car, step));
    expect(warn).toHaveBeenCalled();
  }, 30_000);

  it('ends a whole run of routes on exactly the file’s project', async () => {
    const walk = createWalkRouteItem({ id: 'r-walk', points: [PARIS, LYON, NICE], curved: true, startTime: 2 });
    const file = fileWith(editedCar(), walk);
    const ctx = testContext();
    useProjectStore.setState({ ...startingProject(file), ...createTransientState(), isInspectorOpen: true });
    render(<Editor onChooser={() => {}} />);
    for (const step of planDemo(file)) await runStep(ctx, step, file);
    expect(pickProject(useProjectStore.getState())).toEqual(pickProject(file));
  }, 60_000);
});
