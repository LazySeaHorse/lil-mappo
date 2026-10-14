import { describe, expect, it } from 'vitest';
import { timelineItemLabel } from './timelineItemLabel';
import { CAMERA_VIEW_TERMS } from '@/lib/terms';
import type { CameraItem } from '@/store/types';

describe('timelineItemLabel', () => {
  it('names the camera row with the camera view term', () => {
    const camera: CameraItem = { id: 'camera-track', kind: 'camera', keyframes: [] };
    expect(timelineItemLabel(camera)).toBe(CAMERA_VIEW_TERMS.track);
  });
});
