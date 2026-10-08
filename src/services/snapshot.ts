import type { MapRef } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { resolveSystemOverlays, type Branding } from '@/overlays';
import { canvasToBlob, withFrameCapturer } from './frameCapture';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

/**
 * Captures a high-resolution snapshot of the current map view.
 *
 * Temporarily resizes the map to the project's target resolution off-screen,
 * waits for tiles to settle, composites callouts, then downloads as PNG.
 * Uses current playhead position (not interpolated camera).
 */
export async function takeSnapshot(mapRef: React.MutableRefObject<MapRef | null>, branding: Branding) {
  const map = mapRef.current?.getMap?.();
  if (!map) {
    toast.error('Snapshot failed: Map not initialized');
    return;
  }

  const store = useProjectStore.getState();
  const [width, height] = store.resolution;
  const id = toast.loading('Preparing high-res snapshot...');

  try {
    await withFrameCapturer(map, { width, height, overlays: resolveSystemOverlays({ mode: 'export', branding }) }, async ({ zoomOffset, previewZoom, captureNow }) => {
      // Restore equivalent framing at the new resolution.
      if (zoomOffset !== 0) map.jumpTo({ zoom: previewZoom + zoomOffset });

      toast.loading('Rendering high-res tiles...', { id });
      const compCanvas = await captureNow();
      saveAs(await canvasToBlob(compCanvas, 'image/png'), `snapshot-${Date.now()}.png`);
      toast.success('Snapshot saved!', { id });
    });
  } catch (err: unknown) {
    console.error('Snapshot error:', err);
    const message = err instanceof Error ? err.message : String(err);
    toast.error(`Snapshot failed: ${message}`, { id });
  }
}
