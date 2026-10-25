import { SystemOverlays, resolveSystemOverlays } from '@/overlays';
import type { FitFrameState } from './useFitFrame';

/** Mapbox's marks; the frame is still the editor, so the li'l Mappo one stays off even on free. */
const FIT_OVERLAYS = resolveSystemOverlays({ mode: 'fit', branding: 'free' });

/**
 * Fit mode's marks over the video frame, at screen size rather than scaled with the map: Mapbox's
 * logo and attribution where the video puts them, and a crosshair at the frame centre.
 */
export function FitModeLayer({ fit }: { fit: FitFrameState }) {
  const { active, frame } = fit;
  return (
    <div
      aria-hidden
      data-testid="fit-mode-layer"
      data-active={active}
      className="absolute inset-0 z-[5] pointer-events-none overflow-hidden"
    >
      {active && frame && (
        <div
          data-testid="fit-frame"
          className="absolute"
          style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
        >
          <SystemOverlays layers={FIT_OVERLAYS} />
          <div
            data-testid="fit-reticle"
            className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2"
            style={{ filter: 'drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.55))' }}
          >
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/75" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/75" />
          </div>
        </div>
      )}
    </div>
  );
}
