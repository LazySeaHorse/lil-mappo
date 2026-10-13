import { describe, expect, it } from 'vitest';
import { followCameraSummary } from './followCameraSummary';
import { AUTO_CAM_PRESETS } from '@/config/vehicles';

describe('followCameraSummary', () => {
  it('names the preset of a follow view', () => {
    expect(followCameraSummary({ mode: 'cinematic', preset: 'drone' })).toEqual({
      title: AUTO_CAM_PRESETS.drone.label,
      description: AUTO_CAM_PRESETS.drone.description,
    });
  });

  it('names the follow view when an older save has no preset', () => {
    expect(followCameraSummary({ mode: 'cinematic' }).title).toBe('Follow view');
  });

  it('names the navigation view whatever the preset', () => {
    expect(followCameraSummary({ mode: 'navigation', preset: 'drone' }).title).toBe('Navigation view');
  });
});
