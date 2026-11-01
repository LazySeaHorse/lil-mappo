import type { ReactNode } from 'react';
import type { Box } from './layout';
import './kit/tokens.css';

interface StageProps {
  box: Box;
  children?: ReactNode;
}

/** The project-shaped box, letterboxed in the viewport: wallpaper and the windows on it. */
export function Stage({ box, children }: StageProps) {
  return (
    <div className="ss-tokens ds-stage" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
      <div className="ds-wallpaper" aria-hidden />
      {children}
    </div>
  );
}
