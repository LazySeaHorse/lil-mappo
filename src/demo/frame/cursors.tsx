/*
 * The macOS cursor glyphs and the cubic-bezier easing below are adapted from the
 * Stageshow kit (kit/cursors.tsx, kit/ease.ts).
 *
 * MIT License
 *
 * Copyright (c) 2026 Benji Taylor
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import type { ReactNode } from 'react';

/** The arrow, the pointing hand (over something clickable) and the I-beam (over text fields). */
export type CursorKind = 'pointer' | 'hand' | 'ibeam';

export interface Point {
  x: number;
  y: number;
}

/** The macOS arrow: white body, black outline. */
function MacPointer() {
  return (
    <svg height="24" width="24" viewBox="0 0 32 32" fill="none">
      <g transform="translate(10 7)">
        <path d="m6.148 18.473 1.863-1.003 1.615-.839-2.568-4.816h4.332l-11.379-11.408v16.015l3.316-3.221z" fill="#fff" />
        <path d="m6.431 17 1.765-.941-2.775-5.202h3.604l-8.025-8.043v11.188l2.53-2.442z" fill="#000" />
      </g>
    </svg>
  );
}

/** The text I-beam, with a thin white edge so it reads on any surface. */
function MacIbeam() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="none" overflow="visible">
      <path d="M3 1H7M3 15H7M5 1V15" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M3 1H7M3 15H7M5 1V15" stroke="#000" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/** The pointing hand: a white glove, index finger up. Hotspot at the fingertip. */
function MacPointingHand() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
      <path
        d="M10.6 6a1.7 1.7 0 0 1 3.4 0v6.6a1.3 1.3 0 0 1 2.6 0v.7a1.3 1.3 0 0 1 2.6 0v.7a1.3 1.3 0 0 1 2.6 0V19c0 3.1-2 5.6-5 5.6h-2.6c-2 0-3.3-.9-4.4-2.4l-3.1-4.1c-.6-.9-.4-2 .5-2.5.8-.4 1.7-.2 2.3.5l1.1 1.4V6Z"
        fill="#fff"
        stroke="#000"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M14 12.6v3.6M16.6 13.3v3M19.2 14v2.6" stroke="#000" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export const CURSOR_GLYPHS: Record<CursorKind, () => ReactNode> = {
  pointer: MacPointer,
  hand: MacPointingHand,
  ibeam: MacIbeam,
};

/** Where each glyph's hotspot sits inside its box, so the point is the click. */
export const CURSOR_HOTSPOTS: Record<CursorKind, Point> = {
  pointer: { x: 7.5, y: 5.25 },
  hand: { x: 9.75, y: 3.25 },
  ibeam: { x: 5, y: 8 },
};

/** cubic-bezier(x1, y1, x2, y2) as a function of time 0..1, as CSS works it out. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (u: number) => ((ax * u + bx) * u + cx) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Newton, falling back to bisection where the slope is flat.
    let u = t;
    for (let i = 0; i < 8; i++) {
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      const next = u - (x(u) - t) / d;
      if (next < 0 || next > 1) break;
      u = next;
    }
    if (Math.abs(x(u) - t) > 1e-6) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 40; i++) {
        u = (lo + hi) / 2;
        if (x(u) < t) lo = u;
        else hi = u;
      }
    }
    return ((ay * u + by) * u + cy) * u;
  };
}
