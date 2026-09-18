export interface InvariantViolation {
  path: string;
  expected: string;
  actual: unknown;
  message: string;
}

export interface MinimalProjectState {
  items: Record<string, {
    id: string;
    kind: string;
    startTime?: number;
    endTime?: number;
    keyframes?: Array<{
      id: string;
      time: number;
      zoom?: number;
      pitch?: number;
      bearing?: number;
      center?: [number, number];
    }>;
  }>;
  itemOrder: string[];
  duration: number;
  fps: number;
  playheadTime: number;
  selectedItemId: string | null;
  selectedKeyframeId: string | null;
  cameraItem?: {
    id: string;
    keyframes: Array<{
      id: string;
      time: number;
      zoom: number;
      pitch: number;
      bearing: number;
      center: [number, number];
    }>;
  };
}

/**
 * Validates the core Zustand store invariants for li'l Mappo.
 * Returns an array of violations (empty array if perfectly healthy).
 */
export function validateStoreInvariants(state: MinimalProjectState): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // 1. Duration and FPS Sanity
  if (typeof state.duration !== 'number' || Number.isNaN(state.duration) || state.duration <= 0) {
    violations.push({
      path: 'duration',
      expected: 'positive finite number',
      actual: state.duration,
      message: `Project duration is invalid: ${state.duration}`,
    });
  }

  if (typeof state.fps !== 'number' || Number.isNaN(state.fps) || state.fps <= 0) {
    violations.push({
      path: 'fps',
      expected: 'positive finite number',
      actual: state.fps,
      message: `Project FPS is invalid: ${state.fps}`,
    });
  }

  // 2. Playhead Time Sanity (allow slight floating point epsilon)
  if (typeof state.playheadTime !== 'number' || Number.isNaN(state.playheadTime)) {
    violations.push({
      path: 'playheadTime',
      expected: 'finite number',
      actual: state.playheadTime,
      message: `Playhead time is NaN or non-numeric: ${state.playheadTime}`,
    });
  } else if (state.playheadTime < -0.05 || state.playheadTime > state.duration + 0.1) {
    violations.push({
      path: 'playheadTime',
      expected: `0 <= playheadTime <= ${state.duration}`,
      actual: state.playheadTime,
      message: `Playhead time out of bounds: ${state.playheadTime}s (duration: ${state.duration}s)`,
    });
  }

  // 3. Item Order & Items Consistency
  const itemMap = state.items || {};
  const itemOrder = state.itemOrder || [];

  for (const id of itemOrder) {
    if (!itemMap[id]) {
      violations.push({
        path: `itemOrder -> items[${id}]`,
        expected: 'item must exist in items record',
        actual: undefined,
        message: `Dangling ID in itemOrder: ${id} does not exist in items dictionary`,
      });
    }
  }

  for (const [id, item] of Object.entries(itemMap)) {
    if (!itemOrder.includes(id)) {
      violations.push({
        path: `items[${id}] -> itemOrder`,
        expected: 'item ID must be listed in itemOrder',
        actual: false,
        message: `Item ${id} (${item.kind}) exists in items dictionary but is missing from itemOrder`,
      });
    }

    // Timing bounds for timeline items
    if (typeof item.startTime === 'number' && typeof item.endTime === 'number') {
      if (item.startTime > item.endTime) {
        violations.push({
          path: `items[${id}].timing`,
          expected: `startTime (${item.startTime}) <= endTime (${item.endTime})`,
          actual: { start: item.startTime, end: item.endTime },
          message: `Item ${id} has inverted start/end times`,
        });
      }
    }
  }

  // 4. Selection Integrity
  if (state.selectedItemId !== null && !itemMap[state.selectedItemId]) {
    violations.push({
      path: 'selectedItemId',
      expected: 'selected item must exist in items or be null',
      actual: state.selectedItemId,
      message: `selectedItemId ${state.selectedItemId} does not exist in items`,
    });
  }

  // 5. Camera Keyframe Integrity
  const cameraItem = state.cameraItem || (itemMap['camera-track'] as MinimalProjectState['cameraItem']);
  if (cameraItem && Array.isArray(cameraItem.keyframes)) {
    for (let i = 0; i < cameraItem.keyframes.length; i++) {
      const kf = cameraItem.keyframes[i];
      if (typeof kf.zoom === 'number' && (Number.isNaN(kf.zoom) || kf.zoom < 0 || kf.zoom > 26)) {
        violations.push({
          path: `camera.keyframes[${i}].zoom`,
          expected: '0 <= zoom <= 26',
          actual: kf.zoom,
          message: `Camera keyframe #${i} has invalid zoom: ${kf.zoom}`,
        });
      }
      if (typeof kf.pitch === 'number' && (Number.isNaN(kf.pitch) || kf.pitch < 0 || kf.pitch > 90)) {
        violations.push({
          path: `camera.keyframes[${i}].pitch`,
          expected: '0 <= pitch <= 90',
          actual: kf.pitch,
          message: `Camera keyframe #${i} has invalid pitch: ${kf.pitch}`,
        });
      }
      if (typeof kf.bearing === 'number' && (Number.isNaN(kf.bearing) || !Number.isFinite(kf.bearing))) {
        violations.push({
          path: `camera.keyframes[${i}].bearing`,
          expected: 'finite number',
          actual: kf.bearing,
          message: `Camera keyframe #${i} has non-finite bearing: ${kf.bearing}`,
        });
      }
      if (kf.center) {
        const [lng, lat] = kf.center;
        if (Number.isNaN(lng) || lng < -185 || lng > 185 || Number.isNaN(lat) || lat < -95 || lat > 95) {
          violations.push({
            path: `camera.keyframes[${i}].center`,
            expected: 'valid [lng, lat] coordinates',
            actual: kf.center,
            message: `Camera keyframe #${i} has invalid center coordinates: [${lng}, ${lat}]`,
          });
        }
      }
    }
  }

  return violations;
}
