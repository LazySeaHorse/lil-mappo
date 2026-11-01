import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import {
  createBoundaryItem,
  createCalloutItem,
  createEndpointRouteItem,
  createImportedRouteItem,
  createModelItem,
  createWalkRouteItem,
} from '@/store/itemFactories';
import type { BoundaryItem, CalloutItem, ModelItem, Project, RouteItem, TimelineItem } from '@/store/types';
import type { CustomMapStyle } from '@/customMapStyles/model';
import { startingProject } from './startState';

/**
 * The run's script, worked out from the file alone (pure): what to show, in
 * the order a person would build the project. Each step has a final write
 * (`applyStep`): the project fields that step leaves exactly as the file has
 * them, so whatever the UI flow did on screen, the run ends on the file.
 */

/** One field to change: a dot path into the item or project, and the file's value. */
export interface FieldEdit {
  path: string;
  value: unknown;
}

export type ItemStepKind = 'boundary' | 'route' | 'callout' | 'model';

/** When an item shows. The item steps leave the timing the UI gave a new item; the timeline step moves it to the file's. */
export interface ItemTiming {
  startTime: number;
  endTime: number;
}

/** Items that sit on the timeline as a clip (the camera track holds views, not a clip). */
export const hasTiming = (item: TimelineItem): item is Extract<TimelineItem, ItemTiming> => 'startTime' in item && 'endTime' in item;

export type DemoStep =
  | { kind: 'map-style'; label: string; mapStyle: string; customStyle: CustomMapStyle | null }
  | { kind: 'settings'; label: string; edits: FieldEdit[] }
  | { kind: 'item'; itemKind: ItemStepKind; itemId: string; label: string; edits: FieldEdit[]; timing?: ItemTiming }
  | { kind: 'timeline'; label: string }
  | { kind: 'camera'; label: string; keyframeIds: string[] }
  | { kind: 'play'; label: string }
  | { kind: 'export'; label: string };

// --- comparing ------------------------------------------------------------------

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) if (!deepEqual(a[key], b[key])) return false;
    return true;
  }
  return false;
}

/**
 * The leaf fields where `target` differs from `base`, as dot paths. Objects are
 * walked into; arrays, nulls and values are leaves. `skip` paths (and anything
 * under them) are left out.
 */
export function diffLeaves(base: unknown, target: unknown, skip: readonly string[] = [], prefix = ''): FieldEdit[] {
  if (skip.includes(prefix)) return [];
  if (isPlainObject(base) && isPlainObject(target)) {
    const keys = [...new Set([...Object.keys(base), ...Object.keys(target)])];
    return keys.flatMap((key) => diffLeaves(base[key], target[key], skip, prefix ? `${prefix}.${key}` : key));
  }
  return deepEqual(base, target) ? [] : [{ path: prefix, value: target }];
}

/** `edits` sorted by `order` (a path's place, or its parent's); unlisted paths keep their order at the end. */
export function orderEdits(edits: FieldEdit[], order: readonly string[]): FieldEdit[] {
  const rank = (path: string) => {
    for (let p = path; p; p = p.includes('.') ? p.slice(0, p.lastIndexOf('.')) : '') {
      const i = order.indexOf(p);
      if (i >= 0) return i;
    }
    return order.length;
  };
  return edits.map((edit, i) => ({ edit, i })).sort((a, b) => rank(a.edit.path) - rank(b.edit.path) || a.i - b.i).map(({ edit }) => edit);
}

/** A copy of `obj` with the value at a dot path set (objects on the way are copied, missing ones made). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const source = (isPlainObject(obj) ? obj : {}) as Record<string, unknown>;
  const next = rest.length ? setPath(source[head], rest.join('.'), value) : value;
  const copy = { ...source };
  if (next === undefined) delete copy[head];
  else copy[head] = next;
  return copy as T;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (isPlainObject(value) ? value[key] : undefined), obj);
}

// --- items ----------------------------------------------------------------------

/** Never edited on screen: identity, and geometry that comes from the search or the planner. */
const ITEM_SKIP = ['id', 'kind', 'geojson'];

/**
 * The boundary inspector's fields in the order they sit on screen, top to
 * bottom; style before timing. A fill colour is set while the colour fill
 * still shows it, before a switch to the flag; the end of a later span is set
 * first (see `orderSpan`).
 */
export const BOUNDARY_FIELD_ORDER = [
  'placeName',
  'style.strokeColor',
  'style.strokeWidth',
  'style.glow',
  'style.fillColor',
  'style.fillMode',
  'style.flagCode',
  'style.fillOpacity',
  'style.fillUnderRoads',
  'style.maskOutside',
  'style.maskColor',
  'style.maskOpacity',
  'style.animationStyle',
  'style.animateStroke',
  'style.traceLength',
  'startTime',
  'endTime',
  'easing',
  'exitAnimation',
] as const;

/**
 * Start before end, unless the new start is at or past the current end: the
 * timing panel keeps the end when the start changes and refuses a start past
 * it, so then the end moves first.
 */
