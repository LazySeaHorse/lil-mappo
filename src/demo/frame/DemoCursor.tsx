import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CursorController } from './cursor';
import { CURSOR_GLYPHS, CURSOR_HOTSPOTS, type CursorKind } from './cursors';
import './demoCursor.css';

const KINDS = Object.keys(CURSOR_GLYPHS) as CursorKind[];

/**
 * The macOS cursor the demo driver moves: fixed over everything (Radix portals
 * included), never a target itself. Every glyph is drawn; the controller's
 * `data-kind` shows one.
 */
export function DemoCursor({ controller }: { controller: CursorController }) {
  const ref = useCallback((el: HTMLDivElement | null) => controller.attach(el), [controller]);
  return createPortal(
    <div ref={ref} className="demo-cursor" aria-hidden="true" data-testid="demo-cursor">
      <div className="demo-cursor__press">
        {KINDS.map((kind) => {
          const Glyph = CURSOR_GLYPHS[kind];
          const hot = CURSOR_HOTSPOTS[kind];
          return (
            <div
              key={kind}
              className="demo-cursor__glyph"
              data-glyph={kind}
              style={{ marginLeft: -hot.x, marginTop: -hot.y, transformOrigin: `${hot.x}px ${hot.y}px` }}
            >
              <Glyph />
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
