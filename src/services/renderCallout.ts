import type { CalloutItem } from '@/store/types';

export interface CalloutAnimationState {
  opacity: number;
}

/** Compute fade in/out animation state. Returns null when callout is not visible. */
export function computeCalloutAnimation(callout: CalloutItem, playheadTime: number): CalloutAnimationState | null {
  if (playheadTime < callout.startTime || playheadTime > callout.endTime) return null;

  const enterEnd = callout.startTime + callout.animation.enterDuration;
  const exitStart = callout.endTime - callout.animation.exitDuration;

  let opacity = 1;

  if (playheadTime < enterEnd) {
    const p = Math.min((playheadTime - callout.startTime) / callout.animation.enterDuration, 1);
    opacity = p;
  } else if (playheadTime > exitStart) {
    const p = Math.min((playheadTime - exitStart) / callout.animation.exitDuration, 1);
    opacity = 1 - p;
  }

  return { opacity };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, cr);
  } else {
    ctx.moveTo(x + cr, y);
    ctx.lineTo(x + w - cr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
    ctx.lineTo(x + w, y + h - cr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
    ctx.lineTo(x + cr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + cr);
    ctx.quadraticCurveTo(x, y, x + cr, y);
    ctx.closePath();
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Draw a callout onto a Canvas 2D context.
 *
 * @param ctx              The compositing canvas context.
 * @param callout          The callout item from the project store.
 * @param anim             Pre-computed animation state (opacity, scale, translateY).
 * @param pos              Projected screen position of the callout's lngLat.
 * @param altitudeOffset   Upward pixel offset derived from callout.altitude.
 */
export function renderCalloutToCanvas(
  ctx: CanvasRenderingContext2D,
  callout: CalloutItem,
  anim: CalloutAnimationState,
  pos: { x: number; y: number },
  altitudeOffset = 0,
): void {
  if (anim.opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = anim.opacity;

  // --- Pole line + dot at map anchor point ---
  if (callout.poleVisible && altitudeOffset > 0) {
    ctx.save();
    ctx.strokeStyle = callout.poleColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - altitudeOffset);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = anim.opacity * 0.8;
    ctx.fillStyle = callout.poleColor;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Card anchor point (bottom-center)
  const anchorX = pos.x;
  const anchorY = pos.y - altitudeOffset;

  const variant = callout.style.variant || 'default';
  switch (variant) {
    case 'modern': renderModern(ctx, callout, anchorX, anchorY); break;
    case 'news':   renderNews(ctx, callout, anchorX, anchorY);   break;
    case 'topo':   renderTopo(ctx, callout, anchorX, anchorY);   break;
    default:       renderDefault(ctx, callout, anchorX, anchorY); break;
  }

  ctx.restore();
}

// ─── Variant renderers ────────────────────────────────────────────────────────

/** Rounded rect card + title text. Mirrors CalloutCard variant 'default'. */
function renderDefault(
  ctx: CanvasRenderingContext2D,
  callout: CalloutItem,
  anchorX: number,
  anchorY: number,
) {
  const fontFamily = callout.style.fontFamily || 'Outfit';
  ctx.font = `600 14px '${fontFamily}', sans-serif`;

  const textWidth = ctx.measureText(callout.title).width;
  const padH = 12, padV = 8;
  const cardW = Math.min(textWidth + padH * 2, callout.style.maxWidth);
  const cardH = 14 * 1.4 + padV * 2;
  const cardX = anchorX - cardW / 2;
  const cardY = anchorY - cardH;

  // Background (with optional shadow)
  ctx.save();
  if (callout.style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
  }
  ctx.fillStyle = callout.style.bgColor;
  roundRect(ctx, cardX, cardY, cardW, cardH, callout.style.borderRadius);
  ctx.fill();
  ctx.restore();

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, callout.style.borderRadius);
  ctx.stroke();

  // Text
  ctx.fillStyle = callout.style.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(callout.title, anchorX, cardY + cardH / 2, cardW - padH * 2);
}

/** Pill shape + accent glow dot. Mirrors CalloutCard variant 'modern'. */
function renderModern(
  ctx: CanvasRenderingContext2D,
  callout: CalloutItem,
  anchorX: number,
  anchorY: number,
) {
  const fontFamily = callout.style.fontFamily || 'Outfit';
  ctx.font = `700 14px '${fontFamily}', sans-serif`;

  const textWidth = ctx.measureText(callout.title).width;
  const dotR = 5; // 10px diameter
  const gap = 10;
  const padH = 18, padV = 8;
  const cardW = dotR * 2 + gap + textWidth + padH * 2;
  const cardH = Math.max(dotR * 2, 14 * 1.2) + padV * 2;
  const pillR = cardH / 2;
  const cardX = anchorX - cardW / 2;
  const cardY = anchorY - cardH;

  // Background (87% opacity) with optional shadow
  ctx.save();
  if (callout.style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = hexWithAlpha(callout.style.bgColor, 0.87);
  roundRect(ctx, cardX, cardY, cardW, cardH, pillR);
  ctx.fill();
  ctx.restore();

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, pillR);
  ctx.stroke();

  // Accent dot with glow
  const dotX = cardX + padH + dotR;
  const dotY = cardY + cardH / 2;
  ctx.save();
  ctx.shadowColor = callout.style.accentColor;
  ctx.shadowBlur = 12;
  ctx.fillStyle = callout.style.accentColor;
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Text
  ctx.fillStyle = callout.style.textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(callout.title, cardX + padH + dotR * 2 + gap, dotY);
}

/** Full-opacity rect + left accent bar + uppercase bold text. Mirrors CalloutCard variant 'news'. */
function renderNews(
  ctx: CanvasRenderingContext2D,
  callout: CalloutItem,
  anchorX: number,
  anchorY: number,
) {
  const fontFamily = callout.style.fontFamily || 'Outfit';
  ctx.font = `900 16px '${fontFamily}', sans-serif`;

  const text = callout.title.toUpperCase();
  const textWidth = ctx.measureText(text).width;
  const padH = 16, padV = 8;
  const accentBarW = 5;
  const cardW = textWidth + padH * 2 + accentBarW;
  const cardH = 16 * 1.2 + padV * 2;
  const cardX = anchorX - cardW / 2;
  const cardY = anchorY - cardH;

  // Background with optional shadow
  ctx.save();
  if (callout.style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
  }
  ctx.fillStyle = callout.style.bgColor;
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.restore();

  // Left accent bar
  ctx.fillStyle = callout.style.accentColor;
  ctx.fillRect(cardX, cardY, accentBarW, cardH);

  // Text
  ctx.fillStyle = callout.style.textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cardX + accentBarW + padH, cardY + cardH / 2);
}

/**
 * Left border + coordinates/elevation metadata + uppercase title + accent dot.
 * Mirrors CalloutCard variant 'topo'.
 */
function renderTopo(
  ctx: CanvasRenderingContext2D,
  callout: CalloutItem,
  anchorX: number,
  anchorY: number,
) {
  const fontFamily = callout.style.fontFamily || 'Outfit';
  const showMeta = callout.style.showMetadata;

  const coordText = `${callout.lngLat[1].toFixed(4)}° N, ${callout.lngLat[0].toFixed(4)}° W`;
  const elevText  = `ELEV: ${Math.round(callout.altitude)}ft`;
  const titleText = callout.title.toUpperCase();

  // Measure each line to determine card width
  ctx.font = `700 14px '${fontFamily}', sans-serif`;
  const titleW = ctx.measureText(titleText).width;
  let metaTopW = 0, metaBottomW = 0;
  if (showMeta) {
    ctx.font = `700 9px '${fontFamily}', sans-serif`;
    metaTopW = ctx.measureText(coordText).width;
    ctx.font = `400 10px '${fontFamily}', sans-serif`;
    metaBottomW = ctx.measureText(elevText).width;
  }

  const padLeft = 12, padRight = 8, padV = 4;
  const contentW = Math.max(titleW, metaTopW, metaBottomW);
  const cardW = 1 + padLeft + contentW + padRight; // 1px left border + content + right pad

  // Compute height
  let cardH = padV;
  if (showMeta) cardH += 9 + 4;   // coord line + gap
  cardH += 14 * 1.3;               // title
  if (showMeta) cardH += 4 + 1 + 4 + 10; // gap + divider + gap + elev line
  cardH += padV;

  const cardX = anchorX - cardW / 2;
  const cardY = anchorY - cardH;

  // Left border
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX, cardY);
  ctx.lineTo(cardX, cardY + cardH);
  ctx.stroke();

  let y = cardY + padV;
  const textX = cardX + 1 + padLeft;

  // Coordinates (metadata top)
  if (showMeta) {
    ctx.font = `700 9px '${fontFamily}', sans-serif`;
    ctx.fillStyle = callout.style.accentColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(coordText, textX, y);
    y += 9 + 4;
  }

  // Title
  ctx.font = `700 14px '${fontFamily}', sans-serif`;
  ctx.fillStyle = callout.style.textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(titleText, textX, y);
  y += 14 * 1.3;

  // Elevation (metadata bottom)
  if (showMeta) {
    y += 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textX, y);
    ctx.lineTo(cardX + cardW, y);
    ctx.stroke();
    y += 1 + 4;

    ctx.font = `400 10px '${fontFamily}', sans-serif`;
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.fillStyle = callout.style.textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(elevText, textX, y);
    ctx.restore();
  }

  // Accent dot (small square) at bottom-left of card — matches absolute-positioned div in DOM
  ctx.strokeStyle = callout.style.accentColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(cardX - 2, cardY + cardH - 2, 4, 4);
}
