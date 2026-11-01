import { getMapStyleDef } from '@/config/mapbox';
import { extractLineCoords } from '@/engine/geoUtils';
import { DEFAULT_CALLOUT_STYLE_ID, defaultEndpointRouteName } from '@/store/itemFactories';
import type { BoundaryItem, CalloutItem, ModelItem, Project, RouteItem } from '@/store/types';
import type { DemoStep, FieldEdit } from '../plan';

/**
 * The mock AI run's script, worked out from the plan alone (pure): the turns a
 * coding agent would take to build the project through the app's tools. Each
 * item becomes a line of text, a thinking beat and one or two tool calls whose
 * inputs are what an agent would send (names and places, not ids from the file);
 * a `commit` then swaps in the file's exact item. `agent.ts` plays the script.
 */

/** In a tool input, stands for the id of the item or keyframe the last call created. */
export const CREATED = '$created';

/** What the frame's fetch mocks must answer before a tool call (geocoding, outline search, directions). */
export type AiMock =
  | { kind: 'boundary'; query: string; displayName: string; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; countryCode: string | null }
  | { kind: 'place'; query: string; name: string; coordinates: [number, number] }
  | { kind: 'route'; start: [number, number]; end: [number, number]; geometry: GeoJSON.LineString };

export type AiAction =
  /** The plan step now under way (the widget's progress). */
  | { kind: 'progress'; index: number; label: string }
  | { kind: 'text'; text: string }
  /** Claude is thinking for `ms` of clock time. */
  | { kind: 'think'; ms: number }
  | { kind: 'tool'; name: string; input: Record<string, unknown>; mocks?: AiMock[] }
  /** The step's final write, tagged as the AI's: the file's item replaces the one the tools made. */
  | { kind: 'commit'; step: DemoStep }
  /** A 3D model the user placed in the editor (no tool can): written as the user's, over `file`. */
  | { kind: 'place'; step: DemoStep; file: Project }
  /** The end of the AI turn: the transcript's spinner stops. */
  | { kind: 'done' }
  /** Plays the project from the start, then waits for it to end. */
  | { kind: 'play' }
  /** Writes whatever of these steps the tools did not already leave exactly as the file has it. */
  | { kind: 'finalize'; steps: DemoStep[] };

export interface AiScriptOptions {
  /** Whether a model asset's .glb is in memory; a model that is not cannot be shown, so it is skipped. */
  modelReady?: (assetId: string) => boolean;
}

// --- vocabulary -------------------------------------------------------------------

/** Keys the tools accept, per kind (the schemas in src/agent/tools/schemas.ts; a test keeps them equal). */
export const ROUTE_STYLE_KEYS = ['color', 'width', 'glow', 'glowWidth', 'dashPattern', 'animationType', 'cometTrailLength'] as const;
export const BOUNDARY_STYLE_KEYS = [
  'strokeColor', 'fillColor', 'strokeWidth', 'glow', 'fillOpacity', 'animateStroke', 'animationStyle', 'traceLength',
  'maskOutside', 'maskColor', 'maskOpacity', 'fillMode', 'fillUnderRoads', 'flagCode',
] as const;
const VEHICLE_KEYS = ['enabled', 'type', 'scale'] as const;
/** update_project_settings fields that are plain project fields. */
export const SETTINGS_TOOL_KEYS = [
  'name', 'duration', 'fps', 'aspectRatio', 'exportResolution', 'isVertical', 'projection', 'lightPreset', 'starIntensity',
  'fogColor', 'terrainExaggeration', 'terrainEnabled', 'buildingsEnabled', 'show3dLandmarks', 'show3dTrees', 'show3dFacades',
] as const;

