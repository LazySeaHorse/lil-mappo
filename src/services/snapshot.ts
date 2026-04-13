import { useProjectStore } from '@/store/useProjectStore';
import { computeCalloutAnimation, renderCalloutToCanvas } from './renderCallout';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

/**
 * Captures a high-resolution snapshot of the current map view.
 * 
 * Logic:
 * 1. Enables 'isExporting' to trigger Mapbox preserveDrawingBuffer.
 * 2. Temporarily resizes map to the project's target resolution.
 * 3. Renders map and callouts to an offscreen canvas.
 * 4. Downloads as PNG.
 * 
 * Note: Uses current manual camera position, not playhead-interpolated camera.
 */
export async function takeSnapshot(mapRef: React.MutableRefObject<any>) {
  const map = mapRef.current?.getMap?.();
  if (!map) {
    toast.error("Snapshot failed: Map not initialized");
    return;
  }

  const store = useProjectStore.getState();
  const [width, height] = store.resolution;
  
  const id = toast.loading("Preparing high-res snapshot...");

  try {
    // 1. Enable preserveDrawingBuffer (triggers map re-init if not already enabled)
    const wasExporting = store.isExporting;
    if (!wasExporting) {
      store.setIsExporting(true);
      // Wait for re-init
      await new Promise<void>((resolve) => {
        const check = () => {
          if (map.loaded()) resolve();
          else map.once('idle', () => resolve());
        };
        check();
      });
      // Safety buffer for tile reloading after re-init
      await new Promise(r => setTimeout(r, 1500));
    }

    const mapContainer = map.getContainer();
    const origStyle = {
      position: mapContainer.style.position,
      width: mapContainer.style.width,
      height: mapContainer.style.height,
      zIndex: mapContainer.style.zIndex,
      left: mapContainer.style.left,
      top: mapContainer.style.top,
    };

    // 2. Resize map to target resolution (move off-screen)
    mapContainer.style.position = 'fixed';
    mapContainer.style.width = `${width}px`;
    mapContainer.style.height = `${height}px`;
    mapContainer.style.left = '-9999px'; 
    mapContainer.style.top = '-9999px';
    mapContainer.style.zIndex = '-1000';
    map.resize();

    // Wait for tiles to load at new resolution
    toast.loading("Rendering high-res tiles...", { id });
    await new Promise(r => setTimeout(r, 1000));
    await new Promise<void>((resolve) => {
      if (map.loaded()) resolve();
      else map.once('idle', () => resolve());
    });

    // 3. Create composite canvas
    const compCanvas = document.createElement('canvas');
    compCanvas.width = width;
    compCanvas.height = height;
    const compCtx = compCanvas.getContext('2d')!;

    // 4. Draw Map
    const mapCanvas = map.getCanvas();
    compCtx.drawImage(mapCanvas, 0, 0, width, height);

    // 5. Draw Callouts
    const playheadTime = store.playheadTime;
    const zoom = map.getZoom();
    for (const itemId of store.itemOrder) {
      const item = store.items[itemId];
      if (item?.kind !== 'callout') continue;
      
      const anim = computeCalloutAnimation(item as any, playheadTime);
      if (!anim || anim.opacity <= 0) continue;

      const projected = map.project((item as any).lngLat);
      let altitudeOffset = 0;
      if ((item as any).altitude > 0) {
        const metersPerPixel = 156543.03392 * Math.cos((item as any).lngLat[1] * Math.PI / 180) / Math.pow(2, zoom);
        altitudeOffset = Math.min((item as any).altitude / metersPerPixel, 300);
      }
      renderCalloutToCanvas(compCtx, item as any, anim, { x: projected.x, y: projected.y }, altitudeOffset);
    }

    // 6. Download
    compCanvas.toBlob((blob) => {
      if (blob) {
        saveAs(blob, `snapshot-${Date.now()}.png`);
        toast.success("Snapshot saved!", { id });
      } else {
        toast.error("Format conversion failed", { id });
      }
    }, 'image/png');

    // 7. Restore
    mapContainer.style.position = origStyle.position;
    mapContainer.style.width = origStyle.width;
    mapContainer.style.height = origStyle.height;
    mapContainer.style.left = origStyle.left;
    mapContainer.style.top = origStyle.top;
    mapContainer.style.zIndex = origStyle.zIndex;
    map.resize();
    
    // Disable capture mode to save resources
    if (!wasExporting) {
      store.setIsExporting(false);
    }

  } catch (err: any) {
    console.error("Snapshot error:", err);
    toast.error(`Snapshot failed: ${err.message}`, { id });
  }
}
