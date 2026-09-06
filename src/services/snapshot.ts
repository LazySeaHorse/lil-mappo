import type { MapRef } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { compositeFrame, withTemporaryMapViewport } from './mapCapture';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { waitForMapIdle } from '@/components/MapViewport/runtime/mapWait';

/**
 * Captures a high-resolution snapshot of the current map view.
 *
 * Temporarily resizes the map to the project's target resolution off-screen,
 * waits for tiles to settle, composites callouts, then downloads as PNG.
 * Uses current playhead position (not interpolated camera).
 */
export async function takeSnapshot(mapRef: React.MutableRefObject<MapRef | null>, showWatermark: boolean) {
  const map = mapRef.current?.getMap?.();
  if (!map) {
    toast.error('Snapshot failed: Map not initialized');
    return;
  }

  const store = useProjectStore.getState();
  const [width, height] = store.resolution;
  const id = toast.loading('Preparing high-res snapshot...');

  // Capture preview dimensions before resize so we can preserve framing.
  const previewWidth = map.getContainer().getBoundingClientRect().width;
  const previewZoom = map.getZoom();
  const zoomOffset = Math.log2(width / previewWidth);

  try {
    await withTemporaryMapViewport(map, width, height, async () => {
      // Restore equivalent framing at the new resolution.
      if (zoomOffset !== 0) map.jumpTo({ zoom: previewZoom + zoomOffset });

      toast.loading('Rendering high-res tiles...', { id });
      await waitForMapIdle(map, { timeoutMs: 3_000 });
      await document.fonts.ready;

      const compCanvas = document.createElement('canvas');
      compCanvas.width = width;
      compCanvas.height = height;
      const compCtx = compCanvas.getContext('2d')!;

      const freshStore = useProjectStore.getState();
      compositeFrame(map, compCtx, width, height, freshStore.items, freshStore.itemOrder, freshStore.playheadTime, showWatermark);

      await new Promise<void>((resolve, reject) => {
        compCanvas.toBlob((blob) => {
          if (blob) {
            saveAs(blob, `snapshot-${Date.now()}.png`);
            toast.success('Snapshot saved!', { id });
            resolve();
          } else {
            reject(new Error('Format conversion failed'));
          }
        }, 'image/png');
      });
    });
  } catch (err: unknown) {
    console.error('Snapshot error:', err);
    const message = err instanceof Error ? err.message : String(err);
    toast.error(`Snapshot failed: ${message}`, { id });
  }
}
