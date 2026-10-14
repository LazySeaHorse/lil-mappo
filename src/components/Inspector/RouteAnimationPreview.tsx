import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { RouteItem } from '@/store/types';

type RouteAnimationType = RouteItem['style']['animationType'];

/** A bend, so a viewer sees the line follow a path. */
const PATH = 'M4 18 C 14 3, 24 24, 44 6';

/**
 * One still frame of each animation, used when the user wants less motion. The path is 1 unit
 * long (`pathLength`), so a dash of length 1 shows the part from 0 to 1 and the offset slides it.
 */
const STILL_FRAME: Record<RouteAnimationType, { strokeDasharray: string; strokeDashoffset: number }> = {
  draw: { strokeDasharray: '1 1', strokeDashoffset: 0.4 },
  navigation: { strokeDasharray: '1 1', strokeDashoffset: -0.4 },
  comet: { strokeDasharray: '0.25 1.25', strokeDashoffset: -0.45 },
};

/**
 * A small looping picture of how a route animation looks. Pure SVG; the loops are CSS
 * (`route-preview-*` in index.css). With reduced motion it shows one still frame.
 */
export function RouteAnimationPreview({ type }: { type: RouteAnimationType }) {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <svg
      viewBox="0 0 48 24"
      width={48}
      height={24}
      aria-hidden="true"
      data-preview={type}
      data-motion={reduceMotion ? 'static' : 'animated'}
      className="overflow-visible"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <path d={PATH} pathLength={1} opacity={0.2} />
      <path
        data-role="line"
        d={PATH}
        pathLength={1}
        className={reduceMotion ? undefined : `route-preview-${type}`}
        style={reduceMotion ? STILL_FRAME[type] : undefined}
      />
    </svg>
  );
}
