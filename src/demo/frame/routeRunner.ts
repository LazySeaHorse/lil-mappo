import { useProjectStore } from '@/store/useProjectStore';
import { beginGesture, endGesture, withoutHistory } from '@/store/history';
import { createImportedRouteItem } from '@/store/itemFactories';
import type { AutoCamConfig, Project, RouteItem } from '@/store/types';
import { getAgentMap } from '@/agent/mapRef';
import { frameGeometry } from '@/engine/mapFraming';
import { loadAirports } from '@/services/airports/airportService';
import { AUTO_CAM_PRESETS } from '@/config/vehicles';
import {
  FOLLOW_CAMERA_SLIDERS,
  FOLLOW_CAMERA_TERMS,
  HUB_SPOKE_TERMS,
  PLACE_FIELD_TERMS,
  ROUTE_MODE_LABELS,
  ROUTE_PATH_TERMS,
  ROUTE_TERMS,
} from '@/lib/terms';
import { click, drag, find, key, pause, query, setSlider, selectOption, type, warn, type DemoContext, type Locator } from './actions';
import { travelDuration } from './cursor';
import { openSection, showEdit, type EditOutcome } from './edits';
import { currentLayout, currentLocators, type Locators } from './locators';
import { pickOnMap } from './mapPick';
import { mockDirections, mockPlaceSearch } from './mocks';
import { showAddBar } from './phone';
import { deepEqual, getPath, hasPlacedEndpoints, isTimingEdit, routeEdits, type DemoStep, type FieldEdit } from './plan';
import { commitStep } from './runners';
import { ROUTE_FIELDS } from './routeFields';
import { hubPlanFor, type HubPlan } from './routePlan';

/**
 * Routes on screen. The Plan Route panel makes the route the way a person
 * would: the mode, the places typed into the real search (answered from the
 * file's route, see mocks.ts), Preview path, Insert; a list of places for a
 * hub and spoke; a walk's points placed on the map; an imported file's entry
 * clicked. Then the inspector edits whatever still differs from the file
 * (RouteInspector's sections, the Follow camera panel), and the step's final
 * write swaps in the file's route.
 */

type ItemStep = Extract<DemoStep, { kind: 'item' }>;
type EndpointCalc = Extract<NonNullable<RouteItem['calculation']>, { mode: 'car' | 'flight' }>;
type WalkCalc = Extract<NonNullable<RouteItem['calculation']>, { mode: 'walk' }>;
type Point = [number, number];

const routeIds = (): string[] => {
  const { items, itemOrder } = useProjectStore.getState();
  return itemOrder.filter((id) => items[id]?.kind === 'route');
};

const liveRoute = (id: string): RouteItem | null => {
  const item = useProjectStore.getState().items[id];
  return item?.kind === 'route' ? item : null;
};

const samePoint = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** Polls (in real time) until `ready` says so; false on timeout. */
async function waitUntil(ctx: DemoContext, ready: () => boolean, timeout = 4000): Promise<boolean> {
  for (let waited = 0; !ready(); waited += 50) {
    if (waited >= timeout) return false;
    await ctx.clock.realDelay(50);
  }
  return true;
}

/** The line a directions search should answer with: the file route's own. */
function lineOf(geojson: GeoJSON.FeatureCollection): GeoJSON.LineString | undefined {
  const geometry = geojson.features[0]?.geometry;
  return geometry?.type === 'LineString' ? geometry : undefined;
}

// --- the Plan Route panel -----------------------------------------------------------

async function openRoutePanel(ctx: DemoContext, L: Locators): Promise<boolean> {
  if (query(L.addRoutePanel)) return true;
  await showAddBar(ctx, L);
  if (!(await click(ctx, L.addRouteButton))) return false;
  return !!(await find(ctx, L.addRoutePanel, { timeout: 2000 }));
}

/** Closes the panel if a flow left it open (Escape, as a user would). */
function closeRoutePanel(L: Locators): void {
  const panel = query(L.addRoutePanel);
  if (panel) key(panel, 'Escape');
}

/** The panel keeps its mode between uses, so the switch is clicked only when it is not on the mode already. */
async function chooseMode(ctx: DemoContext, L: Locators, mode: 'car' | 'walk' | 'flight'): Promise<boolean> {
  const label = ROUTE_MODE_LABELS[mode];
  if (query(L.routeMode(label))?.getAttribute('aria-checked') === 'true') return true;
  return click(ctx, L.routeMode(label));
}

