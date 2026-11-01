import type { DemoMissingModel } from '../protocol';
import { getAgentMap } from '@/agent/mapRef';
import { parseProjectDocument } from '@/store/projectDocument';
import { useProjectStore } from '@/store/useProjectStore';
import { clearHistory } from '@/store/history';
import type { Project } from '@/store/types';
import { isModelReady, registerModelBytes } from '@/models/modelRegistry';
import { modelNameFromFile, relinkModel } from '@/models/modelImport';
import { holdModelFile } from '@/models/modelRetention';
import { errorMessage } from '@/lib/utils';
import { startingCamera, startingProject, type StartingCamera } from './startState';

/**
 * The file a demo replays, and the frame's starting state for it: load it,
 * relink its 3D models, put the empty starting project on screen.
 */

export interface DemoFile {
  fileName: string;
  /** The parsed project; a relinked model with different bytes updates its asset here. */
  project: Project;
}

export type ParseResult = { project: Project } | { error: string };

/** Parses a project file's text the way the app opens one. */
export function parseDemoFile(json: string): ParseResult {
  try {
    return { project: parseProjectDocument(JSON.parse(json)) };
  } catch (error) {
    return { error: error instanceof SyntaxError ? 'The file is not valid JSON.' : errorMessage(error) };
  }
}

/** The file's 3D models whose .glb is not in memory: the shell asks for each. */
export function missingModels(project: Project): DemoMissingModel[] {
  return Object.values(project.models)
    .filter((asset) => !isModelReady(asset))
    .map((asset) => ({ modelId: asset.id, name: modelNameFromFile(asset.fileName) }));
}

/** Model files the demo keeps in memory although the starting project does not use them yet. */
const heldModels = new Map<string, () => void>();

export function releaseHeldModels(): void {
  for (const release of heldModels.values()) release();
  heldModels.clear();
}

/**
 * Gives a missing model its .glb through the app's own relink. A file with other
 * bytes than the project was made with is used anyway (the demo has no one to
 * ask): its asset in the file takes the new file's details.
 */
export async function relinkDemoModel(demo: DemoFile, modelId: string, file: File): Promise<void> {
  const asset = demo.project.models[modelId];
  if (!asset) return;
  const result = await relinkModel(asset, file);
  let sha256 = asset.sha256;
  if (result.status === 'mismatch') {
    const read = result.file;
    registerModelBytes(read.sha256, read.bytes);
    sha256 = read.sha256;
    demo.project = {
      ...demo.project,
      models: {
        ...demo.project.models,
        [modelId]: { ...asset, fileName: read.fileName, byteSize: read.byteSize, sha256: read.sha256, bounds: read.bounds },
      },
    };
  }
  // The starting project has no models yet; hold the bytes until the run adds them.
  if (!heldModels.has(sha256)) heldModels.set(sha256, holdModelFile(sha256));
}

/** How long to keep trying to move a map that has not mounted yet. */
const MAP_WAIT_MS = 15_000;

/** Puts the map on the view the video starts on, once there is a map. */
export function jumpMapTo(camera: StartingCamera | null, waitMs = MAP_WAIT_MS): void {
  if (!camera) return;
  const map = getAgentMap();
  if (map) {
    map.jumpTo({ center: camera.center, zoom: camera.zoom, pitch: camera.pitch, bearing: camera.bearing });
    return;
  }
  if (waitMs > 0) setTimeout(() => jumpMapTo(camera, waitMs - 200), 200);
}

/**
 * The run's starting state on screen: the empty project (the file's identity,
 * video shape and centre), no undo history, the map where the video starts.
 */
export function showStartingState(file: Project): void {
  const store = useProjectStore.getState();
  store.setIsPlaying(false);
  store.loadFullProject(startingProject(file));
  clearHistory();
  jumpMapTo(startingCamera(file));
}
