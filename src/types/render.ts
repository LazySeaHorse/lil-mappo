/**
 * Shared render pipeline types used by:
 *  - src/services/videoExport.ts    (local rendering)
 *  - src/components/ExportModal/    (UI)
 *  - src/components/RenderMode/     (headless cloud rendering)
 *  - src/components/Inspector/      (project settings)
 */

export type AspectRatio = '1:1' | '16:9' | '4:3' | '21:9';
export type ExportResolution = '480p' | '720p' | '1080p' | '1440p' | '2160p';

export const RESOLUTION_HEIGHTS: Record<ExportResolution, number> = {
  '480p': 480,
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

export const RESOLUTION_LABELS: Record<ExportResolution, string> = {
  '480p': 'SD 480p',
  '720p': 'HD 720p',
  '1080p': 'FHD 1080p',
  '1440p': 'QHD 1440p',
  '2160p': '4K 2160p',
};

/** Credits billed per resolution tier relative to 480p base. Each tier doubles. */
export const RESOLUTION_CREDIT_MULTIPLIERS: Record<ExportResolution, number> = {
  '480p': 1,
  '720p': 2,
  '1080p': 4,
  '1440p': 8,
  '2160p': 16,
};

export const ASPECT_RATIO_VALUES: Record<AspectRatio, [number, number]> = {
  '1:1': [1, 1],
  '16:9': [16, 9],
  '4:3': [4, 3],
  '21:9': [21, 9],
};

/**
 * Compute final pixel dimensions from a resolution preset, aspect ratio, and
 * orientation. Resolution determines the "short axis" height (or width in
 * portrait), aspect ratio determines the "long axis".
 *
 * Both values are rounded to even numbers — H.264 requires even dimensions.
 */
export function getExportDimensions(
  resolution: ExportResolution,
  aspectRatio: AspectRatio,
  isVertical: boolean,
): [number, number] {
  const h = RESOLUTION_HEIGHTS[resolution];
  const [rw, rh] = ASPECT_RATIO_VALUES[aspectRatio];
  const rawWidth = Math.round((h * rw) / rh);
  const w = rawWidth % 2 === 0 ? rawWidth : rawWidth + 1;
  const evenH = h % 2 === 0 ? h : h + 1;
  // Portrait: swap so height is the long axis
  return isVertical ? [evenH, w] : [w, evenH];
}

/**
 * Credit billing formula:
 *   Base unit = 480p · 30s · 30fps = 1 credit
 *   Resolution: each tier up doubles (480p=1, 720p=2, 1080p=4, 1440p=8, 2160p=16)
 *   Duration: rounded UP to nearest 30-second chunk
 *   FPS: 60fps doubles the credit cost
 */
export function calculateRenderCredits(
  resolution: ExportResolution,
  durationSec: number,
  fps: 30 | 60,
): number {
  const resMult = RESOLUTION_CREDIT_MULTIPLIERS[resolution];
  const timeChunks = Math.ceil(durationSec / 30);
  const fpsMult = fps === 60 ? 2 : 1;
  return resMult * timeChunks * fpsMult;
}

/**
 * Complete snapshot of everything the render pipeline needs.
 *
 * For LOCAL renders — read directly from the live Zustand store; the map
 * already reflects this state.
 *
 * For CLOUD renders — serialized into the `render_jobs.render_config` JSONB
 * column so the headless Chromium instance can faithfully reconstruct the
 * scene without relying on any user's browser session.
 *
 * NOTE: Overlays are not yet implemented. When the overlays feature lands,
 * extend this interface with `overlays?: OverlayItem[]` and add a
 * corresponding rendering slot in captureFrame() inside videoExport.ts.
 */
export interface RenderConfig {
  // Dimensions & timing
  resolution: [number, number];
  fps: 30 | 60;
  aspectRatio: AspectRatio;
  exportResolution: ExportResolution;
  isVertical: boolean;
  // Transient map visual state (not part of persisted Project)
  mapStyle: string;
  terrainEnabled: boolean;
  buildingsEnabled: boolean;
  labelVisibility: Record<string, boolean>;
  show3dLandmarks: boolean;
  show3dTrees: boolean;
  show3dFacades: boolean;
}
