import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getExportDimensions } from '@/types/render';
import type { Project } from './types';

export const PROJECT_SCHEMA_VERSION = 1 as const;
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
);

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
  glowColor: z.string(),
  glowWidth: z.number(),
  trailFade: z.boolean(),
  trailFadeLength: z.number(),
  dashPattern: z.array(z.number()).nullable(),
  animationType: z.enum(['draw', 'navigation', 'comet']).optional(),
  cometTrailLength: z.number().optional(),
});

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
    pitch: z.number(),
    smoothing: z.number(),
    distance: z.number(),
    height: z.number(),
    zoom: z.number(),
    lookAhead: z.number(),
    easing: easingSchema.optional(),
  }).optional(),
  style: routeStyleSchema,
  easing: easingSchema,
  exitAnimation: z.enum(['none', 'reverse', 'fade']).optional(),
  calculation: z.object({
    startPoint: coordinateSchema,
    endPoint: coordinateSchema,
    mode: z.enum(['car', 'walk', 'flight', 'manual']),
    vehicle: z.object({
      enabled: z.boolean(),
      type: z.enum(['car', 'plane', 'dot']),
      modelId: z.string(),
      scale: z.number(),
    }).optional(),
  }).optional(),
});

const boundaryStyleSchema = z.object({
  strokeColor: z.string(),
  fillColor: z.string(),
  strokeWidth: z.number(),
  glow: z.boolean(),
  fillOpacity: z.number(),
  animateStroke: z.boolean(),
  animationStyle: z.enum(['fade', 'draw', 'trace']),
  traceLength: z.number(),
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

const calloutItemSchema = z.object({
  kind: z.literal('callout'),
  id: z.string().min(1),
  title: z.string(),
  subtitle: z.string(),
  imageUrl: z.string().nullable(),
  lngLat: coordinateSchema,
  anchor: z.enum(['bottom', 'top', 'left', 'right']),
  startTime: z.number(),
  endTime: z.number(),
  animation: z.object({
    enter: z.enum(['fadeIn', 'scaleUp', 'slideUp']),
    exit: z.enum(['fadeOut', 'scaleDown', 'slideDown']),
    enterDuration: z.number(),
    exitDuration: z.number(),
  }),
  style: z.object({
    bgColor: z.string(),
    textColor: z.string(),
    accentColor: z.string(),
    borderRadius: z.number(),
    shadow: z.boolean(),
    maxWidth: z.number(),
    fontFamily: z.string(),
    variant: z.enum(['default', 'modern', 'news', 'topo']),
    showMetadata: z.boolean(),
  }),
  linkTitleToLocation: z.boolean(),
  altitude: z.number(),
  poleVisible: z.boolean(),
  poleColor: z.string(),
});

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

const projectDocumentV1Schema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string(),
  duration: z.number().positive().default(30),
  fps: z.union([z.literal(30), z.literal(60)]).default(30),
  resolution: coordinateSchema.default([1280, 720]),
  aspectRatio: z.enum(['16:9', '21:9', '4:3', '1:1']).default('16:9'),
  exportResolution: z.enum(['480p', '720p', '1080p', '1440p', '2160p']).default('720p'),
  isVertical: z.boolean().default(false),
  projection: z.enum(['globe', 'mercator']).default('globe'),
  lightPreset: z.enum(['day', 'night', 'dusk', 'dawn']).default('day'),
  starIntensity: z.number().default(0.6),
  fogColor: z.string().nullable().default(null),
  terrainExaggeration: z.number().default(1.5),
  items: z.record(timelineItemSchema),
  itemOrder: z.array(z.string()).default([]),
  mapCenter: coordinateSchema.default([0, 0]),
  customMapStyleUrl: z.string().optional(),
  customMapStyleLabel: z.string().optional(),
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
      if (item.kind === 'route') {
        return [id, {
          ...item,
          style: {
            ...item.style,
            glowColor: item.style.glowColor === undefined
              ? item.style.color
              : item.style.glowColor,
          },
        }];
      }

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

  return { ...document, schemaVersion: 1, items };
};

const projectMigrations: Record<number, ProjectMigration> = {
  0: migrateProjectV0ToV1,
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
  const parsed = projectDocumentV1Schema.parse(migrateProjectDocument(input));
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
    items: { [CAMERA_TRACK_ID]: camera },
    itemOrder: [CAMERA_TRACK_ID],
    mapCenter: [0, 0],
    ...overrides,
  });
}
