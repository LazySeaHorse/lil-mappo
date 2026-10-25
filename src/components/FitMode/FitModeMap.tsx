import { useRef, type ReactNode } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { cn } from '@/lib/utils';
import { FitModeLayer } from './FitModeLayer';
import { fitMapStyle, useFitFrame } from './useFitFrame';

/**
 * The map's place in the editor. Full screen it fills the editor. Fit mode keeps the map at the
 * editor's width, so zooms mean what they mean full screen, gives it the video's shape, and scales
 * it with CSS into a frame between the panels, on black: the frame shows what the video holds.
 */
export function FitModeMap({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const fit = useFitFrame(stageRef);
  const capturing = useProjectStore((s) => s.isCapturingViewport);

  return (
    <>
      <div ref={stageRef} data-testid="map-stage" className={cn('absolute inset-0 z-0', fit.active && 'bg-black')}>
        <div data-testid="fit-map" className="absolute inset-0" style={fitMapStyle(fit, capturing)}>
          {children}
        </div>
      </div>
      <FitModeLayer fit={fit} />
    </>
  );
}