/** A place field of the panel: the box to type in and the Pick on the map button beside it. */
interface PlaceField {
  input: Locator;
  pickButton: Locator;
}

const placeField = (L: Locators, label: string): PlaceField => ({
  input: L.routePlaceField(label),
  pickButton: L.routePickOnMapButton(label),
});

/**
 * Puts a point that has no place name into a field. A saved file does not keep
 * the name of a point that was picked on the map, so this does what the person
 * did: Pick on the map, then the click. Coordinates are typed (a field takes
 * them on Enter) only when the map cannot be picked on.
 */
async function pickPoint(ctx: DemoContext, field: PlaceField, point: Point): Promise<boolean> {
  if (await pickOnMap(ctx, field.pickButton, point)) return true;
  return type(ctx, field.input, `${point[0]}, ${point[1]}`, { enter: true });
}

/** Searches an airport for the place (by the code, else the name) and picks it from the list. */
async function pickAirport(ctx: DemoContext, L: Locators, field: PlaceField, point: Point, name: string): Promise<boolean> {
  const airports = await loadAirports();
  const airport = airports.find((a) => samePoint(a.coordinates, point)) ?? airports.find((a) => a.name === name);
  // A point that is no airport was picked on the map.
  if (!airport) return pickPoint(ctx, field, point);
  if (!(await type(ctx, field.input, airport.iata || airport.name))) return false;
  return click(ctx, L.routeAirportResult(airport.name));
}

/**
 * Types the place into a field and picks the result. The search is answered
 * from the file's place (name and coordinates); a place with no name is picked
 * on the map.
 */
async function pickPlace(ctx: DemoContext, L: Locators, mode: 'car' | 'flight', field: PlaceField, point: Point, name: string): Promise<boolean> {
  if (mode === 'flight') return pickAirport(ctx, L, field, point, name);
  if (!name) return pickPoint(ctx, field, point);
  mockPlaceSearch(name, [{ name, coordinates: point }]);
  if (!(await type(ctx, field.input, name, { enter: true }))) return false;
  return click(ctx, L.routePlaceResult(name));
}

/** What the directions search should answer for a car route between its endpoints. */
function mockPath(item: RouteItem, calc: EndpointCalc): void {
  const geometry = lineOf(item.geojson);
  if (calc.mode === 'car' && geometry) mockDirections({ start: calc.startPoint, end: calc.endPoint, geometry });
}

const placeLabels = (mode: 'car' | 'flight') =>
  mode === 'flight'
    ? { start: PLACE_FIELD_TERMS.departure, end: PLACE_FIELD_TERMS.arrival }
    : { start: PLACE_FIELD_TERMS.start, end: PLACE_FIELD_TERMS.end };

/** The route the panel added: the first route id that was not there before. */
const addedRoutes = (before: Set<string>): string[] => routeIds().filter((id) => !before.has(id));

/** Car or flight: both places, Preview path, Insert route. */
async function addEndpointRoute(ctx: DemoContext, item: RouteItem, calc: EndpointCalc): Promise<string | null> {
  const L = currentLocators();
  const labels = placeLabels(calc.mode);
  mockPath(item, calc);
  const before = new Set(routeIds());

  if (!(await openRoutePanel(ctx, L)) || !(await chooseMode(ctx, L, calc.mode))) return null;
  if (!(await pickPlace(ctx, L, calc.mode, placeField(L, labels.start), calc.startPoint, calc.startName))) return null;
  if (!(await pickPlace(ctx, L, calc.mode, placeField(L, labels.end), calc.endPoint, calc.endName))) return null;
  if (!(await click(ctx, L.routePreviewButton))) return null;
  if (!(await find(ctx, L.routeInsertButton, { timeout: 5000 })) || !(await click(ctx, L.routeInsertButton))) return null;
  return addedRoutes(before)[0] ?? null;
}

/**
 * Hub and spoke: the hub in its field, the first spoke in the other, the "+"
 * pill that turns that field into a list, the rest of the places in the list,
 * the schedule, then Create. Returns the routes it made, in the list's order.
 */