function orderSpan(edits: FieldEdit[], base: { startTime: number; endTime: number }): FieldEdit[] {
  const start = edits.find((e) => e.path === 'startTime');
  const end = edits.find((e) => e.path === 'endTime');
  if (!start || !end || (start.value as number) < base.endTime) return edits;
  const i = edits.indexOf(start);
  const j = edits.indexOf(end);
  const out = [...edits];
  out[i] = end;
  out[j] = start;
  return out;
}

/** The boundary the Add Boundary panel makes for this file boundary's search result. */
export function boundaryBaseline(item: BoundaryItem): BoundaryItem {
  return createBoundaryItem({
    id: item.id,
    placeName: item.placeName,
    geojson: item.geojson,
    startTime: 0,
    countryCode: item.style.flagCode,
  });
}

/** The inspector edits that turn `base` (what the UI made) into the file's boundary, in screen order. */
export function boundaryEdits(base: BoundaryItem, target: BoundaryItem): FieldEdit[] {
  return orderSpan(orderEdits(diffLeaves(base, target, ITEM_SKIP), BOUNDARY_FIELD_ORDER), base);
}

function routeBaseline(item: RouteItem): RouteItem {
  const calc = item.calculation;
  if (calc?.mode === 'walk') {
    return createWalkRouteItem({ id: item.id, points: calc.points, curved: calc.curved, name: item.name, startTime: 0 });
  }
  if (calc) {
    return createEndpointRouteItem({
      id: item.id,
      mode: calc.mode,
      geojson: item.geojson,
      start: calc.startPoint,
      end: calc.endPoint,
      startName: calc.startName,
      endName: calc.endName,
      name: item.name,
      startTime: 0,
      pro: true,
    });
  }
  return createImportedRouteItem({ id: item.id, name: item.name, geojson: item.geojson, startTime: 0 });
}

function calloutBaseline(item: CalloutItem): CalloutItem | null {
  const lngLat = item.binding.kind === 'geographic' ? item.binding.lngLat : ([0, 0] as [number, number]);
  return createCalloutItem({
    id: item.id,
    styleId: item.styleId,
    content: item.content,
    lngLat,
    startTime: 0,
    linkTitleToLocation: item.linkTitleToLocation,
    locationName: item.locationName,
    referenceZoom: item.referenceZoom,
  });
}

function modelBaseline(item: ModelItem): ModelItem {
  return { ...createModelItem({ assetId: item.assetId, name: item.name, position: item.position, startTime: 0 }), id: item.id };
}

/** What the UI makes for this item kind when it is added at the start (null for kinds without a clip). */
function itemBaseline(item: TimelineItem): TimelineItem | null {
  switch (item.kind) {
    case 'boundary': return boundaryBaseline(item);
    case 'route': return routeBaseline(item);
    case 'callout': return calloutBaseline(item);
    case 'model': return modelBaseline(item);
    default: return null;
  }
}

/** The timing the UI gives this item when it is added: the item steps leave it, the timeline step changes it. */
export function baselineTiming(item: TimelineItem): ItemTiming | undefined {
  const base = itemBaseline(item);
  return base && hasTiming(base) ? { startTime: base.startTime, endTime: base.endTime } : undefined;
}

/** An edit of the clip's span, which the timeline step makes by dragging. */
export const isTimingEdit = (edit: FieldEdit) => edit.path === 'startTime' || edit.path === 'endTime';

/** Field edits for an item kind not driven on screen yet (routes, callouts, models): what differs from Add. */
function genericEdits(item: TimelineItem): FieldEdit[] {
  let base: TimelineItem | null = null;
  if (item.kind === 'route') base = routeBaseline(item);
  else if (item.kind === 'callout') base = calloutBaseline(item);
  else if (item.kind === 'model') base = modelBaseline(item);
  if (!base) return [];
  const edits = diffLeaves(base, item, ITEM_SKIP);
  return 'startTime' in base ? orderSpan(edits, base) : edits;
}

function itemLabel(item: TimelineItem): string {
  switch (item.kind) {
    case 'boundary': return `Boundary: ${item.placeName}`;
    case 'route': return `Route: ${item.name}`;
    case 'callout': return `Callout: ${item.content.title || item.styleId}`;
    case 'model': return `3D model: ${item.name}`;
    default: return item.kind;
  }
}

// --- project --------------------------------------------------------------------

/**
 * Project fields edited in the settings step, in the order they are reached:
 * the toolbar's terrain and buildings toggles, then the settings panel top to
 * bottom. The map style has its own step; items, identity and the video shape
 * are set elsewhere.
 */
export const SETTINGS_FIELD_ORDER = [
  'terrainEnabled',
  'buildingsEnabled',
  'name',
  'duration',
  'fps',
  'aspectRatio',
  'isVertical',
  'exportResolution',
  'resolution',
  'projection',
  'lightPreset',
  'terrainExaggeration',
  'starIntensity',
  'fogColor',
  'labelVisibility',
  'show3dLandmarks',
  'show3dTrees',
  'show3dFacades',
  'customMapStyleUrl',
  'customMapStyleLabel',
] as const;

