import { MAP_COLOR_ROLE_IDS, type CustomMapStyle, type MapColorRole } from './model';

/**
 * How a custom style repaints a classic (non-Standard) style. Classic styles draw Mapbox
 * Streets vector tiles, so a layer's role comes from what it draws: its type and its
 * source layer (`water`, `road`, `place_label`...), and per feature from the tile's
 * `class` property (motorway, park, hospital...). Styles built on other data simply
 * have fewer layers that take a role.
 */

/** The part of a style layer the planner reads. */
export interface RecolorLayer {
  id: string;
  type: string;
  'source-layer'?: string;
  layout?: Record<string, unknown>;
}

/** Feature classes that get a role's colour. */
type ClassCase = readonly [classes: readonly string[], role: MapColorRole];

/**
 * One colour property of a layer. `role`: the whole property takes the role's colour.
 * `classes`: features of those classes take their role's colour; the others take the
 * `rest` role's colour, or keep the style's own colour when there is no rest role.
 */
export type RecolorTarget =
  | { property: string; role: MapColorRole }
  | { property: string; classes: readonly ClassCase[]; rest?: MapColorRole };

const ROAD_CLASSES: readonly ClassCase[] = [
  [['motorway', 'motorway_link'], 'motorways'],
  [['trunk', 'trunk_link'], 'trunks'],
  [[
    'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
    'street', 'street_limited', 'service', 'track', 'path', 'pedestrian', 'construction',
    'minor', 'major', 'link', 'turning_circle', 'turning_loop', 'mini_roundabout',
  ], 'roads'],
];

const LANDUSE_CLASSES: readonly ClassCase[] = [
  [['park', 'pitch', 'grass', 'wood', 'scrub', 'cemetery', 'golf_course'], 'greenspace'],
  [['commercial_area'], 'commercial'],
  [['industrial'], 'industrial'],
  [['school', 'college', 'university'], 'education'],
  [['hospital'], 'medical'],
];

const LANDCOVER_CLASSES: readonly ClassCase[] = [[['wood', 'scrub', 'grass'], 'greenspace']];

const PLACE_LABEL_LAYERS = new Set(['place_label', 'country_label', 'state_label']);
const ROAD_LABEL_LAYERS = new Set(['road', 'road_label', 'motorway_junction']);

/**
 * Layers drawn under another as its outline: road casings, the light band under borders.
 * They take the land colour, so they blend into the ground instead of keeping the old palette.
 */
const UNDERLAY_ID = /-(case|casing|bg)$/;

const COLOR_PROPERTY: Record<string, string> = {
  fill: 'fill-color',
  line: 'line-color',
  'fill-extrusion': 'fill-extrusion-color',
  circle: 'circle-color',
};

/** The colour properties of `layer` a custom style can repaint, and how. */
export function classicColorTargets(layer: RecolorLayer): RecolorTarget[] {
  if (layer.type === 'background') return [{ property: 'background-color', role: 'land' }];

  const sourceLayer = layer['source-layer'];
  if (!sourceLayer) return [];
  if (layer.type === 'symbol') return symbolTargets(layer, sourceLayer);

  const property = COLOR_PROPERTY[layer.type];
  if (!property) return [];
  const underlay = UNDERLAY_ID.test(layer.id);

  switch (sourceLayer) {
    case 'water':
    case 'waterway':
    case 'depth':
      return [{ property, role: 'water' }];
    case 'landcover':
      return [{ property, classes: LANDCOVER_CLASSES, rest: 'land' }];
    case 'landuse':
      return [{ property, classes: LANDUSE_CLASSES, rest: 'land' }];
    case 'landuse_overlay':
      return [{ property, classes: [[['national_park'], 'greenspace']] }];
    case 'structure':
      return [{ property, classes: [[['land'], 'land']] }];
    case 'building': {
      const targets: RecolorTarget[] = [{ property, role: 'buildings' }];
      if (layer.type === 'fill') targets.push({ property: 'fill-outline-color', role: 'buildings' });
      return targets;
    }
    case 'admin':
      return [{ property, role: underlay ? 'land' : 'adminBoundaries' }];
    case 'road': {
      if (underlay) return [{ property, role: 'land' }];
      const targets: RecolorTarget[] = [{ property, classes: ROAD_CLASSES }];
      if (layer.type === 'circle') targets.push({ property: 'circle-stroke-color', role: 'land' });
      return targets;
    }
    default:
      return [];
  }
}

