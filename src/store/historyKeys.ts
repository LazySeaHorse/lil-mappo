import type { Project } from './types';

/**
 * Project fields that participate in undo/redo: everything persisted that can
 * change exported pixels. Classified against `Project`, so adding a field to
 * the type fails type-checking until it is listed here or in the excluded list.
 */
export const TRACKED_PROJECT_KEYS = [
  'name',
  'duration',
  'fps',
  'resolution',
  'aspectRatio',
  'exportResolution',
  'isVertical',
  'projection',
  'lightPreset',
  'starIntensity',
  'fogColor',
  'terrainExaggeration',
  'mapStyle',
  'terrainEnabled',
  'buildingsEnabled',
  'labelVisibility',
  'show3dLandmarks',
  'show3dTrees',
  'show3dFacades',
  'items',
  'itemOrder',
  'customMapStyleUrl',
  'customMapStyleLabel',
] as const satisfies readonly (keyof Project)[];

/**
 * Persisted fields that never create history: `id` is identity, and
 * `mapCenter` is rewritten on every map pan (search proximity bias only).
 */
export const HISTORY_EXCLUDED_PROJECT_KEYS = ['id', 'mapCenter'] as const satisfies readonly (keyof Project)[];

/** Every key `toProjectDocument` serialises: what the working draft must save. */
export const PERSISTED_PROJECT_KEYS = [...TRACKED_PROJECT_KEYS, ...HISTORY_EXCLUDED_PROJECT_KEYS] as const;

export type TrackedKey = (typeof TRACKED_PROJECT_KEYS)[number];
export type TrackedState = Pick<Project, TrackedKey>;

// Compile-time exhaustiveness: every Project key is either tracked or excluded.
type UnclassifiedProjectKeys = Exclude<
  keyof Project,
  TrackedKey | (typeof HISTORY_EXCLUDED_PROJECT_KEYS)[number]
>;
export const PROJECT_KEYS_CLASSIFIED: [UnclassifiedProjectKeys] extends [never] ? true : never = true;

/** Picks the tracked fields by reference (structural sharing keeps this cheap). */
export function partializeHistory(state: Partial<TrackedState>): TrackedState {
  const out: Record<string, unknown> = {};
  for (const key of TRACKED_PROJECT_KEYS) out[key] = state[key];
  return out as TrackedState;
}

/** True when every tracked field is reference-equal. */
export function trackedStatesEqual(a: Partial<TrackedState>, b: Partial<TrackedState>): boolean {
  for (const key of TRACKED_PROJECT_KEYS) if (!Object.is(a[key], b[key])) return false;
  return true;
}

/** True when any persisted document field differs by reference (ignores playhead, UI state). */
export function projectDocumentChanged(state: Project, prev: Project): boolean {
  for (const key of PERSISTED_PROJECT_KEYS) if (!Object.is(state[key], prev[key])) return true;
  return false;
}
