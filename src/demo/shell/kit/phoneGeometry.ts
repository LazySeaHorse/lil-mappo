/* Stageshow kit (MIT, Copyright (c) 2026 Benji Taylor; see LICENSE and NOTICE.md in this folder). */
// Split out of phone.tsx so the demo shell can clip its iframe to the same screen outline.

export const IPHONE = { w: 402, h: 874, r: 64 }
export const CORNER = { a: 71, n: 2.31 }

/** A rounded rectangle with continuous (superellipse) corners, as an SVG
 * path: corners `a` across with exponent `n` (2 is a circle). */
export function superellipsePath(w: number, h: number, a: number, n: number) {
  const steps = 32
  const e = 2 / n
  const pts: string[] = []
  const corners: [number, number, number, number][] = [
    [w - a, a, 1, -1],
    [w - a, h - a, 1, 1],
    [a, h - a, -1, 1],
    [a, a, -1, -1],
  ]
  corners.forEach(([cx, cy, sx, sy], c) => {
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (Math.PI / 2)
      // Clockwise: top-right runs top to right, bottom-right right to bottom, and so on
      const u = c % 2 === 0 ? Math.sin(t) : Math.cos(t)
      const v = c % 2 === 0 ? Math.cos(t) : Math.sin(t)
      pts.push(`${(cx + sx * a * Math.pow(u, e)).toFixed(2)} ${(cy + sy * a * Math.pow(v, e)).toFixed(2)}`)
    }
  })
  return `M${pts.join('L')}Z`
}