async function addHubRoutes(ctx: DemoContext, plan: HubPlan, file: Project): Promise<string[]> {
  const L = currentLocators();
  const routes = plan.ids.map((id) => file.items[id] as RouteItem);
  const calcs = routes.map((route) => route.calculation as EndpointCalc);
  const labels = placeLabels(plan.mode);
  // `start` is the list side: many starts converge on one end.
  const hubKey = plan.side === 'start' ? 'end' : 'start';
  const spokeKey = plan.side;
  const hubPoint = (c: EndpointCalc) => (hubKey === 'end' ? c.endPoint : c.startPoint);
  const hubName = (c: EndpointCalc) => (hubKey === 'end' ? c.endName : c.startName);
  const spokePoint = (c: EndpointCalc) => (spokeKey === 'end' ? c.endPoint : c.startPoint);
  const spokeName = (c: EndpointCalc) => (spokeKey === 'end' ? c.endName : c.startName);
  routes.forEach((route, i) => mockPath(route, calcs[i]));
  const before = new Set(routeIds());

  if (!(await openRoutePanel(ctx, L)) || !(await chooseMode(ctx, L, plan.mode))) return [];
  if (!(await pickPlace(ctx, L, plan.mode, placeField(L, labels[hubKey]), hubPoint(calcs[0]), hubName(calcs[0])))) return [];
  if (!(await pickPlace(ctx, L, plan.mode, placeField(L, labels[spokeKey]), spokePoint(calcs[0]), spokeName(calcs[0])))) return [];
  if (!(await click(ctx, L.routeMakeListPill(labels[spokeKey])))) return [];
  for (const calc of calcs.slice(1)) {
    if (!(await pickPlace(ctx, L, plan.mode, { input: L.routeSpokeField, pickButton: L.routeSpokePickOnMapButton }, spokePoint(calc), spokeName(calc)))) return [];
  }

  // Staggered with a gap of one second is what the panel starts on.
  if (plan.timing === 'together') await click(ctx, L.routeTimingOption(HUB_SPOKE_TERMS.together));
  if (plan.timing === 'sequence') await click(ctx, L.routeTimingOption(HUB_SPOKE_TERMS.sequence));
  if (plan.timing === 'staggered' && plan.gap !== 1) await type(ctx, L.routeGapField, String(plan.gap), { enter: true });

  // The Create button is on once every path is worked out.
  const create: Locator = { ...L.routeCreateHubButton, name: HUB_SPOKE_TERMS.create(plan.ids.length) };
  await waitUntil(ctx, () => !!query(create) && !(query(create) as HTMLButtonElement).disabled, 6000);
  if (!(await click(ctx, create))) return [];
  return addedRoutes(before);
}

/** Frames `geojson` on the map the way an insert does (a map may not be there, as in tests). */
async function frameOnMap(ctx: DemoContext, geojson: GeoJSON.FeatureCollection): Promise<void> {
  const map = getAgentMap();
  // The side inspector leaves the map less room than the phone's drawer: frame for the layout on screen.
  if (map && frameGeometry(map, geojson, currentLayout())) await pause(ctx, ctx.timing.betweenSteps);
}

/**
 * Where on the screen the map shows a point, or null with no map or when the
 * point is off it. Fit mode scales the map container, hence the ratio.
 */
function screenPointOf(lngLat: Point): { x: number; y: number } | null {
  const map = getAgentMap();
  if (!map) return null;
  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  const scale = container.clientWidth > 0 ? rect.width / container.clientWidth : 1;
  const { x, y } = map.project(lngLat);
  if (x < 0 || y < 0 || x > container.clientWidth || y > container.clientHeight) return null;
  return { x: rect.left + x * scale, y: rect.top + y * scale };
}

/**
 * A click on the map while the panel is picking: the cursor goes to where the
 * point is and presses, then the pick lands as MapViewport's click handler
 * lands it (the picked point, picking over). There is no map click to drive
 * in the app's own events, so the handler's two calls are made directly.
 */
async function clickMapAt(ctx: DemoContext, lngLat: Point): Promise<boolean> {
  const picker = useProjectStore.getState().activePicker;
  if (!picker) return false;
  const spot = screenPointOf(lngLat);
  if (spot) {
    await ctx.cursor.travel(spot, travelDuration(ctx.cursor.position, spot, ctx.timing.move), ctx.clock, 'pointer');
    ctx.cursor.setPressed(true);
    await pause(ctx, ctx.timing.afterClick * 0.3);
    ctx.cursor.setPressed(false);
  }
  picker.onPick({ lngLat, name: `${lngLat[0].toFixed(5)}, ${lngLat[1].toFixed(5)}` });
  useProjectStore.getState().stopPicking();
  await pause(ctx, ctx.timing.afterClick);
  return true;
}

