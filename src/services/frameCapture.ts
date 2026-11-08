import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { applyCamera, getProjectCameraAt } from '@/engine/cameraUtils';
import { mapContainerSize } from '@/engine/mapFraming';
import { frameZoomOffset, projectFrameWidth } from '@/engine/frameScale';
import type { MapRenderWaitOptions, MapSceneRuntime } from '@/components/MapViewport/runtime/MapSceneRuntime';
import { compositeFrame, withTemporaryMapViewport } from './mapCapture';
import { preloadOverlayAssets, type OverlayLayer } from '@/overlays';
import { loadAnnotationAssets } from '@/annotations/draw';
import { waitForMapIdle, type MapIdleResult } from '@/components/MapViewport/runtime/mapWait';

/**
 * Puts the project at `time` for capture: moves the playhead and the camera (zoom shifted by
 * `zoomOffset`), redraws the scene at exactly that time, and resolves once the map has
 * rendered it, or the render wait timed out. Shared by video export and the AI `render_frames` tool.
 *
 * Resolves `'timeout'` when the map did not go idle in time: the frame can still be captured,
 * but tiles may be missing or low-res.
 *
 * `sync: false` skips the full runtime sync (basemap reconcile + renderer reconcile) for a
 * caller that synced once before a run of frames; the project cannot change mid-export.
 * `wait` sets how long to wait for the render (5s by default) and what cancels it.
 */
export async function stepToTime(
  runtime: MapSceneRuntime,
  map: MapboxMap,
  time: number,
  zoomOffset: number,
  { sync = true, wait }: { sync?: boolean; wait?: MapRenderWaitOptions } = {},
): Promise<MapIdleResult> {
  useProjectStore.getState().setPlayheadTime(time);
  const cam = getProjectCameraAt(time);
  if (cam) applyCamera(map, cam, zoomOffset);
  if (sync) runtime.sync();
  runtime.renderAt(time);
  map.triggerRepaint();
  // Waits for the map to go idle, then one animation frame to flush compositing.
  return runtime.waitUntilRendered(wait);
}

export interface FrameCaptureOptions {
  /** Target frame size in pixels; the map is temporarily resized to it. */
  width: number;
  height: number;
  /** Overlays drawn on top of every captured frame (none for the AI agent). */
  overlays: OverlayLayer[];
}

export interface FrameCapturer {
  /**
   * log2(target width / the project's frame width). Add it to a project zoom (a camera's) so the
   * target frame shows what it frames (see engine/frameScale).
   */
  zoomOffset: number;
  /** The map zoom that shows what the editor showed before the resize, at the target size. */
  sameViewZoom: number;
  /**
   * Waits for the map to settle, then composites the map canvas and callouts
   * for the store's current playhead onto a new canvas of the target size.
   * The caller positions the camera and playhead first.
   */
  captureNow(): Promise<HTMLCanvasElement>;
}

/**
 * Lends the map to frame capture at an off-screen target resolution. The
 * viewport and camera are restored when `run` settles. Shared by the snapshot
 * button and the AI `render_frames` tool so both exercise the same pipeline.
 */
export async function withFrameCapturer<T>(
  map: MapboxMap,
  { width, height, overlays }: FrameCaptureOptions,
  run: (capturer: FrameCapturer) => Promise<T>,
): Promise<T> {
  await preloadOverlayAssets();
  // Read before the resize: the project's frame and the editor's view at the editor's size.
  const zoomOffset = frameZoomOffset(width, projectFrameWidth(map));
  const sameViewZoom = map.getZoom() + Math.log2(width / mapContainerSize(map).width);

  return withTemporaryMapViewport(map, width, height, () =>
    run({
      zoomOffset,
      sameViewZoom,
      async captureNow() {
        // Best-effort: a single still is captured even if the map did not go idle in time.
        await waitForMapIdle(map, { timeoutMs: 3_000 });
        await document.fonts.ready;
        const { items, itemOrder } = useProjectStore.getState();
        await loadAnnotationAssets(items, itemOrder);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        const fresh = useProjectStore.getState();
        compositeFrame(map, ctx, width, height, fresh.items, fresh.itemOrder, fresh.playheadTime, overlays, zoomOffset);
        return canvas;
      },
    }),
  );
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Format conversion failed'))),
      type,
      quality,
    );
  });
}
