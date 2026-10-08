import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getExportDimensions } from '@/types/render';
import { sanitizeFeatureCollection } from '@/engine/geojsonSanitize';
import {
  cameraZoomAt,
  DEFAULT_VIEW_ZOOM,
  isLegacyCallout,
  migrateCalloutV1ToV2,
} from '@/annotations/migration';
import type { Project, RouteItem } from './types';
import { MAP_STYLES } from '@/config/mapbox';
import { DEFAULT_SHARPNESS } from '@/engine/routeCurves';
import { leaderLineStyle } from '@/annotations/styles/leader-line';
import { createCalloutStyleDefaults } from './itemFactories';

export const PROJECT_SCHEMA_VERSION = 5 as const;
export const CAMERA_TRACK_ID = 'camera-track';

export type ProjectDocument = Project & {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
};

const coordinateSchema = z.tuple([z.number().finite(), z.number().finite()]);
const easingSchema = z.enum([
  'linear',
  'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeInOutSine',
  'bounce',
]);

const featureCollectionSchema = z.custom<GeoJSON.FeatureCollection>(
  (value) => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { type?: unknown; features?: unknown };
    return candidate.type === 'FeatureCollection' && Array.isArray(candidate.features);
  },
  'Expected a GeoJSON FeatureCollection',
).transform(sanitizeFeatureCollection);

const geometrySchema = z.custom<GeoJSON.Geometry>(
  (value) => {
    if (!value || typeof value !== 'object') return false;
    return typeof (value as { type?: unknown }).type === 'string';
  },
  'Expected a GeoJSON geometry',
);

const routeStyleSchema = z.object({
  color: z.string(),
  width: z.number(),
  glow: z.boolean(),
  glowWidth: z.number(),
  trailFade: z.boolean(),
  trailFadeLength: z.number(),
  dashPattern: z.array(z.number()).nullable(),
  animationType: z.enum(['draw', 'navigation', 'comet']).optional(),
  cometTrailLength: z.number().optional(),
});

const routeVehicleSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['car', 'plane', 'dot']),
  modelId: z.string(),
  scale: z.number(),
});

const routeCalculationSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.enum(['car', 'flight']),
    startPoint: coordinateSchema,
    endPoint: coordinateSchema,
    vehicle: routeVehicleSchema.optional(),
  }),
  z.object({
    mode: z.literal('walk'),
    points: z.array(coordinateSchema),
    curved: z.boolean(),
    sharpness: z.number().finite(),
    vehicle: routeVehicleSchema.optional(),
  }),
]);

const routeItemSchema = z.object({
  kind: z.literal('route'),
  id: z.string().min(1),
  name: z.string(),
  geojson: featureCollectionSchema,
  startTime: z.number(),
  endTime: z.number(),
  autoCam: z.object({
    enabled: z.boolean(),
    mode: z.enum(['cinematic', 'navigation']),
    preset: z.enum(['chase', 'drone', 'reveal', 'topdown']).optional(),
    dynamics: z.number().optional(),
    orbit: z.number().optional(),
    intro: z.number().optional(),
    outro: z.number().optional(),
    pitch: z.number(),
    smoothing: z.number(),
    distance: z.number(),
    zoom: z.number(),
    lookAhead: z.number(),
    easing: easingSchema.optional(),
  }).optional(),
  style: routeStyleSchema,
  easing: easingSchema,
  exitAnimation: z.enum(['none', 'reverse', 'fade']).optional(),
  calculation: routeCalculationSchema.optional(),
});

/** 0-1 for opacities. Older documents stored whatever the slider or an agent wrote, so out-of-range values are clamped, not rejected. */
const unitIntervalSchema = z.number().transform((value) => Math.min(1, Math.max(0, value)));

const boundaryStyleSchema = z.object({
  strokeColor: z.string(),
  fillColor: z.string(),
  strokeWidth: z.number(),
  glow: z.boolean(),
  fillOpacity: unitIntervalSchema,
  animateStroke: z.boolean(),
  animationStyle: z.enum(['fade', 'draw', 'trace']),
  traceLength: z.number(),
  // Added after v5 shipped; older documents parse to the defaults.
  maskOutside: z.boolean().default(false),
  maskColor: z.string().default('#0b0f19'),
  maskOpacity: z.number().min(0).max(1).default(0.85),
  fillMode: z.enum(['color', 'flag']).default('color'),
  flagCode: z.string().nullable().default(null),
});

