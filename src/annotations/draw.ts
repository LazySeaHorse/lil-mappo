/**
 * Shared annotation drawing, used by both the live preview and the export
 * compositor so the two always produce identical pixels.
 *
 * Coordinate model: every style draws its scene around its own origin, and the
 * origin is the style's anchor (cards and pins put their bottom-centre there,
 * dots and rings put their centre there). The origin sits at the ground point
 * shifted by the callout offset and lifted by the altitude; the connector runs
 * from the origin down to the ground point.
 */

import type { CalloutItem, TimelineItem } from '@/store/types';
import type { ConnectorConfig, SceneNode } from './types';
import { computePhase, evaluateTransition, STYLE_ANIMATION } from './animation';
import { getStyle, validateSettings } from './registry';
import { preloadImage, renderScene } from './scene/renderer';
import { buildFont } from './scene/textMetrics';

/** Room around the measured style box for shadows and glow. */
const EFFECT_PADDING = 24;
/** Screen-space altitude cap, matching the inspector slider range. */
export const MAX_ALTITUDE_PX = 300;

export interface AnnotationFrame {
  scene: SceneNode;
  /** Final opacity: transition × callout opacity. */
  opacity: number;
  /** Final scale: transition × callout scale. */
  scale: number;
  /** Vertical slide from the transition, in pixels. */
  translateY: number;
  /** Origin position relative to the ground point. */
  originX: number;
  originY: number;
  /** Connector to draw from the origin to the ground point, if any. */
  connector: ConnectorConfig | null;
  /** Half-size of a square around the origin that contains the whole scene. */
  extent: number;
}