const SETTING_WORDS: Record<string, string> = {
  terrainEnabled: 'terrain',
  buildingsEnabled: 'buildings',
  labelVisibility: 'labels',
  exportResolution: 'resolution',
  isVertical: 'orientation',
  aspectRatio: 'aspect ratio',
  lightPreset: 'lighting',
  terrainExaggeration: 'terrain height',
  starIntensity: 'stars',
  fogColor: 'fog',
  show3dLandmarks: '3D landmarks',
  show3dTrees: '3D trees',
  show3dFacades: '3D facades',
};

/** Thinking beats, 0.6 to 2 s, cycled so a run's rhythm varies but never changes between runs. */
const THINK_MS = [900, 1500, 700, 1200, 2000, 800, 1700, 600];

const SECOND_BOUNDARY = [(n: string) => `Now the ${n} outline.`, (n: string) => `Next, ${n}.`, (n: string) => `Adding ${n} as well.`];

// --- helpers ----------------------------------------------------------------------

const join = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0] ?? '');
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** `edits` under a path prefix, as `{ key: value }` for the keys the tool accepts. */
function pickEdits(edits: FieldEdit[], prefix: string, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const edit of edits) {
    if (!edit.path.startsWith(`${prefix}.`)) continue;
    const key = edit.path.slice(prefix.length + 1);
    if (keys.includes(key)) out[key] = edit.value;
  }
  return out;
}

const hasEdit = (edits: FieldEdit[], path: string) => edits.some((e) => e.path === path || e.path.startsWith(`${path}.`));

const nonEmpty = (obj: Record<string, unknown>) => (Object.keys(obj).length ? obj : undefined);

// --- items ------------------------------------------------------------------------

type ItemStep = Extract<DemoStep, { kind: 'item' }>;

function boundaryActions(item: BoundaryItem, step: ItemStep, first: boolean, n: number): AiAction[] {
  const geometry = item.geojson;
  if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') return [{ kind: 'commit', step }];
  const text = first ? `Adding the ${item.placeName} outline first.` : SECOND_BOUNDARY[(n - 1) % SECOND_BOUNDARY.length](item.placeName);
  const patch = {
    ...(hasEdit(step.edits, 'easing') && { easing: item.easing }),
    ...(hasEdit(step.edits, 'exitAnimation') && { exitAnimation: item.exitAnimation }),
    ...(hasEdit(step.edits, 'placeName') && { placeName: item.placeName }),
  };
  return [
    { kind: 'text', text },
    {
      kind: 'tool',
      name: 'add_boundary',
      input: {
        query: item.placeName,
        detail: 'detailed',
        startTime: item.startTime,
        endTime: item.endTime,
        ...(nonEmpty(pickEdits(step.edits, 'style', BOUNDARY_STYLE_KEYS)) && { style: pickEdits(step.edits, 'style', BOUNDARY_STYLE_KEYS) }),
      },
      mocks: [{ kind: 'boundary', query: item.placeName, displayName: item.placeName, geometry, countryCode: item.style.flagCode }],
    },
    ...(Object.keys(patch).length ? [{ kind: 'tool' as const, name: 'update_item', input: { id: CREATED, patch } }] : []),
    { kind: 'commit', step },
  ];
}

/** Up to `max` points along a route's geometry, always including both ends. */
function samplePoints(item: RouteItem, max: number): [number, number][] {
  const coords = extractLineCoords(item.geojson).map((c) => [c[0], c[1]] as [number, number]);
  if (coords.length <= max) return coords;
  return Array.from({ length: max }, (_, i) => coords[Math.round((i * (coords.length - 1)) / (max - 1))]);
}