const boundaryItemSchema = z.object({
  kind: z.literal('boundary'),
  id: z.string().min(1),
  placeName: z.string(),
  geojson: geometrySchema.nullable(),
  resolveStatus: z.enum(['idle', 'loading', 'resolved', 'error']),
  startTime: z.number(),
  endTime: z.number(),
  style: boundaryStyleSchema,
  easing: easingSchema,
  exitAnimation: z.enum(['none', 'reverse', 'fade']).optional(),
});

// Callout schema now lives in the annotation system
import { calloutItemSchema } from '@/annotations/schema';

const cameraItemSchema = z.object({
  kind: z.literal('camera'),
  id: z.string().min(1),
  keyframes: z.array(z.object({
    id: z.string().min(1),
    time: z.number(),
    camera: z.object({
      center: coordinateSchema,
      zoom: z.number(),
      pitch: z.number(),
      bearing: z.number(),
      altitude: z.number().nullable(),
    }),
    easing: easingSchema,
    followRoute: z.string().nullable(),
  })),
});

const timelineItemSchema = z.discriminatedUnion('kind', [
  routeItemSchema,
  boundaryItemSchema,
  calloutItemSchema,
  cameraItemSchema,
]);

const projectDocumentSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string(),
  duration: z.number().positive().finite().default(30),
  fps: z.union([z.literal(30), z.literal(60)]).default(30),
  resolution: coordinateSchema.default([1280, 720]),
  aspectRatio: z.enum(['16:9', '21:9', '4:3', '1:1']).default('16:9'),
  exportResolution: z.enum(['480p', '720p', '1080p', '1440p', '2160p']).default('720p'),
  isVertical: z.boolean().default(false),
  projection: z.enum(['globe', 'mercator']).default('globe'),
  lightPreset: z.enum(['day', 'night', 'dusk', 'dawn']).default('day'),
  starIntensity: z.number().finite().default(0.6),
  fogColor: z.string().nullable().default(null),
  terrainExaggeration: z.number().finite().default(1.5),
  mapStyle: z
    .string()
    .catch('standard')
    .transform((key) => (Object.prototype.hasOwnProperty.call(MAP_STYLES, key) ? key : 'standard'))
    .default('standard'),
  terrainEnabled: z.boolean().default(false),
  buildingsEnabled: z.boolean().default(false),
  labelVisibility: z.record(z.string(), z.boolean()).default({}),
  show3dLandmarks: z.boolean().default(true),
  show3dTrees: z.boolean().default(true),
  show3dFacades: z.boolean().default(true),
  items: z.record(timelineItemSchema),
  itemOrder: z.array(z.string()).default([]),
  mapCenter: coordinateSchema.default([0, 0]),
  customMapStyleUrl: z.string().optional(),
  customMapStyleLabel: z.string().optional(),
}).superRefine((doc, ctx) => {
  const camera = doc.items[CAMERA_TRACK_ID];
  if (!camera || camera.kind !== 'camera') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Project document must contain a valid camera track with id '${CAMERA_TRACK_ID}'`,
      path: ['items', CAMERA_TRACK_ID],
    });
  }
});

const versionEnvelopeSchema = z.object({
  schemaVersion: z.number().int().nonnegative().optional(),
}).passthrough();

const legacyDocumentEnvelopeSchema = z.object({
  items: z.record(z.unknown()),
}).passthrough();

const legacyStyleItemSchema = z.object({
  kind: z.enum(['route', 'boundary']),
  style: z.record(z.unknown()),
}).passthrough();

const legacyCalloutItemSchema = z.object({
  kind: z.literal('callout'),
}).passthrough();

type ProjectMigration = (input: unknown) => unknown;

/** Migrates pre-versioned, whole-store exports to the first durable format. */
const migrateProjectV0ToV1: ProjectMigration = (input) => {
  const document = legacyDocumentEnvelopeSchema.parse(input);
  const items = Object.fromEntries(Object.entries(document.items).map(([id, value]) => {
    const styledItemResult = legacyStyleItemSchema.safeParse(value);
    if (styledItemResult.success) {
      const item = styledItemResult.data;
      if (item.kind === 'route') return [id, item];

      return [id, {
        ...item,
        style: {
          ...item.style,
          fillColor: item.style.fillColor === undefined
            ? item.style.strokeColor
            : item.style.fillColor,
          traceLength: item.style.traceLength === undefined ? 0.1 : item.style.traceLength,
        },
      }];
    }

    const calloutResult = legacyCalloutItemSchema.safeParse(value);
    if (calloutResult.success) {
      return [id, {
        ...calloutResult.data,
        linkTitleToLocation: calloutResult.data.linkTitleToLocation === undefined
          ? false
          : calloutResult.data.linkTitleToLocation,
      }];
    }

    return [id, value];
  }));

  if (!items[CAMERA_TRACK_ID]) {
    items[CAMERA_TRACK_ID] = { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] };
  }

  return { ...document, schemaVersion: 1, items };
};

/**
 * v2 draws the plane model 100x larger (MODEL_BASE_SCALE) and frames its
 * auto-camera 100x further out. Plane routes saved before that change still
 * have follow distances in the ground range, which would put the camera inside
 * the enlarged model. Distances already in the plane range were saved after
 * the change and are left alone; v1's car range topped out below the plane range.
 */
const V1_MAX_CAR_DISTANCE = 3000;
/** v2's plane ranges, which the 100x rescale was clamped into. */
const V2_PLANE_DISTANCE = { min: 10000, max: 300000 };
const V2_PLANE_HEIGHT = { min: 5000, max: 200000 };

interface LegacyAutoCam {
  mode?: string;
  pitch?: number;
  distance?: number;
  height?: number;
}

type LegacyRoute = {
  kind?: string;
  calculation?: { vehicle?: { type?: string } };
  autoCam?: LegacyAutoCam;
} | null;

function migratePlaneAutoCam(value: unknown): unknown {
  const route = value as LegacyRoute;
  const autoCam = route?.autoCam;
  if (route?.kind !== 'route' || route.calculation?.vehicle?.type !== 'plane' || !autoCam) return value;
  if (typeof autoCam.distance !== 'number' || autoCam.distance > V1_MAX_CAR_DISTANCE) return value;
  const scale = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, Math.round(v * 100)));
  return {
    ...route,
    autoCam: {
      ...autoCam,
      distance: scale(autoCam.distance, V2_PLANE_DISTANCE),
      ...(typeof autoCam.height === 'number' ? { height: scale(autoCam.height, V2_PLANE_HEIGHT) } : {}),
    },
  };
}

/** Migrates schema v1 callout items to the annotation-based v2 format. */
const migrateProjectV1ToV2: ProjectMigration = (input) => {
  const document = legacyDocumentEnvelopeSchema.parse(input);
  const camera = document.items[CAMERA_TRACK_ID] as { keyframes?: unknown } | undefined;

  const items: Record<string, unknown> = Object.fromEntries(
    Object.entries(document.items).map(([id, value]) => {
      if (isLegacyCallout(value)) {
        const { startTime = 0, endTime = 0 } = value as { startTime?: number; endTime?: number };
        // v1 altitudes were metres; convert at the zoom the camera shows mid-callout.
        const viewZoom = cameraZoomAt(camera?.keyframes, (startTime + endTime) / 2) ?? DEFAULT_VIEW_ZOOM;
        return [id, migrateCalloutV1ToV2(value, viewZoom)];
      }
      return [id, migratePlaneAutoCam(value)];
    }),
  );

  if (!items[CAMERA_TRACK_ID]) {
    items[CAMERA_TRACK_ID] = { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] };
  }

  return { ...document, schemaVersion: 2, items };
};

const legacyRouteCalculationSchema = z.object({
  mode: z.string(),
  startPoint: z.unknown(),
  endPoint: z.unknown(),
  waypoints: z.array(z.unknown()).optional(),
  curved: z.boolean().optional(),
  sharpness: z.number().optional(),
  vehicle: z.unknown().optional(),
}).passthrough();

const legacyRouteSchema = z.object({
  kind: z.literal('route'),
  calculation: legacyRouteCalculationSchema,
}).passthrough();

const isPlacedPoint = (p: unknown): p is [number, number] =>
  coordinateSchema.safeParse(p).success && ((p as number[])[0] !== 0 || (p as number[])[1] !== 0);

/**
 * v3 splits route calculations by mode. In v2, 'walk' was routed through the
 * walking directions API and 'manual' kept its geometry untouched; both become
 * 'car', which also never rebuilds geometry until the user applies a new route.
 * Only walk/manual routes that were already edited as freehand points (curve
 * settings or waypoints present) become v3 freehand walks.
 */
function migrateRouteCalculationV2ToV3(value: unknown): unknown {
  const result = legacyRouteSchema.safeParse(value);
  if (!result.success) return value;
  const route = result.data;
  const { mode, startPoint, endPoint, waypoints, curved, sharpness, vehicle } = route.calculation;
  const vehicleField = vehicle === undefined ? {} : { vehicle };

  const isLegacyFreehand = (mode === 'walk' || mode === 'manual')
    && (curved !== undefined || (waypoints?.length ?? 0) > 0);

  if (isLegacyFreehand) {
    const points = [startPoint, ...(waypoints ?? []), endPoint]
      .filter(isPlacedPoint)
      // A preview-only bug stored a lone point as both start and end.
      .filter((p, i, all) => i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]);
    return {
      ...route,
      calculation: {
        mode: 'walk',
        points,
        curved: curved ?? true,
        sharpness: sharpness ?? DEFAULT_SHARPNESS,
        ...vehicleField,
      },
    };
  }

  return {
    ...route,
    calculation: {
      mode: mode === 'flight' ? 'flight' : 'car',
      startPoint,
      endPoint,
      ...vehicleField,
    },
  };
}

/** Migrates v2 route calculations to the mode-specific v3 shapes. */
const migrateProjectV2ToV3: ProjectMigration = (input) => {
  const document = legacyDocumentEnvelopeSchema.parse(input);
  const items = Object.fromEntries(
    Object.entries(document.items).map(([id, value]) => [id, migrateRouteCalculationV2ToV3(value)]),
  );
  return { ...document, schemaVersion: 3, items };
};

/**
 * Callout styles that exist from v4 on. Listed here rather than read from the
 * registry so this migration keeps meaning the same thing as styles are added.
 */
const V4_CALLOUT_STYLE_IDS: ReadonlySet<string> = new Set([
  'leader-line',
  'map-label',
  'target-lock',
  'editorial',
  'stamp',
  'flag',
  'polaroid',
  'big-number',
  'hand-drawn',
  'radius-ring',
  'waypoint',
  'road-sign',
]);

/** Shortest offset, in pixels, that still gives a Leader Line a readable diagonal. */
const MIN_LEADER_OFFSET = 40;

const calloutOffsetSchema = z.tuple([z.number().finite(), z.number().finite()]);

/**
 * v4 replaces the eight original callout styles. Their look cannot be carried
 * over, so those callouts become Leader Line: content, location, altitude,
 * timing, opacity and scale are kept, while settings, transition, connector and
 * anchor take Leader Line's defaults. Old styles sat on or just above their
 * point, so small offsets would leave a stubby leader line: an offset shorter
 * than MIN_LEADER_OFFSET is replaced by Leader Line's own, larger (deliberate)
 * ones are kept.
 */
function migrateCalloutStyleV3ToV4(value: unknown): unknown {
  const result = legacyCalloutItemSchema.safeParse(value);
  if (!result.success) return value;
  const callout = result.data;
  if (typeof callout.styleId === 'string' && V4_CALLOUT_STYLE_IDS.has(callout.styleId)) return value;

  const { altitude: _altitude, ...defaults } = createCalloutStyleDefaults(leaderLineStyle);
  const offset = calloutOffsetSchema.catch([0, 0]).parse(callout.offset);
  const keepOffset = Math.hypot(offset[0], offset[1]) >= MIN_LEADER_OFFSET;
  return {
    ...callout,
    ...defaults,
    offset: keepOffset ? offset : defaults.offset,
  };
}

/** Migrates callouts on removed styles to Leader Line. */
const migrateProjectV3ToV4: ProjectMigration = (input) => {
  const document = legacyDocumentEnvelopeSchema.parse(input);
  const items = Object.fromEntries(
    Object.entries(document.items).map(([id, value]) => [id, migrateCalloutStyleV3ToV4(value)]),
  );
  return { ...document, schemaVersion: 4, items };
};

/**
 * v5 frames the follow view by straight-line distance and pitch instead of distance behind
 * and height (which left the pitch slider doing nothing there). A follow-view camera keeps
 * its exact position; a navigation-view one keeps its pitch, which that view already used.
 */
function migrateFollowFramingV4ToV5(value: unknown): unknown {
  const route = value as LegacyRoute;
  if (route?.kind !== 'route' || !route.autoCam) return value;
  const { height, ...autoCam } = route.autoCam;
  if (typeof height !== 'number' || typeof autoCam.distance !== 'number') return { ...route, autoCam };
  const pitch = Math.min(85, (Math.atan2(autoCam.distance, height) * 180) / Math.PI);
  return {
    ...route,
    autoCam: {
      ...autoCam,
      distance: Math.round(Math.hypot(autoCam.distance, height)),
      pitch: autoCam.mode === 'navigation' ? autoCam.pitch : Math.round(pitch * 10) / 10,
    },
  };
}

const migrateProjectV4ToV5: ProjectMigration = (input) => {
  const document = legacyDocumentEnvelopeSchema.parse(input);
  const items = Object.fromEntries(
    Object.entries(document.items).map(([id, value]) => [id, migrateFollowFramingV4ToV5(value)]),
  );
  return { ...document, schemaVersion: 5, items };
};

const projectMigrations: Record<number, ProjectMigration> = {
  0: migrateProjectV0ToV1,
  1: migrateProjectV1ToV2,
  2: migrateProjectV2ToV3,
  3: migrateProjectV3ToV4,
  4: migrateProjectV4ToV5,
};

function migrateProjectDocument(input: unknown): unknown {
  let document = input;
  let version = versionEnvelopeSchema.parse(document).schemaVersion ?? 0;

  if (version > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Project schema version ${version} is newer than supported version ${PROJECT_SCHEMA_VERSION}`,
    );
  }

  while (version < PROJECT_SCHEMA_VERSION) {
    const migration = projectMigrations[version];
    if (!migration) throw new Error(`No project migration available for schema version ${version}`);
    document = migration(document);

    const nextVersion = versionEnvelopeSchema.parse(document).schemaVersion;
    if (nextVersion === undefined || nextVersion <= version) {
      throw new Error(`Project migration for schema version ${version} did not advance the version`);
    }
    version = nextVersion;
  }

  return document;
}