/** Walk: Smooth Curve if it is off, then "Add point on map" and a click for each point, then Insert. */
async function addWalkRoute(ctx: DemoContext, item: RouteItem, calc: WalkCalc): Promise<string | null> {
  const L = currentLocators();
  const before = new Set(routeIds());
  if (!(await openRoutePanel(ctx, L)) || !(await chooseMode(ctx, L, 'walk'))) return null;
  if (!calc.curved && !(await click(ctx, L.walkSmoothSwitch))) return null;
  // The points are clicked on the map, so the map shows them first.
  await frameOnMap(ctx, item.geojson);
  for (const point of calc.points) {
    if (!(await click(ctx, L.walkAddPointButton)) || !(await clickMapAt(ctx, point))) return null;
  }
  if (!(await click(ctx, L.routeInsertButton))) return null;
  return addedRoutes(before)[0] ?? null;
}

/**
 * An imported route file. The app's import button opens the system file
 * dialog, which there is no driving: the entry is clicked (with the file
 * chooser held back) and what the toolbar's import handler makes from the
 * chosen file is added here, as an imported route with the file's geometry.
 * The handler's switching terrain and buildings off is left out: the run's
 * settings step has set them for the file.
 */
async function importRoute(ctx: DemoContext, item: RouteItem): Promise<string | null> {
  const L = currentLocators();
  if (!(await openRoutePanel(ctx, L))) return null;
  const holdChooser = (e: Event) => {
    if ((e.target as Element | null)?.matches?.('input[type="file"]')) e.preventDefault();
  };
  document.addEventListener('click', holdChooser, true);
  try {
    if (!(await click(ctx, L.routeImportButton))) return null;
  } finally {
    document.removeEventListener('click', holdChooser, true);
  }
  const store = useProjectStore.getState();
  const imported = createImportedRouteItem({ name: item.name, geojson: item.geojson, startTime: store.playheadTime });
  store.addItem(imported);
  store.selectItem(imported.id);
  closeRoutePanel(L);
  await frameOnMap(ctx, item.geojson);
  return imported.id;
}

// --- the inspector ------------------------------------------------------------------

/** The route's name in the panel's header. */
async function showName(ctx: DemoContext, name: string): Promise<EditOutcome> {
  return (await type(ctx, currentLocators().routeNameField, name)) ? 'shown' : 'written';
}

/**
 * A slider that runs over ln(value) (the marker's size, the follow distance):
 * its thumb is dragged to where the value sits. The arrow keys would stick on
 * it, because the slider rounds each value and Radix steps from the rounded
 * one. The value lands within a pixel of the target.
 */
async function dragLogSlider(ctx: DemoContext, target: Locator, value: number): Promise<boolean> {
  const thumb = await find(ctx, { ...target, role: 'slider' });
  const root = thumb?.closest('[data-slot="slider"]');
  if (!thumb || !root) return false;
  const min = Number(thumb.getAttribute('aria-valuemin'));
  const max = Number(thumb.getAttribute('aria-valuemax'));
  const rect = root.getBoundingClientRect();
  const along = Math.min(1, Math.max(0, (Math.log(value) - min) / (max - min)));
  beginGesture();
  try {
    return await drag(ctx, thumb, { x: rect.left + rect.width * along, y: rect.top + rect.height / 2 });
  } finally {
    endGesture();
  }
}

/** The marker's size is a log slider. */
async function showMarkerSize(ctx: DemoContext, edit: FieldEdit, live: () => RouteItem | null, target: RouteItem): Promise<EditOutcome> {
  const item = live();
  const spec = ROUTE_FIELDS.fields[edit.path];
  if (!item || !spec.shown?.(item, target)) return 'written';
  const section = await openSection(ctx, 'route', spec.section);
  if (!section) return 'written';
  const ok = await dragLogSlider(ctx, { label: spec.label, within: section }, Number(edit.value));
  if (ok) await pause(ctx, ctx.timing.inspectorEdit * 0.3);
  return ok ? 'shown' : 'written';
}

/** The marker's model, when the project has more than one to ride. */
async function showMarkerModel(ctx: DemoContext, edit: FieldEdit, live: () => RouteItem | null): Promise<EditOutcome> {
  const item = live();
  const fileName = useProjectStore.getState().models[String(edit.value)]?.fileName;
  if (!item || item.calculation?.vehicle?.type !== 'custom' || !fileName) return 'written';
  const section = await openSection(ctx, 'route', 'marker');
  if (!section) return 'written';
  return (await selectOption(ctx, { label: 'Model', role: 'combobox', within: section }, fileName)) ? 'shown' : 'written';
}