function routeActions(item: RouteItem, step: ItemStep, first: boolean): AiAction[] {
  const calc = item.calculation;
  const lead = first ? 'Now the routes. ' : '';
  const style = nonEmpty(pickEdits(step.edits, 'style', ROUTE_STYLE_KEYS));
  const timing = { startTime: item.startTime, endTime: item.endTime };
  const mocks: AiMock[] = [];
  let text: string;
  let input: Record<string, unknown>;

  if (calc && calc.mode !== 'walk') {
    const places = ([[calc.startName, calc.startPoint], [calc.endName, calc.endPoint]] as const).map(([name, point]) => {
      if (!name) return point;
      mocks.push({ kind: 'place', query: name, name, coordinates: point });
      return name;
    });
    if (calc.mode === 'car') {
      const coords = extractLineCoords(item.geojson);
      if (coords.length >= 2) {
        mocks.push({ kind: 'route', start: calc.startPoint, end: calc.endPoint, geometry: { type: 'LineString', coordinates: coords } });
      }
    }
    const a = calc.startName || 'the start';
    const b = calc.endName || 'the end';
    text = calc.mode === 'car' ? `${lead}Adding the driving route from ${a} to ${b}.` : `${lead}Adding a flight from ${a} to ${b}.`;
    const picked = pickEdits(step.edits, 'calculation.vehicle', VEHICLE_KEYS);
    // A custom 3D model is picked in the editor; the tool knows dot, car and plane.
    if (picked.type === 'custom') delete picked.type;
    const vehicle = nonEmpty(picked);
    input = {
      mode: calc.mode,
      from: places[0],
      to: places[1],
      ...(item.name !== defaultEndpointRouteName(calc.mode, calc.startName, calc.endName) && { name: item.name }),
      ...timing,
      ...(style && { style }),
      ...(vehicle && { vehicle }),
    };
  } else {
    // A drawn path goes through its points; an imported track, which no tool can bring in, through a few of its own.
    const walk = calc?.mode === 'walk' ? calc : null;
    text = `${lead}${walk ? `Drawing the ${item.name} path.` : `Adding the ${item.name} route.`}`;
    input = {
      mode: 'walk',
      points: walk ? walk.points : samplePoints(item, 12),
      curved: walk ? walk.curved : false,
      name: item.name,
      ...timing,
      ...(style && { style }),
    };
  }

  const patch = {
    ...(hasEdit(step.edits, 'easing') && { easing: item.easing }),
    ...(hasEdit(step.edits, 'exitAnimation') && { exitAnimation: item.exitAnimation }),
  };
  return [
    { kind: 'text', text },
    { kind: 'tool', name: 'add_route', input, mocks },
    ...(Object.keys(patch).length ? [{ kind: 'tool' as const, name: 'update_item', input: { id: CREATED, patch } }] : []),
    { kind: 'commit', step },
  ];
}

function calloutActions(item: CalloutItem, step: ItemStep, first: boolean, fallbackLocation: [number, number]): AiAction[] {
  const geographic = item.binding.kind === 'geographic';
  const lngLat = item.binding.kind === 'geographic' ? item.binding.lngLat : fallbackLocation;
  const mocks: AiMock[] = [];
  let location: string | [number, number] = lngLat;
  if (item.locationName) {
    mocks.push({ kind: 'place', query: item.locationName, name: item.locationName, coordinates: lngLat });
    location = item.locationName;
  }
  const { title, subtitle, eyebrow, body, badge, metric } = item.content;
  const settingKeys = [...new Set(step.edits.filter((e) => e.path.startsWith('settings.')).map((e) => e.path.split('.')[1]))];
  const settings = Object.fromEntries(settingKeys.map((key) => [key, item.settings[key]]));
  const input = {
    title: title || item.locationName || 'Label',
    ...(subtitle && { subtitle }),
    ...(eyebrow && { eyebrow }),
    ...(body && { body }),
    ...(badge && { badge }),
    ...(metric && { metric }),
    location,
    ...(item.styleId !== DEFAULT_CALLOUT_STYLE_ID && { styleId: item.styleId }),
    startTime: item.startTime,
    endTime: item.endTime,
    ...(hasEdit(step.edits, 'anchor') && { anchor: item.anchor }),
    ...(geographic && hasEdit(step.edits, 'binding.altitude') && { altitude: item.binding.kind === 'geographic' ? item.binding.altitude : 0 }),
    ...(hasEdit(step.edits, 'scale') && { scale: item.scale }),
    ...(hasEdit(step.edits, 'sizeMode') && { sizeMode: item.sizeMode }),
    ...(nonEmpty(settings) && { settings }),
  };
  const patch = Object.fromEntries(
    (['opacity', 'offset', 'transition', 'connector'] as const).filter((key) => hasEdit(step.edits, key)).map((key) => [key, item[key]]),
  );
  return [
    { kind: 'text', text: `${first ? 'Now the callouts. ' : ''}Adding a callout for ${input.title}.` },
    { kind: 'tool', name: 'add_callout', input, mocks },
    ...(Object.keys(patch).length ? [{ kind: 'tool' as const, name: 'update_item', input: { id: CREATED, patch } }] : []),
    { kind: 'commit', step },
  ];
}

