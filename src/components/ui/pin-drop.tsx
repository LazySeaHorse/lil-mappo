import React from 'react';
import { Mappo } from '@/components/Mappo/Mappo';
import { mappoAspect, mappoTipX, type MappoMood } from '@/components/Mappo/moods';
import { cn } from '@/lib/utils';
import { PinDropScene, type PinDropSceneName } from './pin-drop-scenes';

const SIZES = {
  tall: { height: 196, pinY: 150, pin: 100 },
  compact: { height: 132, pinY: 108, pin: 76 },
};

/** Scenes are drawn in a 760 × 196 frame with the pin's tip at (380, 150). */
const FRAME_WIDTH = 760;
const FRAME_TIP_Y = 150;

interface PinDropHeroProps {
  mood: MappoMood;
  /** The drawn map and UI pieces behind Mappo, picked for what the popup is about. */
  scene: PinDropSceneName;
  /** A short label in the corner. */
  tag?: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * The top of a popup: a drawn map with a little scene on it, and Mappo dropping onto it as the pin,
 * squashing on landing. Put it first inside a popup's content, which takes `pinDropContentClass`.
 */
export function PinDropHero({ mood, scene, tag, size = 'tall', className }: PinDropHeroProps) {
  const { height, pinY, pin } = SIZES[size];
  const pinWidth = pin * mappoAspect(mood);
  const tipX = mappoTipX(mood);

  return (
    <div
      data-slot="pin-drop"
      data-scene={scene}
      aria-hidden="true"
      className={cn('relative shrink-0 overflow-hidden bg-[var(--map-water)]', className)}
      style={{ height }}
    >
      {/* At popup widths the frame draws at 1:1 and is cropped at the sides, so the middle always shows. */}
      <svg
        data-slot="pin-drop-scene"
        viewBox={`0 ${FRAME_TIP_Y - pinY} ${FRAME_WIDTH} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <PinDropScene scene={scene} />
      </svg>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-[62%] to-background" />

      <span
        className="pin-drop-shadow absolute h-[9px] w-[34px] -ml-[17px] -mt-[5px] rounded-full bg-[#122d56]/35 blur-[2px]"
        style={{ left: '50%', top: pinY }}
      />
      <div
        data-slot="pin-drop-pin"
        className="absolute"
        style={{ left: '50%', marginLeft: `${-tipX * pinWidth}px`, top: pinY - pin, width: pinWidth, height: pin }}
      >
        <div className="pin-drop-fall h-full w-full" style={{ transformOrigin: `${tipX * 100}% 100%` }}>
          {/* In dark mode a faint light edge keeps his navy props from sinking into the map. */}
          <Mappo
            mood={mood}
            animated
            className="h-full w-full drop-shadow-[0_6px_6px_rgba(18,45,86,0.3)] dark:drop-shadow-[0_0_1.5px_rgba(255,255,255,0.6)]"
          />
        </div>
      </div>

      {tag && (
        <span className="absolute left-3.5 top-3 rounded-full bg-background px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-[0.06em] text-foreground shadow-[0_1px_3px_rgba(18,45,86,0.25)]">
          {tag}
        </span>
      )}
    </div>
  );
}

/** The text and buttons under a `PinDropHero`. */
export function PopupBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popup-body" className={cn('relative flex flex-col gap-2 px-[22px] pb-5', className)} {...props} />;
}

/** The buttons at the end of a popup: secondary first, the main action last. */
export function PopupActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popup-actions" className={cn('mt-3 flex flex-wrap justify-end gap-2', className)} {...props} />;
}