interface CamSlider {
  key: 'pitch' | 'smoothing' | 'distance' | 'zoom' | 'lookAhead' | 'dynamics' | 'orbit' | 'intro' | 'outro';
  label: string;
  /** What the panel shows for a field the config leaves out. */
  fallback: number;
  log?: boolean;
}

/** The Follow camera panel's sliders, top to bottom (a view shows only its own). */
const CAM_SLIDERS: CamSlider[] = [
  { key: 'pitch', label: FOLLOW_CAMERA_SLIDERS.pitch.label, fallback: 0 },
  { key: 'smoothing', label: FOLLOW_CAMERA_SLIDERS.smoothing.label, fallback: 0 },
  { key: 'distance', label: FOLLOW_CAMERA_SLIDERS.distance.label, fallback: 0, log: true },
  { key: 'zoom', label: FOLLOW_CAMERA_SLIDERS.zoom.label, fallback: 0 },
  { key: 'lookAhead', label: FOLLOW_CAMERA_SLIDERS.lookAhead.label, fallback: 0 },
  { key: 'dynamics', label: FOLLOW_CAMERA_SLIDERS.dynamics.label, fallback: 0.5 },
  { key: 'orbit', label: FOLLOW_CAMERA_SLIDERS.orbit.label, fallback: 0 },
  { key: 'intro', label: FOLLOW_CAMERA_SLIDERS.intro.label, fallback: 0 },
  { key: 'outro', label: FOLLOW_CAMERA_SLIDERS.outro.label, fallback: 0 },
];

/**
 * The Follow camera: the switch, Edit camera, then the panel's view cards,
 * preset and sliders, then back to the route. Fields it has no control for
 * (the camera's easing) and a switch the store refuses (another route follows
 * the camera then) are left to the final write.
 */
async function showFollowCamera(ctx: DemoContext, id: string, goal: AutoCamConfig): Promise<EditOutcome> {
  const L = currentLocators();
  const config = () => liveRoute(id)?.autoCam;
  if (!goal.enabled) return 'written';
  if (!config()?.enabled) {
    const section = await openSection(ctx, 'route', 'camera');
    if (!section || !(await click(ctx, { label: ROUTE_TERMS.followCamera, role: 'switch', within: section }))) return 'written';
  }
  if (!config()?.enabled) return 'written';

  if (!(await click(ctx, { role: 'button', name: FOLLOW_CAMERA_TERMS.editCamera }))) return 'written';
  const panelOpen = await find(ctx, { role: 'button', name: FOLLOW_CAMERA_TERMS.backToRoute }, { timeout: 2000 });
  if (!panelOpen) return 'written';

  if (config()?.mode !== goal.mode) {
    const view = goal.mode === 'cinematic' ? FOLLOW_CAMERA_TERMS.followView : FOLLOW_CAMERA_TERMS.navigationView;
    await click(ctx, { role: 'button', name: new RegExp(`^${view.title}`) });
  }
  // A preset sets several sliders at once, so it goes before them.
  if (goal.preset && config()?.preset !== goal.preset && goal.mode === 'cinematic') {
    const presets = await openSection(ctx, 'autocam', 'presets');
    if (presets) await click(ctx, { role: 'button', name: new RegExp(`^${AUTO_CAM_PRESETS[goal.preset].label}`), within: presets });
  }
  for (const slider of CAM_SLIDERS) {
    ctx.clock.check();
    const want = goal[slider.key];
    const now = config()?.[slider.key] ?? slider.fallback;
    if (want === undefined || Math.abs(now - want) < 1e-9) continue;
    // A view without this slider (distance is Follow view's, zoom and look ahead Navigation's) is not on screen.
    if (!query({ label: slider.label, role: 'slider' })) continue;
    if (slider.log) await dragLogSlider(ctx, { label: slider.label }, want);
    else await setSlider(ctx, { label: slider.label, role: 'slider' }, want);
  }
  await click(ctx, { role: 'button', name: FOLLOW_CAMERA_TERMS.backToRoute });
  return 'shown';
}

