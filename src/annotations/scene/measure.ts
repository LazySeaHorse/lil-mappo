/**
 * Bounding-box measurement for SceneNode trees.
 *
 * Styles use this to derive their `measure()` result from the scene they
 * render, so bounds cannot drift from what is drawn. Boxes cover the pixels a
 * node can paint (strokes and shadows included), ignoring opacity, and are
 * measured for the node as authored: a polyline's box is that of its full
 * length, not of the fraction currently drawn.
 */

import type { GroupNode, SceneNode } from '../types';
import { measureTextWidth } from './textMetrics';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

type Extent = Pick<BoundingBox, 'minX' | 'minY' | 'maxX' | 'maxY'>;

/** Text box height as a multiple of the font size, matching typical line boxes. */
const TEXT_LINE_HEIGHT = 1.3;
/** Share of that box above the alphabetic baseline. */
const TEXT_ASCENT = 1;

/** Measure the bounding box of a scene tree. Empty scenes measure as a point at the origin. */
export function measureScene(node: SceneNode): BoundingBox {
  const box = measureNode(node) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { ...box, width: box.maxX - box.minX, height: box.maxY - box.minY };
}

function union(boxes: Extent[]): Extent | null {
  if (boxes.length === 0) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

function pointsBox(points: ReadonlyArray<readonly [number, number]>, pad: number): Extent | null {
  return union(points.map(([x, y]) => ({ minX: x - pad, minY: y - pad, maxX: x + pad, maxY: y + pad })));
}

function intersect(a: Extent, clip: NonNullable<GroupNode['clip']>): Extent | null {
  const box = {
    minX: Math.max(a.minX, clip.x),
    minY: Math.max(a.minY, clip.y),
    maxX: Math.min(a.maxX, clip.x + clip.width),
    maxY: Math.min(a.maxY, clip.y + clip.height),
  };
  return box.minX <= box.maxX && box.minY <= box.maxY ? box : null;
}

/** Bounds of a box after the group's transform (translate, then scale and rotate about the anchor). */
function transformBox(box: Extent, group: GroupNode): Extent {
  const { x = 0, y = 0, anchorX = 0, anchorY = 0, scale = 1, scaleX = 1, scaleY = 1, rotation = 0 } = group;
  const sx = scale * scaleX;
  const sy = scale * scaleY;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const corners: Array<[number, number]> = [
    [box.minX, box.minY],
    [box.maxX, box.minY],
    [box.maxX, box.maxY],
    [box.minX, box.maxY],
  ].map(([px, py]) => [
    x + anchorX + (px - anchorX) * sx * cos - (py - anchorY) * sy * sin,
    y + anchorY + (px - anchorX) * sx * sin + (py - anchorY) * sy * cos,
  ]);
  return pointsBox(corners, 0)!;
}

/** Bounds in the parent's coordinate space, or null when the node paints nothing measurable. */
function measureNode(node: SceneNode): Extent | null {
  const box = measureShape(node);
  if (!box || !('shadow' in node) || !node.shadow) return box;
  // A shadow reaches its blur radius past the shape, shifted by its offset.
  const { blur, offsetX = 0, offsetY = 0 } = node.shadow;
  return {
    minX: box.minX - blur + Math.min(0, offsetX),
    minY: box.minY - blur + Math.min(0, offsetY),
    maxX: box.maxX + blur + Math.max(0, offsetX),
    maxY: box.maxY + blur + Math.max(0, offsetY),
  };
}

function measureShape(node: SceneNode): Extent | null {
  switch (node.type) {
    case 'group': {
      let children = union(node.children.map(measureNode).filter((b): b is Extent => b !== null));
      if (children && node.clip) children = intersect(children, node.clip);
      return children && transformBox(children, node);
    }

    case 'rect': {
      const sw = (node.strokeWidth ?? 0) / 2;
      return {
        minX: node.x - sw,
        minY: node.y - sw,
        maxX: node.x + node.width + sw,
        maxY: node.y + node.height + sw,
      };
    }

    case 'circle': {
      // Arcs are measured as the full circle: a draw-on ring ends up there.
      const r = node.r + (node.strokeWidth ?? 0) / 2;
      return { minX: node.cx - r, minY: node.cy - r, maxX: node.cx + r, maxY: node.cy + r };
    }

    case 'text': {
      const displayText = node.textTransform === 'uppercase'
        ? node.text.toUpperCase()
        : node.textTransform === 'lowercase'
          ? node.text.toLowerCase()
          : node.text;
      const measured = measureTextWidth(
        displayText,
        node.fontSize,
        node.fontFamily,
        node.fontWeight ?? 400,
        node.letterSpacing,
        node.fontStyle,
      );
      const width = node.maxWidth ? Math.min(measured, node.maxWidth) : measured;
      const height = node.fontSize * TEXT_LINE_HEIGHT;
      const halo = node.stroke ? (node.strokeWidth ?? 1) / 2 : 0;

      const left = node.align === 'center' ? node.x - width / 2 : node.align === 'right' ? node.x - width : node.x;
      const top = node.baseline === 'middle'
        ? node.y - height / 2
        : node.baseline === 'bottom'
          ? node.y - height
          : node.baseline === 'alphabetic'
            ? node.y - node.fontSize * TEXT_ASCENT
            : node.y;
      return { minX: left - halo, minY: top - halo, maxX: left + width + halo, maxY: top + height + halo };
    }

    case 'image':
      return { minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height };

    case 'line':
      return pointsBox(
        [[node.x1, node.y1], [node.x2, node.y2]],
        (node.strokeWidth ?? 1) / 2,
      );

    case 'polyline':
      return pointsBox(node.points, (node.strokeWidth ?? 1) / 2);

    case 'path':
      // Path strings can't be measured without a rasteriser; styles that use
      // paths report their own bounds.
      return null;
  }
}
