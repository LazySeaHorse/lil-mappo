/**
 * Bounding-box measurement for SceneNode trees.
 * Used to size OffscreenCanvas for preview rendering
 * and to compute anchor offsets.
 */

import type { SceneNode } from '../types';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** Measure the bounding box of a scene tree. */
export function measureScene(node: SceneNode): BoundingBox {
  const box = measureNode(node, 0, 0);
  return {
    ...box,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
  };
}

function measureNode(
  node: SceneNode,
  parentX: number,
  parentY: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  switch (node.type) {
    case 'group': {
      const gx = parentX + (node.x ?? 0);
      const gy = parentY + (node.y ?? 0);

      if (node.children.length === 0) {
        return { minX: gx, minY: gy, maxX: gx, maxY: gy };
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const child of node.children) {
        const childBox = measureNode(child, gx, gy);
        minX = Math.min(minX, childBox.minX);
        minY = Math.min(minY, childBox.minY);
        maxX = Math.max(maxX, childBox.maxX);
        maxY = Math.max(maxY, childBox.maxY);
      }

      // Apply scale if present
      if (node.scale != null && node.scale !== 1) {
        const cx = node.anchorX ?? 0;
        const cy = node.anchorY ?? 0;
        const scale = node.scale;
        minX = cx + (minX - gx - cx) * scale + gx;
        maxX = cx + (maxX - gx - cx) * scale + gx;
        minY = cy + (minY - gy - cy) * scale + gy;
        maxY = cy + (maxY - gy - cy) * scale + gy;
      }

      return { minX, minY, maxX, maxY };
    }

    case 'rect': {
      const x = parentX + node.x;
      const y = parentY + node.y;
      const sw = (node.strokeWidth ?? 0) / 2;
      return {
        minX: x - sw,
        minY: y - sw,
        maxX: x + node.width + sw,
        maxY: y + node.height + sw,
      };
    }

    case 'circle': {
      const cx = parentX + node.cx;
      const cy = parentY + node.cy;
      const r = node.r + (node.strokeWidth ?? 0) / 2;
      return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
    }

    case 'text': {
      // Text measurement is approximate without a canvas context.
      // Use fontSize * 0.6 * text.length as a rough width estimate.
      const x = parentX + node.x;
      const y = parentY + node.y;
      const charWidth = node.fontSize * 0.55;
      const displayText = node.textTransform === 'uppercase' ? node.text.toUpperCase() : node.text;
      const estWidth = node.maxWidth
        ? Math.min(charWidth * displayText.length, node.maxWidth)
        : charWidth * displayText.length;
      const estHeight = node.fontSize * 1.3;

      let textX = x;
      if (node.align === 'center') textX = x - estWidth / 2;
      else if (node.align === 'right') textX = x - estWidth;

      let textY = y;
      if (node.baseline === 'middle') textY = y - estHeight / 2;
      else if (node.baseline === 'bottom') textY = y - estHeight;

      return {
        minX: textX,
        minY: textY,
        maxX: textX + estWidth,
        maxY: textY + estHeight,
      };
    }

    case 'image': {
      const x = parentX + node.x;
      const y = parentY + node.y;
      return { minX: x, minY: y, maxX: x + node.width, maxY: y + node.height };
    }

    case 'line': {
      const sw = (node.strokeWidth ?? 1) / 2;
      return {
        minX: Math.min(parentX + node.x1, parentX + node.x2) - sw,
        minY: Math.min(parentY + node.y1, parentY + node.y2) - sw,
        maxX: Math.max(parentX + node.x1, parentX + node.x2) + sw,
        maxY: Math.max(parentY + node.y1, parentY + node.y2) + sw,
      };
    }

    case 'path': {
      // Path measurement without parsing is impractical.
      // Return a zero-size box at parent origin; styles should use
      // the measure() method on the definition for accurate results.
      return { minX: parentX, minY: parentY, maxX: parentX, maxY: parentY };
    }
  }
}