/** Shows one edit on screen: the route's own controls where they differ from the table's. */
async function showRouteEdit(ctx: DemoContext, edit: FieldEdit, live: () => RouteItem | null, target: RouteItem, file: Project): Promise<void> {
  const item = live();
  if (!item || deepEqual(getPath(item, edit.path), edit.value)) return;
  if (edit.path === 'calculation.vehicle.type' && edit.value === 'custom') holdMarkerModel(target, file);
  switch (edit.path) {
    case 'name':
      await showName(ctx, String(edit.value));
      return;
    case 'calculation.vehicle.scale':
      await showMarkerSize(ctx, edit, live, target);
      return;
    case 'calculation.vehicle.modelId':
      await showMarkerModel(ctx, edit, live);
      return;
    case 'autoCam':
      if (target.autoCam) await showFollowCamera(ctx, item.id, target.autoCam);
      return;
    default: {
      const outcome = await showEdit(ctx, ROUTE_FIELDS, edit, live, target);
      // The walk's curvature edits the path draft: Apply makes it the route's.
      if (outcome === 'shown' && edit.path === 'calculation.sharpness') {
        await click(ctx, { role: 'button', name: ROUTE_PATH_TERMS.apply, within: currentLocators().inspectorSection('route', 'path') });
      }
    }
  }
}

/**
 * A marker that rides an imported .glb needs the model in the project when
 * its card is clicked (with none there, the card opens a file dialog). The
 * model's own step comes later; this is the project holding it already, which
 * the step's final write sets anyway. An edit prunes models no item uses, so
 * it is held just before the card.
 */
function holdMarkerModel(target: RouteItem, file: Project): void {
  const vehicle = target.calculation?.vehicle;
  const asset = vehicle?.type === 'custom' ? file.models[vehicle.modelId] : undefined;
  if (!asset || useProjectStore.getState().models[asset.id]) return;
  withoutHistory(() => useProjectStore.setState((s) => ({ models: { ...s.models, [asset.id]: asset } })));
}

/** The route a hub and spoke list already made for this file route (an earlier step made them all). */
function pendingSpoke(target: RouteItem, file: Project): string | null {
  const calc = target.calculation;
  if (!calc || calc.mode === 'walk') return null;
  return routeIds().find((id) => {
    const made = liveRoute(id)?.calculation;
    return !file.items[id] && made && made.mode !== 'walk' && samePoint(made.startPoint, calc.startPoint) && samePoint(made.endPoint, calc.endPoint);
  }) ?? null;
}

/** Makes the route on screen: the hub and spoke list, the walk, the imported file or the two places. Null when it could not. */
async function addRouteOnScreen(ctx: DemoContext, target: RouteItem, file: Project): Promise<string | null> {
  const calc = target.calculation;
  if (!calc || (calc.mode !== 'walk' && !hasPlacedEndpoints(calc))) return importRoute(ctx, target);
  if (calc.mode === 'walk') return addWalkRoute(ctx, target, calc);

  const plan = hubPlanFor(file, target.id);
  if (plan) {
    // The first route of a list makes all of them; the later steps edit the ones it made.
    if (plan.ids[0] !== target.id) return pendingSpoke(target, file) ?? addEndpointRoute(ctx, target, calc);
    const made = await addHubRoutes(ctx, plan, file);
    return made[0] ?? null;
  }
  return addEndpointRoute(ctx, target, calc);
}

export async function runRoute(ctx: DemoContext, step: ItemStep, file: Project): Promise<void> {
  const L = currentLocators();
  const target = file.items[step.itemId];
  if (target?.kind !== 'route') {
    commitStep(step, file);
    return;
  }
  const created = await addRouteOnScreen(ctx, target, file);
  if (!created) {
    warn(`route ${target.name}: written directly`);
    closeRoutePanel(L);
  } else {
    // A list made all its routes at once; this step edits its own.
    if (useProjectStore.getState().selectedItemId !== created) withoutHistory(() => useProjectStore.getState().selectItem(created));
    await pause(ctx, ctx.timing.betweenSteps * 0.4);
    const live = () => liveRoute(created);
    for (const edit of routeEdits(live() ?? target, target)) {
      ctx.clock.check();
      if (step.timing && isTimingEdit(edit)) continue;
      await showRouteEdit(ctx, edit, live, target, file);
    }
  }
  commitStep(step, file, { replace: created ?? undefined });
  if (created) withoutHistory(() => useProjectStore.getState().selectItem(step.itemId));
}
