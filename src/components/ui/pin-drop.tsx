import React from 'react';
import { Mappo } from '@/components/Mappo/Mappo';
import { mappoAspect, mappoTipX, type MappoMood } from '@/components/Mappo/moods';
import { cn } from '@/lib/utils';
import bayLight from '@/assets/pin-drop/bay-light.webp';
import bayDark from '@/assets/pin-drop/bay-dark.webp';

/**
 * Landmarks on the baked San Francisco Bay stills, as fractions of the image's width and height.
 * The stills are Mapbox Static Images (streets-v12 and navigation-night-v1) centred on
 * -122.44, 37.826 at zoom 11.6, 1280 × 800 at 2x.
 */
const SPOTS = {
  sausalito: [0.3438, 0.2687],
  angelIsland: [0.5255, 0.2561],
  alcatraz: [0.559, 0.4951],
  goldenGate: [0.3679, 0.6257],
  presidio: [0.4096, 0.6893],
  ferryBuilding: [0.6597, 0.713],
} as const;

export type PinSpot = keyof typeof SPOTS;

/** A trip from the Ferry Building over the Golden Gate to Sausalito, in the stills' 1280 × 800 pixels. */
const ROUTE = 'M844.4 570.4 L790.1 511.8 L684.2 497.8 L551.7 506.2 L470.9 500.6 L467.8 394.4 L463.4 310.6 L440.1 215';

const SIZES = {
  tall: { height: 196, pinY: 150, pin: 100 },
  compact: { height: 132, pinY: 108, pin: 76 },
};

/** Wide enough that a spot well inside the stills can sit at the middle of any popup. */
const MAP_WIDTH = 'max(900px, 160%)';

interface PinDropHeroProps {
  mood: MappoMood;
  spot?: PinSpot;
  /** A short place label on the map. */
  tag?: string;
  /** Draws the Ferry Building to Sausalito trip. Pair it with the `sausalito` spot so Mappo lands at its end. */
  route?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * The top of a popup: a real map, with Mappo dropping onto it as the pin and squashing on landing.
 * Put it first inside a popup's content, which takes `pinDropContentClass`.
 */
export function PinDropHero({ mood, spot = 'alcatraz', tag, route = false, size = 'tall', className }: PinDropHeroProps) {
  const { height, pinY, pin } = SIZES[size];
  const [x, y] = SPOTS[spot];
  const pinWidth = pin * mappoAspect(mood);
  const tipX = mappoTipX(mood);

  return (
    <div
      data-slot="pin-drop"
      aria-hidden="true"
      className={cn('relative shrink-0 overflow-hidden bg-[#9addff] dark:bg-[#5d757d]', className)}
      style={{ height }}
    >
      <div
        data-slot="pin-drop-map"
        className="absolute"
        style={{
          '--spot-x': String(x),
          '--spot-y': String(y),
          '--map-w': MAP_WIDTH,
          width: 'var(--map-w)',
          left: 'calc(50% - var(--spot-x) * var(--map-w))',
          top: `calc(${pinY}px - var(--spot-y) * var(--map-w) * 0.625)`,
        } as React.CSSProperties}
      >
        <img src={bayLight} alt="" draggable={false} decoding="async" className="block h-auto w-full dark:hidden" />
        <img src={bayDark} alt="" draggable={false} decoding="async" className="hidden h-auto w-full dark:block" />
        {route && (
          <svg data-slot="pin-drop-route" viewBox="0 0 1280 800" className="absolute inset-0 h-full w-full">
            <path d={ROUTE} fill="none" stroke="hsl(var(--primary))" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={844.4} cy={570.4} r={9} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth={5} />
          </svg>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-[58%] to-background" />

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
          <Mappo mood={mood} animated className="h-full w-full drop-shadow-[0_6px_6px_rgba(18,45,86,0.3)]" />
        </div>
      </div>

      {tag && (
        <span className="absolute left-3.5 top-3 rounded-full bg-background px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-[0.06em] text-foreground shadow-[0_1px_3px_rgba(18,45,86,0.25)]">
          {tag}
        </span>
      )}
      <span className="absolute bottom-1 right-2.5 text-[9px] text-muted-foreground/80">© Mapbox © OpenStreetMap</span>
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