/**
 * Converts unknown storage or network data into the canonical Project shape.
 * Zod object schemas strip unknown keys, so UI state and store actions cannot
 * cross the persistence boundary or be spread back into Zustand.
 */
export function parseProjectDocument(input: unknown): Project {
  const parsed = projectDocumentSchema.parse(migrateProjectDocument(input));
  const { schemaVersion: _, ...project } = parsed;

  const knownOrder = project.itemOrder.filter((id) => id in project.items);
  const missingIds = Object.keys(project.items).filter((id) => !knownOrder.includes(id));
  return { ...project, itemOrder: [...knownOrder, ...missingIds] } as Project;
}

/** Selects only durable project data from a Project or the wider Zustand store. */
export function toProjectDocument(state: Project): ProjectDocument {
  const document = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: state.id,
    name: state.name,
    duration: state.duration,
    fps: state.fps,
    resolution: state.resolution,
    aspectRatio: state.aspectRatio,
    exportResolution: state.exportResolution,
    isVertical: state.isVertical,
    projection: state.projection,
    lightPreset: state.lightPreset,
    starIntensity: state.starIntensity,
    fogColor: state.fogColor,
    terrainExaggeration: state.terrainExaggeration,
    mapStyle: state.mapStyle,
    terrainEnabled: state.terrainEnabled,
    buildingsEnabled: state.buildingsEnabled,
    labelVisibility: state.labelVisibility,
    show3dLandmarks: state.show3dLandmarks,
    show3dTrees: state.show3dTrees,
    show3dFacades: state.show3dFacades,
    items: state.items,
    itemOrder: state.itemOrder,
    mapCenter: state.mapCenter,
    ...(state.customMapStyleUrl !== undefined && { customMapStyleUrl: state.customMapStyleUrl }),
    ...(state.customMapStyleLabel !== undefined && { customMapStyleLabel: state.customMapStyleLabel }),
  } satisfies ProjectDocument;

  // Validate live state too, so invalid data fails at its first durable boundary.
  return { schemaVersion: PROJECT_SCHEMA_VERSION, ...parseProjectDocument(document) };
}

/** Creates a complete project without routing partial data through the loader. */
export function createProject(overrides: Partial<Project> = {}): Project {
  const aspectRatio = overrides.aspectRatio ?? '16:9';
  const exportResolution = overrides.exportResolution ?? '720p';
  const isVertical = overrides.isVertical ?? false;
  const camera = { kind: 'camera' as const, id: CAMERA_TRACK_ID, keyframes: [] };

  return parseProjectDocument({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: nanoid(),
    name: 'Untitled Project',
    duration: 30,
    fps: 30,
    resolution: getExportDimensions(exportResolution, aspectRatio, isVertical),
    aspectRatio,
    exportResolution,
    isVertical,
    projection: 'globe',
    lightPreset: 'day',
    starIntensity: 0.6,
    fogColor: null,
    terrainExaggeration: 1.5,
    mapStyle: 'standard',
    terrainEnabled: false,
    buildingsEnabled: false,
    labelVisibility: {},
    show3dLandmarks: true,
    show3dTrees: true,
    show3dFacades: true,
    items: { [CAMERA_TRACK_ID]: camera },
    itemOrder: [CAMERA_TRACK_ID],
    mapCenter: [0, 0],
    ...overrides,
  });
}