/**
 * Label colours. Text drawn on its own icon (road shields, junction boxes) keeps its colour,
 * since it was picked to read on that icon. Every halo takes the land colour: it is there to
 * lift the text off the ground.
 */
function symbolTargets(layer: RecolorLayer, sourceLayer: string): RecolorTarget[] {
  if (!layer.layout || !('text-field' in layer.layout)) return [];
  const targets: RecolorTarget[] = [{ property: 'text-halo-color', role: 'land' }];
  if (PLACE_LABEL_LAYERS.has(sourceLayer)) targets.push({ property: 'text-color', role: 'placeLabels' });
  else if (sourceLayer === 'poi_label') targets.push({ property: 'text-color', role: 'poiLabels' });
  else if (ROAD_LABEL_LAYERS.has(sourceLayer) && !('icon-image' in layer.layout)) {
    targets.push({ property: 'text-color', role: 'roadLabels' });
  }
  return targets;
}

function targetRoles(target: RecolorTarget): MapColorRole[] {
  if ('role' in target) return [target.role];
  const roles = target.classes.map(([, role]) => role);
  return target.rest ? [...roles, target.rest] : roles;
}

/** The roles that change something in a style with these layers, in role order. */
export function classicColorRoles(layers: readonly RecolorLayer[]): MapColorRole[] {
  const found = new Set(layers.flatMap((layer) => classicColorTargets(layer).flatMap(targetRoles)));
  return MAP_COLOR_ROLE_IDS.filter((role) => found.has(role));
}

/**
 * The value a target's property should have under `colors`, or undefined to keep the
 * style's own value. `original` is the style's value (needed when only some classes change).
 */
export function recolorValue(target: RecolorTarget, colors: CustomMapStyle['colors'], original: unknown): unknown {
  if ('role' in target) return colors[target.role];

  const cases = target.classes.filter(([, role]) => colors[role]);
  const rest = target.rest && colors[target.rest];
  if (!cases.length) return rest || undefined;
  const branches = cases.flatMap(([classes, role]) => [classes, colors[role]]);
  if (rest) return ['match', ['get', 'class'], ...branches, rest];
  // Unset fill and line colours are black (style spec default).
  return withClassOverrides(original ?? '#000000', branches);
}

/**
 * `original` with `branches` (match labels and outputs) in front of it. A zoom curve keeps
 * its stops and gets the branches in each output, because `zoom` may only be the input of
 * the top-level curve. Undefined when `original` is a legacy function that is not a plain
 * zoom curve.
 */
function withClassOverrides(original: unknown, branches: unknown[]): unknown {
  const value = legacyZoomFunctionToExpression(original);
  if (value === undefined) return undefined;
  const curve = zoomCurveOutputIndices(value);
  if (curve) {
    const out = [...(value as unknown[])];
    for (const i of curve) out[i] = ['match', ['get', 'class'], ...branches, out[i]];
    return out;
  }
  return ['match', ['get', 'class'], ...branches, value];
}

function isZoomInput(input: unknown): boolean {
  return Array.isArray(input) && input.length === 1 && input[0] === 'zoom';
}

/** Indices of the outputs of a top-level zoom `interpolate` or `step`, or undefined. */
function zoomCurveOutputIndices(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const [op] = value;
  if ((op === 'interpolate' || op === 'interpolate-hcl' || op === 'interpolate-lab') && isZoomInput(value[2])) {
    return range(4, value.length, 2);
  }
  if (op === 'step' && isZoomInput(value[1])) return [2, ...range(4, value.length, 2)];
  return undefined;
}

function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i += step) out.push(i);
  return out;
}

interface LegacyFunction {
  stops?: Array<[number, unknown]>;
  base?: number;
  type?: string;
  property?: string;
}

/**
 * Old styles write zoom curves as `{ stops: [[zoom, value], ...] }` (exponential, or
 * `type: 'interval'` for steps). Turns those into expressions; leaves expressions and
 * constants as they are; undefined for any other legacy function.
 */
function legacyZoomFunctionToExpression(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const fn = value as LegacyFunction;
  if (fn.property !== undefined || !Array.isArray(fn.stops) || !fn.stops.length) return undefined;
  if (fn.stops.some((stop) => !Array.isArray(stop) || typeof stop[0] !== 'number')) return undefined;
  if (fn.type === 'interval') {
    return ['step', ['zoom'], fn.stops[0][1], ...fn.stops.slice(1).flat()];
  }
  if (fn.type !== undefined && fn.type !== 'exponential') return undefined;
  return ['interpolate', ['exponential', fn.base ?? 1], ['zoom'], ...fn.stops.flat()];
}
