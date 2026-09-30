import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { compositeFrame, withTemporaryMapViewport } from './mapCapture';
import { loadAnnotationAssets } from '@/annotations/draw';
import { waitForMapIdle } from '@/components/MapViewport/runtime/mapWait';

export interface FrameCaptureOptions {
  /** Target frame size in pixels; the map is temporarily resized to it. */
  width: number;
  height: number;
  showWatermark: boolean;
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
  { width, height, showWatermark }: FrameCaptureOptions,
  run: (capturer: FrameCapturer) => Promise<T>,
): Promise<T> {
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
        compositeFrame(map, ctx, width, height, fresh.items, fresh.itemOrder, fresh.playheadTime, showWatermark);
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