function modelActions(item: ModelItem, step: ItemStep, file: Project, first: boolean): AiAction[] {
  // No tool places a model; the user did, and the agent only times it.
  const placed: Project = { ...file, items: { ...file.items, [item.id]: { ...item, startTime: 0, endTime: file.duration } } };
  return [
    { kind: 'place', step, file: placed },
    { kind: 'text', text: `${first ? 'Now the 3D models. ' : ''}The ${item.name} model is already in the project, so I will just set when it shows.` },
    { kind: 'tool', name: 'update_item', input: { id: item.id, patch: { startTime: item.startTime, endTime: item.endTime } } },
    { kind: 'commit', step },
  ];
}

// --- the other steps --------------------------------------------------------------

function mapStyleActions(step: Extract<DemoStep, { kind: 'map-style' }>): AiAction[] {
  const label = getMapStyleDef(step.mapStyle)?.label ?? step.mapStyle;
  const custom = step.customStyle;
  if (!custom) {
    return [
      { kind: 'text', text: `Setting the map style to ${label}.` },
      { kind: 'tool', name: 'update_project_settings', input: { mapStyle: step.mapStyle } },
      { kind: 'commit', step },
    ];
  }
  return [
    { kind: 'text', text: `Making a custom map style called "${custom.name}" on the ${label} base.` },
    {
      kind: 'tool',
      name: 'set_custom_map_style',
      input: { name: custom.name, baseStyle: step.mapStyle, colors: custom.colors, ...(custom.theme !== 'default' && { theme: custom.theme }) },
    },
    { kind: 'commit', step },
  ];
}

function settingsActions(step: Extract<DemoStep, { kind: 'settings' }>): AiAction[] {
  const input: Record<string, unknown> = {};
  const labels: Record<string, boolean> = {};
  for (const edit of step.edits) {
    if ((SETTINGS_TOOL_KEYS as readonly string[]).includes(edit.path)) input[edit.path] = edit.value;
    else if (edit.path.startsWith('labelVisibility.')) labels[edit.path.slice('labelVisibility.'.length)] = edit.value as boolean;
  }
  if (Object.keys(labels).length) input.labelVisibility = labels;
  const fields = Object.keys(input).map((key) => SETTING_WORDS[key] ?? key);
  if (!fields.length) return [{ kind: 'commit', step }];
  return [
    { kind: 'text', text: `Updating the project settings: ${fields.length > 4 ? `${fields.slice(0, 4).join(', ')} and more` : join(fields)}.` },
    { kind: 'tool', name: 'update_project_settings', input },
    { kind: 'commit', step },
  ];
}

function cameraActions(step: Extract<DemoStep, { kind: 'camera' }>, file: Project): AiAction[] {
  const camera = file.items['camera-track'];
  const keyframes = camera?.kind === 'camera' ? [...camera.keyframes].sort((a, b) => a.time - b.time) : [];
  const actions: AiAction[] = [{ kind: 'text', text: `Now the camera: ${count(keyframes.length, 'view')} over the timeline.` }];
  for (const k of keyframes) {
    const { center, zoom, pitch, bearing } = k.camera;
    actions.push({
      kind: 'tool',
      name: 'add_camera_keyframe',
      input: {
        time: k.time,
        center,
        zoom,
        ...(pitch && { pitch }),
        ...(bearing && { bearing }),
        ...(k.easing !== 'easeInOutCubic' && { easing: k.easing }),
      },
    });
    if (k.followRoute) actions.push({ kind: 'tool', name: 'update_camera_keyframe', input: { id: CREATED, patch: { followRoute: k.followRoute } } });
  }
  actions.push({ kind: 'commit', step });
  return actions;
}

