import type { CameraItem, TimelineItem } from './types';
import { TRACKED_PROJECT_KEYS, type TrackedKey, type TrackedState } from './historyKeys';

const KIND_LABEL: Record<TimelineItem['kind'], string> = {
  route: 'route',
  boundary: 'boundary',
  callout: 'callout',
  camera: 'camera',
};

function itemName(item: TimelineItem): string {
  switch (item.kind) {
    case 'route': return item.name || 'route';
    case 'boundary': return item.placeName || 'boundary';
    case 'callout': return item.content?.title || 'callout';
    case 'camera': return 'camera';
  }
}

const SETTING_LABELS: Partial<Record<TrackedKey, string>> = {
  mapStyle: 'Changed map style',
  customMapStyleUrl: 'Changed map style',
  customMapStyleLabel: 'Changed map style',
  labelVisibility: 'Changed map labels',
  terrainEnabled: 'Changed terrain',
  terrainExaggeration: 'Changed terrain',
  buildingsEnabled: 'Changed 3D buildings',
  show3dLandmarks: 'Changed 3D details',
  show3dTrees: 'Changed 3D details',
  show3dFacades: 'Changed 3D details',
  projection: 'Changed projection',
  lightPreset: 'Changed lighting',
  starIntensity: 'Changed atmosphere',
  fogColor: 'Changed atmosphere',
  name: 'Renamed project',
  duration: 'Changed duration',
  fps: 'Changed frame rate',
  resolution: 'Changed resolution',
  aspectRatio: 'Changed resolution',
  exportResolution: 'Changed resolution',
  isVertical: 'Changed resolution',
};

function describeCameraChange(before: CameraItem, after: CameraItem): string {
  const b = before.keyframes;
  const a = after.keyframes;
  if (a.length > b.length) return 'Added camera keyframe';
  if (a.length < b.length) return 'Deleted camera keyframe';
  const changed = a.filter((kf, i) => kf !== b[i]);
  if (changed.length === 1) {
    const prev = b.find((k) => k.id === changed[0].id);
    if (prev && prev.time !== changed[0].time && JSON.stringify(prev.camera) === JSON.stringify(changed[0].camera)) return 'Moved camera keyframe';
  }
  return 'Edited camera keyframe';
}

function describeItemsChange(before: TrackedState, after: TrackedState): string | null {
  const bi = before.items;
  const ai = after.items;
  if (bi === ai) {
    return before.itemOrder !== after.itemOrder ? 'Reordered items' : null;
  }
  const added = Object.keys(ai).filter((id) => !(id in bi));
  const removed = Object.keys(bi).filter((id) => !(id in ai));
  if (added.length === 1 && removed.length === 0) return `Added ${KIND_LABEL[ai[added[0]].kind]}`;
  if (removed.length === 1 && added.length === 0) return `Deleted ${itemName(bi[removed[0]])}`;
  if (added.length || removed.length) return `Changed ${added.length + removed.length} items`;

  const changed = Object.keys(ai).filter((id) => ai[id] !== bi[id]);
  if (changed.length === 0) return before.itemOrder !== after.itemOrder ? 'Reordered items' : null;
  if (changed.length > 1) return `Edited ${changed.length} items`;

  const id = changed[0];
  const prev = bi[id];
  const next = ai[id];
  if (prev.kind === 'camera' && next.kind === 'camera') return describeCameraChange(prev, next);
  if (prev.kind !== 'camera' && next.kind !== 'camera') {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const diff = [...keys].filter((k) => (prev as never)[k] !== (next as never)[k]);
    if (diff.length > 0 && diff.every((k) => k === 'startTime' || k === 'endTime')) return `Moved ${itemName(next)}`;
  }
  return next.kind === 'boundary' ? `Edited ${itemName(next)} boundary` : `Edited ${itemName(next)}`;
}

/** Human label for the change between two tracked snapshots. */
export function describeChange(before: Partial<TrackedState>, after: Partial<TrackedState>): string {
  const b = before as TrackedState;
  const a = after as TrackedState;
  const itemsLabel = describeItemsChange(b, a);
  const changedSettings = TRACKED_PROJECT_KEYS.filter(
    (k) => k !== 'items' && k !== 'itemOrder' && !Object.is(b[k], a[k]),
  );
  if (itemsLabel && changedSettings.length === 0) return itemsLabel;
  if (!itemsLabel && changedSettings.length > 0) {
    const labels = new Set(changedSettings.map((k) => SETTING_LABELS[k] ?? 'Changed project settings'));
    return labels.size === 1 ? [...labels][0] : 'Changed project settings';
  }
  return 'Changed project';
}