export interface FrameBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function formatCoordinates(lngLat: [number, number]): string {
  const [lng, lat] = lngLat;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

/**
 * Resolves everything needed to draw a callout at a playhead time.
 * Returns null when the callout is not shown (outside its time window,
 * unplaced, or using an unknown style). A frame may still be fully transparent,
 * e.g. at the first instant of a fade-in.
 */
export function prepareAnnotationFrame(callout: CalloutItem, playheadTime: number): AnnotationFrame | null {
  const { binding } = callout;
  if (binding.kind !== 'geographic') return null;
  if (binding.lngLat[0] === 0 && binding.lngLat[1] === 0) return null;

  const phaseResult = computePhase(
    callout.startTime,
    callout.endTime,
    callout.transition.enterDuration,
    callout.transition.exitDuration,
    playheadTime,
  );
  if (!phaseResult) return null;

  const style = getStyle(callout.styleId);
  if (!style) return null;

  const { phase, progress } = phaseResult;
  const transitionName = phase === 'enter' ? callout.transition.enter : callout.transition.exit;
  const transition = evaluateTransition(transitionName, phase, progress);
  const opacity = transition.opacity * callout.opacity;

  const altitude = style.supportsAltitude === false
    ? 0
    : Math.max(0, Math.min(binding.altitude, MAX_ALTITUDE_PX));
  const originX = callout.offset[0];
  const originY = callout.offset[1] - altitude;
  const scale = transition.scaleX * callout.scale;
  // The style plays its own entrance and exit only when it owns the transition.
  const styleAnimates = transitionName === STYLE_ANIMATION;

  const input = {
    content: {
      ...callout.content,
      eyebrow: callout.content.eyebrow || formatCoordinates(binding.lngLat),
    },
    settings: validateSettings(callout.styleId, callout.settings),
    phase: styleAnimates ? phase : 'visible' as const,
    phaseProgress: styleAnimates ? progress : 1,
    ground: groundInStyleSpace(originX, originY, scale),
    itemTime: playheadTime - callout.startTime,
    playheadTime,
    pixelRatio: 1,
  };

  // Bounds are for the finished state, so the canvas never resizes mid-animation.
  const measured = style.measure({
    ...input,
    phase: 'visible',
    phaseProgress: 1,
    ground: groundInStyleSpace(originX, originY, callout.scale),
  });

  return {
    scene: style.render(input),
    opacity,
    scale,
    translateY: transition.translateY,
    originX,
    originY,
    connector: callout.connector.visible && altitude > 0 && !style.drawsConnector ? callout.connector : null,
    extent: (Math.max(measured.width, measured.height) + EFFECT_PADDING) * Math.max(scale, 1)
      + Math.abs(transition.translateY),
  };
}

/**
 * The ground point as the style sees it. The scene is drawn scaled about the
 * origin, so dividing by the scale keeps the drawn ground point on the map.
 */
function groundInStyleSpace(originX: number, originY: number, scale: number): { x: number; y: number } {
  const safeScale = scale > 0 ? scale : 1;
  return { x: -originX / safeScale, y: -originY / safeScale };
}

/** Bounds of everything a frame draws, relative to the ground point. */
export function getFrameBounds(frame: AnnotationFrame): FrameBounds {
  const dotMargin = frame.connector
    ? Math.max(frame.connector.endDotRadius, frame.connector.width) + 1
    : 0;
  return {
    minX: Math.floor(Math.min(-dotMargin, frame.originX - frame.extent)),
    minY: Math.floor(Math.min(-dotMargin, frame.originY - frame.extent)),
    maxX: Math.ceil(Math.max(dotMargin, frame.originX + frame.extent)),
    maxY: Math.ceil(Math.max(dotMargin, frame.originY + frame.extent)),
  };
}

function applyDash(ctx: CanvasRenderingContext2D, style: ConnectorConfig['style']): void {
  if (style === 'dashed') ctx.setLineDash([4, 2]);
  else if (style === 'dotted') ctx.setLineDash([2, 2]);
  else ctx.setLineDash([]);
}

/** Draws a prepared frame with its ground point at (groundX, groundY). */
export function drawAnnotationFrame(
  ctx: CanvasRenderingContext2D,
  frame: AnnotationFrame,
  groundX: number,
  groundY: number,
): void {
  const originX = groundX + frame.originX;
  const originY = groundY + frame.originY;

  ctx.save();
  ctx.globalAlpha = frame.opacity;

  if (frame.connector) {
    const connector = frame.connector;
    ctx.save();
    ctx.strokeStyle = connector.color;
    ctx.lineWidth = connector.width;
    applyDash(ctx, connector.style);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(groundX, groundY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (connector.endDot) {
      ctx.globalAlpha = frame.opacity * 0.8;
      ctx.fillStyle = connector.color;
      ctx.beginPath();
      ctx.arc(groundX, groundY, connector.endDotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.translate(originX, originY + frame.translateY);
  ctx.scale(frame.scale, frame.scale);
  renderScene(ctx, frame.scene);
  ctx.restore();
}

export interface SceneAssets {
  /** CSS font shorthands used by text nodes, e.g. "600 14px 'Outfit', sans-serif". */
  fonts: string[];
  /** Image URLs used by image nodes. */
  images: string[];
}

/** Fonts and images a scene needs before it can be drawn faithfully. */
export function collectSceneAssets(scene: SceneNode): SceneAssets {
  const fonts = new Set<string>();
  const images = new Set<string>();
  const visit = (node: SceneNode) => {
    if (node.type === 'group') node.children.forEach(visit);
    else if (node.type === 'text') fonts.add(buildFont(node.fontSize, node.fontFamily, node.fontWeight ?? 400));
    else if (node.type === 'image') images.add(node.src);
  };
  visit(scene);
  return { fonts: [...fonts], images: [...images] };
}

/**
 * Loads the given fonts and images. Canvas text does not trigger web font
 * downloads by itself, and images load asynchronously, so both must be ready
 * before drawing frames that should look final. Failures are ignored: the
 * renderer falls back to system fonts and image placeholders.
 */
export async function loadSceneAssets({ fonts, images }: SceneAssets): Promise<void> {
  const fontLoads = typeof document !== 'undefined' && document.fonts
    ? fonts.map((font) => document.fonts.load(font).catch(() => []))
    : [];
  const imageLoads = images.map((src) => preloadImage(src).catch(() => null));
  await Promise.all([...fontLoads, ...imageLoads]);
}

/** Loads every font and image the project's callouts draw, for export. */
export async function loadAnnotationAssets(
  items: Record<string, TimelineItem>,
  itemOrder: string[],
): Promise<void> {
  const fonts = new Set<string>();
  const images = new Set<string>();
  for (const id of itemOrder) {
    const item = items[id];
    if (item?.kind !== 'callout') continue;
    // Mid-point of the time window: fully entered, so the scene is complete.
    const frame = prepareAnnotationFrame(item, (item.startTime + item.endTime) / 2);
    if (!frame) continue;
    const assets = collectSceneAssets(frame.scene);
    assets.fonts.forEach((f) => fonts.add(f));
    assets.images.forEach((src) => images.add(src));
  }
  await loadSceneAssets({ fonts: [...fonts], images: [...images] });
}