// --- the script -------------------------------------------------------------------

/** The whole run, in the plan's order; timeline drags and the export are not an agent's to do. */
export function buildAiScript(file: Project, steps: DemoStep[], { modelReady = () => true }: AiScriptOptions = {}): AiAction[] {
  const actions: AiAction[] = [];
  let beats = 0;
  const think = () => actions.push({ kind: 'think', ms: THINK_MS[beats++ % THINK_MS.length] });

  actions.push(
    { kind: 'think', ms: 1200 },
    { kind: 'text', text: 'I will start by reading the editor guide and the current project.' },
    { kind: 'tool', name: 'get_guide', input: {} },
    { kind: 'tool', name: 'get_project', input: {} },
  );

  const seen: Record<string, number> = {};
  const counts = { boundary: 0, route: 0, callout: 0, model: 0, view: 0 };
  const kept: DemoStep[] = [];
  const fallbackLocation: [number, number] = file.mapCenter;

  for (const [index, step] of steps.entries()) {
    if (step.kind === 'timeline' || step.kind === 'export' || step.kind === 'play') {
      kept.push(step);
      continue;
    }
    const item = step.kind === 'item' ? file.items[step.itemId] : null;
    if (item?.kind === 'model' && !modelReady(item.assetId)) continue;
    kept.push(step);

    actions.push({ kind: 'progress', index, label: step.label });
    think();
    const first = step.kind === 'item' ? (seen[step.itemKind] = (seen[step.itemKind] ?? 0) + 1) === 1 : true;
    switch (step.kind) {
      case 'map-style':
        actions.push(...mapStyleActions(step));
        break;
      case 'settings':
        actions.push(...settingsActions(step));
        break;
      case 'item':
        if (item?.kind === 'boundary') actions.push(...boundaryActions(item, step, first, counts.boundary++));
        if (item?.kind === 'route') {
          actions.push(...routeActions(item, step, first));
          counts.route++;
        }
        if (item?.kind === 'callout') {
          actions.push(...calloutActions(item, step, first, fallbackLocation));
          counts.callout++;
        }
        if (item?.kind === 'model') {
          actions.push(...modelActions(item, step, file, first));
          counts.model++;
        }
        break;
      case 'camera':
        actions.push(...cameraActions(step, file));
        counts.view = step.keyframeIds.length;
        break;
    }
  }

  const playIndex = steps.findIndex((s) => s.kind === 'play');
  think();
  actions.push({ kind: 'tool', name: 'get_project', input: {} });
  think();
  const parts = [
    counts.boundary && count(counts.boundary, 'boundary', 'boundaries'),
    counts.route && count(counts.route, 'route'),
    counts.callout && count(counts.callout, 'callout'),
    counts.model && count(counts.model, '3D model'),
    counts.view && count(counts.view, 'camera view'),
  ].filter((p): p is string => !!p);
  actions.push(
    { kind: 'text', text: `Done. "${file.name}" now has ${parts.length ? join(parts) : 'its settings in place'}. Playing it back from the start.` },
    { kind: 'done' },
  );
  if (playIndex >= 0) actions.push({ kind: 'progress', index: playIndex, label: steps[playIndex].label });
  actions.push({ kind: 'tool', name: 'set_playhead', input: { time: 0 } }, { kind: 'play' });
  actions.push({ kind: 'finalize', steps: kept.filter((s) => s.kind !== 'play') });
  return actions;
}