const NOT_SETTINGS = ['id', 'mapCenter', 'mapStyle', 'customStyle', 'items', 'itemOrder', 'models'];

function settingsEdits(start: Project, file: Project): FieldEdit[] {
  const pick = (project: Project) => Object.fromEntries(
    Object.entries(project).filter(([key]) => !NOT_SETTINGS.includes(key)),
  );
  return orderEdits(diffLeaves(pick(start), pick(file)), SETTINGS_FIELD_ORDER);
}

const ITEM_STEP_ORDER: ItemStepKind[] = ['boundary', 'route', 'callout', 'model'];

/** The steps that build `file` from its starting project, in order. */
export function planDemo(file: Project): DemoStep[] {
  const start = startingProject(file);
  const steps: DemoStep[] = [];

  if (file.mapStyle !== start.mapStyle || !deepEqual(file.customStyle, start.customStyle)) {
    steps.push({
      kind: 'map-style',
      label: `Map style: ${file.customStyle?.name ?? file.mapStyle}`,
      mapStyle: file.mapStyle,
      customStyle: file.customStyle,
    });
  }

  const settings = settingsEdits(start, file);
  if (settings.length) steps.push({ kind: 'settings', label: 'Project settings', edits: settings });

  for (const kind of ITEM_STEP_ORDER) {
    for (const id of file.itemOrder) {
      const item = file.items[id];
      if (!item || item.kind !== kind) continue;
      const timing = baselineTiming(item);
      const all = item.kind === 'boundary' ? boundaryEdits(boundaryBaseline(item), item) : genericEdits(item);
      // The timeline step sets the timing, by dragging the clip.
      const edits = timing ? all.filter((edit) => !isTimingEdit(edit)) : all;
      steps.push({ kind: 'item', itemKind: kind, itemId: id, label: itemLabel(item), edits, timing });
    }
  }

  steps.push({ kind: 'timeline', label: 'Timeline' });

  const camera = file.items[CAMERA_TRACK_ID];
  if (camera?.kind === 'camera' && camera.keyframes.length) {
    steps.push({ kind: 'camera', label: 'Camera views', keyframeIds: camera.keyframes.map((k) => k.id) });
  }

  steps.push({ kind: 'play', label: 'Play' }, { kind: 'export', label: 'Export' });
  return steps;
}

// --- final writes ---------------------------------------------------------------

/** `ids` in the file's order; ids the file does not have go last, as they were. */
export function orderLikeFile(ids: string[], fileOrder: string[]): string[] {
  const unique = [...new Set(ids)];
  const rank = (id: string) => {
    const i = fileOrder.indexOf(id);
    return i < 0 ? fileOrder.length : i;
  };
  return unique.map((id, i) => ({ id, i })).sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i).map(({ id }) => id);
}

/** Model assets an item draws with: a placed model's, or a route marker's custom model. */
function assetsOf(item: TimelineItem): string[] {
  if (item.kind === 'model') return [item.assetId];
  if (item.kind === 'route' && item.calculation?.vehicle?.type === 'custom') return [item.calculation.vehicle.modelId];
  return [];
}

/**
 * The project after `step`, with the fields that step owns exactly as in
 * `file`. Pure: the runner writes the result to the store in one step.
 */
export function applyStep(project: Project, step: DemoStep, file: Project): Project {
  switch (step.kind) {
    case 'map-style':
      return { ...project, mapStyle: step.mapStyle, customStyle: step.customStyle };
    case 'settings':
      return step.edits.reduce((p, edit) => setPath(p, edit.path, edit.value), project);
    case 'item': {
      const item = file.items[step.itemId];
      if (!item) return project;
      const models = { ...project.models };
      for (const assetId of assetsOf(item)) if (file.models[assetId]) models[assetId] = file.models[assetId];
      const placed = step.timing && hasTiming(item) ? { ...item, ...step.timing } : item;
      return {
        ...project,
        items: { ...project.items, [item.id]: placed },
        itemOrder: orderLikeFile([...project.itemOrder, item.id], file.itemOrder),
        models,
      };
    }
    case 'timeline': {
      // Every clip on the file's timing, the lane order, and model assets no item uses (kept by the file all the same).
      const items = { ...project.items };
      for (const [id, target] of Object.entries(file.items)) {
        const item = items[id];
        if (item && hasTiming(item) && hasTiming(target) && (item.startTime !== target.startTime || item.endTime !== target.endTime)) {
          items[id] = { ...item, startTime: target.startTime, endTime: target.endTime };
        }
      }
      return { ...project, items, itemOrder: orderLikeFile(project.itemOrder, file.itemOrder), models: { ...file.models, ...project.models } };
    }
    case 'camera':
      return file.items[CAMERA_TRACK_ID] ? { ...project, items: { ...project.items, [CAMERA_TRACK_ID]: file.items[CAMERA_TRACK_ID] } } : project;
    case 'play':
      return project;
    case 'export':
      // The search bias centre drifts as the map moves during the run; the file's goes back.
      return { ...project, mapCenter: file.mapCenter };
  }
}
