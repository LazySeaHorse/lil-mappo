import { AUTO_CAM_PRESETS } from '@/config/vehicles';
import { FOLLOW_CAMERA_TERMS } from '@/lib/terms';
import type { AutoCamConfig } from '@/store/types';

/** The name of a Follow camera setup and one line about what the camera does. */
export function followCameraSummary(config: Pick<AutoCamConfig, 'mode' | 'preset'>): { title: string; description: string } {
  if (config.mode === 'navigation') return FOLLOW_CAMERA_TERMS.navigationView;
  const preset = config.preset ? AUTO_CAM_PRESETS[config.preset] : undefined;
  return preset ? { title: preset.label, description: preset.description } : FOLLOW_CAMERA_TERMS.followView;
}
