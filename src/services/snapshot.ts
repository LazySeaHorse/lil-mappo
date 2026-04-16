import { useProjectStore } from '@/store/useProjectStore';
import { compositeFrame, withMapResized } from './mapCapture';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

/**
 * Captures a high-resolution snapshot of the current map view.
 *
 * Temporarily resizes the map to the project's target resolution off-screen,
 * waits for tiles to settle, composites callouts, then downloads as PNG.
 * Uses current playhead position (not interpolated camera).
 */
export async function takeSnapshot(mapRef: React.MutableRefObject<any>, showWatermark: boolean) {
  const map = mapRef.current?.getMap?.();
  if (!map) {
    toast.error('Snapshot failed: Map not initialized');
    return;
  }

  const store = useProjectStore.getState();
  const [width, height] = store.resolution;
  const id = toast.loading('Preparing high-res snapshot...');

  try {
    await withMapResized(map, width, height, async () => {
      toast.loading('Rendering high-res tiles...', { id });
      await Promise.race([
        new Promise<void>((resolve) => map.once('idle', resolve)),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
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
  } catch (err: any) {
    console.error('Snapshot error:', err);
    toast.error(`Snapshot failed: ${err.message}`, { id });
  }
}
