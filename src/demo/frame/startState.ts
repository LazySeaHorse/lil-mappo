import { CAMERA_TRACK_ID, createProject } from '@/store/projectDocument';
import type { CameraKeyframe, Project } from '@/store/types';

/**
 * Where a run starts: an empty project with the file's identity, video shape
 * and map centre. The shell sizes its stage from the video shape before the
 * run, so it is set from the start, not edited on screen.
 */
export function startingProject(file: Project): Project {
  return createProject({
    id: file.id,
    aspectRatio: file.aspectRatio,
    exportResolution: file.exportResolution,
    isVertical: file.isVertical,
    resolution: file.resolution,
    mapCenter: file.mapCenter,
  });
}

/** Width / height of the project's video; below 1 is portrait. */
export function projectAspect(project: Project): number {
  const [w, h] = project.resolution;
  return w > 0 && h > 0 ? w / h : 16 / 9;
}

export interface StartingCamera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/** The view the file's video opens on: its first camera view, else its map centre. Null with neither. */
export function startingCamera(file: Project): StartingCamera | null {
  const camera = file.items[CAMERA_TRACK_ID];
  const keyframes: CameraKeyframe[] = camera?.kind === 'camera' ? [...camera.keyframes] : [];
  const first = keyframes.sort((a, b) => a.time - b.time)[0];
  if (first) {
    const { center, zoom, pitch, bearing } = first.camera;
    return { center, zoom, pitch, bearing };
  }
  const [lng, lat] = file.mapCenter;
  if (lng === 0 && lat === 0) return null;
  return { center: file.mapCenter, zoom: 12, pitch: 0, bearing: 0 };
}
