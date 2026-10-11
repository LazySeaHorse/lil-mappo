import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { applyCamera, getProjectCameraAt } from '@/engine/cameraUtils';
import type { MapSceneRuntime } from '@/components/MapViewport/runtime/MapSceneRuntime';
import { compositeFrame, withTemporaryMapViewport } from './mapCapture';
import { preloadOverlayAssets, type OverlayLayer } from '@/overlays';
import { loadAnnotationAssets } from '@/annotations/draw';
import { waitForMapIdle } from '@/components/MapViewport/runtime/mapWait';

/**
 * Puts the project at `time` for capture: moves the playhead and the camera (zoom shifted by
 * `zoomOffset`), redraws the scene at exactly that time, and resolves once the map has
 * rendered it. Shared by video export and the AI `render_frames` tool.
 *
 * `sync: false` skips the full runtime sync (basemap reconcile + renderer reconcile) for a
 * caller that synced once before a run of frames; the project cannot change mid-export.
 */
export async function stepToTime(
  runtime: MapSceneRuntime,
  map: MapboxMap,
  time: number,
  zoomOffset: number,
  { sync = true }: { sync?: boolean } = {},
): Promise<void> {
  useProjectStore.getState().setPlayheadTime(time);
  const cam = getProjectCameraAt(time);
  if (cam) applyCamera(map, cam, zoomOffset);
  if (sync) runtime.sync();
  runtime.renderAt(time);
  map.triggerRepaint();
  // Waits for the map to go idle, then one animation frame to flush compositing.
  await runtime.waitUntilRendered();
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
   * log2(target width / preview width). Add it to a camera zoom so the framing
   * matches what the user designed at preview size.
   */
  zoomOffset: number;
  /** Zoom of the map before it was resized. */
  previewZoom: number;
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
  const previewWidth = map.getContainer().getBoundingClientRect().width;
  const previewZoom = map.getZoom();
  const zoomOffset = Math.log2(width / previewWidth);

  return withTemporaryMapViewport(map, width, height, () =>
    run({
      zoomOffset,
      previewZoom,
      async captureNow() {
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
