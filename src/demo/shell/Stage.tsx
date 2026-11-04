import type { CSSProperties, ReactNode } from 'react';
import type { Box } from './layout';
import './kit/tokens.css';

interface StageProps {
  box: Box;
  /** On the zoomed layer: the wallpaper and the windows. */
  children?: ReactNode;
  /** The auto zoom camera: one transform for everything in `children`. */
  zoom?: CSSProperties;
  /** Over the zoomed layer and never zoomed: the shield and the countdown. */
  overlay?: ReactNode;
}

/** The project-shaped box, letterboxed in the viewport: wallpaper and the windows on it. */
export function Stage({ box, children, zoom, overlay }: StageProps) {
  return (
    <div className="ss-tokens ds-stage" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
      <div className="ds-zoom" style={zoom}>
        <div className="ds-wallpaper" aria-hidden />
        {children}
      </div>
      {overlay}
    </div>
  );
}
