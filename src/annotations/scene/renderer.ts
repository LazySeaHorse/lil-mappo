/**
 * Canvas 2D renderer for SceneNode trees.
 *
 * This is THE canonical renderer — used by both the live preview and the export
 * compositing pipeline. There is no separate DOM renderer.
 */

import type { SceneNode, RectNode } from '../types';

// ─── Image cache ──────────────────────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();
const pendingLoads = new Map<string, Promise<HTMLImageElement>>();

/**
 * Get a cached image element, starting a load if needed.
 * Returns null if the image isn't loaded yet.
 */
export function getCachedImage(src: string): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached?.complete && cached.naturalWidth > 0) return cached;

  if (!pendingLoads.has(src)) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => {
        imageCache.set(src, img);
        pendingLoads.delete(src);
        resolve(img);
      };
      img.onerror = () => {
        pendingLoads.delete(src);
        reject(new Error(`Failed to load image: ${src}`));
      };
    });
    img.src = src;
    pendingLoads.set(src, promise);
  }

  return null;
}

/**
 * Preload an image and return when ready. Used by export pipeline
 * to ensure all images are loaded before rendering begins.
 */
export async function preloadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached?.complete && cached.naturalWidth > 0) return cached;

  const pending = pendingLoads.get(src);
  if (pending) return pending;

  // Trigger load through getCachedImage
  getCachedImage(src);
  const promise = pendingLoads.get(src);
  if (promise) return promise;

  throw new Error(`Failed to start loading image: ${src}`);
}

// ─── Core renderer ────────────────────────────────────────────────────────────

/**
 * Render a SceneNode tree onto a Canvas 2D context.
 * The context should already be translated to the annotation's anchor point.
 */
export function renderScene(ctx: CanvasRenderingContext2D, node: SceneNode): void {
  ctx.save();

  switch (node.type) {
    case 'group': {
      if (node.x || node.y) ctx.translate(node.x ?? 0, node.y ?? 0);
      if (node.opacity != null) ctx.globalAlpha *= node.opacity;
      if (node.anchorX || node.anchorY) {
        ctx.translate(node.anchorX ?? 0, node.anchorY ?? 0);
      }
      if (node.scale != null && node.scale !== 1) {
        ctx.scale(node.scale, node.scale);
      }
      if (node.rotation != null && node.rotation !== 0) {
        ctx.rotate(node.rotation);
      }
      if (node.anchorX || node.anchorY) {
        ctx.translate(-(node.anchorX ?? 0), -(node.anchorY ?? 0));
      }
      for (const child of node.children) {
        renderScene(ctx, child);
      }
      break;
    }

    case 'rect': {
      if (node.opacity != null) ctx.globalAlpha *= node.opacity;
      renderRect(ctx, node);
      break;
    }

    case 'circle': {
      if (node.opacity != null) ctx.globalAlpha *= node.opacity;

      if (node.shadow) {
        ctx.shadowColor = node.shadow.color;
        ctx.shadowBlur = node.shadow.blur;
        ctx.shadowOffsetX = node.shadow.offsetX ?? 0;
        ctx.shadowOffsetY = node.shadow.offsetY ?? 0;
      }

      ctx.beginPath();
      ctx.arc(node.cx, node.cy, node.r, 0, Math.PI * 2);

      if (node.fill) {
        ctx.fillStyle = node.fill;
        ctx.fill();
      }

      // Clear shadow before stroke so it doesn't double-shadow
      if (node.shadow) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      if (node.stroke) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth ?? 1;
        ctx.stroke();
      }
      break;
    }

    case 'text': {
      if (node.opacity != null) ctx.globalAlpha *= node.opacity;

      const weight = node.fontWeight ?? 400;
      ctx.font = `${weight} ${node.fontSize}px '${node.fontFamily}', sans-serif`;
      ctx.textAlign = node.align ?? 'left';
      ctx.textBaseline = node.baseline ?? 'top';

      if (node.fill) ctx.fillStyle = node.fill;

      let displayText = node.text;
      if (node.textTransform === 'uppercase') displayText = displayText.toUpperCase();
      else if (node.textTransform === 'lowercase') displayText = displayText.toLowerCase();

      if (node.maxWidth) {
        ctx.fillText(displayText, node.x, node.y, node.maxWidth);
      } else {
        ctx.fillText(displayText, node.x, node.y);
      }
      break;
    }

    case 'image': {
      if (node.opacity != null) ctx.globalAlpha *= node.opacity;
      const img = getCachedImage(node.src);
      if (!img) break; // Image not loaded yet — skip this frame

      if (node.cornerRadius && node.cornerRadius > 0) {
        ctx.beginPath();
        roundRectPath(ctx, node.x, node.y, node.width, node.height, node.cornerRadius);
        ctx.clip();
      }

      // Handle object-fit
      const fit = node.objectFit ?? 'cover';
      if (fit === 'fill') {
        ctx.drawImage(img, node.x, node.y, node.width, node.height);
      } else {
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const boxAspect = node.width / node.height;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;

        if (fit === 'cover') {
          if (imgAspect > boxAspect) {
            sw = img.naturalHeight * boxAspect;
            sx = (img.naturalWidth - sw) / 2;
          } else {
            sh = img.naturalWidth / boxAspect;
            sy = (img.naturalHeight - sh) / 2;
          }
        } else {
          // contain
          if (imgAspect > boxAspect) {
            const drawH = node.width / imgAspect;
            ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, node.x, node.y + (node.height - drawH) / 2, node.width, drawH);
            break;
          } else {
            const drawW = node.height * imgAspect;
            ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, node.x + (node.width - drawW) / 2, node.y, drawW, node.height);
            break;
          }
        }

        ctx.drawImage(img, sx, sy, sw, sh, node.x, node.y, node.width, node.height);
      }
      break;
    }

    case 'line': {
      if (node.opacity != null) ctx.globalAlpha *= node.opacity;
      ctx.strokeStyle = node.stroke;
      ctx.lineWidth = node.strokeWidth ?? 1;
      if (node.dashPattern) ctx.setLineDash(node.dashPattern);
      ctx.beginPath();
      ctx.moveTo(node.x1, node.y1);
      ctx.lineTo(node.x2, node.y2);
      ctx.stroke();
      if (node.dashPattern) ctx.setLineDash([]);
      break;
    }

    case 'path': {
      if (node.opacity != null) ctx.globalAlpha *= node.opacity;

      if (node.shadow) {
        ctx.shadowColor = node.shadow.color;
        ctx.shadowBlur = node.shadow.blur;
        ctx.shadowOffsetX = node.shadow.offsetX ?? 0;
        ctx.shadowOffsetY = node.shadow.offsetY ?? 0;
      }

      const path2d = new Path2D(node.d);
      if (node.fill) {
        ctx.fillStyle = node.fill;
        ctx.fill(path2d);
      }

      if (node.shadow) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      if (node.stroke) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth ?? 1;
        ctx.stroke(path2d);
      }
      break;
    }
  }

  ctx.restore();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderRect(ctx: CanvasRenderingContext2D, node: RectNode): void {
  if (node.shadow) {
    ctx.shadowColor = node.shadow.color;
    ctx.shadowBlur = node.shadow.blur;
    ctx.shadowOffsetX = node.shadow.offsetX ?? 0;
    ctx.shadowOffsetY = node.shadow.offsetY ?? 0;
  }

  const r = node.cornerRadius;

  if (node.fill) {
    ctx.fillStyle = node.fill;
    if (r) {
      ctx.beginPath();
      if (Array.isArray(r)) {
        roundRectPathIndividual(ctx, node.x, node.y, node.width, node.height, r);
      } else {
        roundRectPath(ctx, node.x, node.y, node.width, node.height, r);
      }
      ctx.fill();
    } else {
      ctx.fillRect(node.x, node.y, node.width, node.height);
    }
  }

  // Clear shadow before stroke
  if (node.shadow) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  if (node.stroke) {
    ctx.strokeStyle = node.stroke;
    ctx.lineWidth = node.strokeWidth ?? 1;
    if (r) {
      ctx.beginPath();
      if (Array.isArray(r)) {
        roundRectPathIndividual(ctx, node.x, node.y, node.width, node.height, r);
      } else {
        roundRectPath(ctx, node.x, node.y, node.width, node.height, r);
      }
      ctx.stroke();
    } else {
      ctx.strokeRect(node.x, node.y, node.width, node.height);
    }
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
): void {
  const cr = Math.min(r, w / 2, h / 2);
  if ('roundRect' in ctx && typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, cr);
  } else {
    ctx.moveTo(x + cr, y);
    ctx.lineTo(x + w - cr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
    ctx.lineTo(x + w, y + h - cr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
    ctx.lineTo(x + cr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - cr);
    ctx.lineTo(x, y + cr);
    ctx.quadraticCurveTo(x, y, x + cr, y);
    ctx.closePath();
  }
}

function roundRectPathIndividual(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  radii: [number, number, number, number],
): void {
  const [tl, tr, br, bl] = radii.map((r) => Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}
