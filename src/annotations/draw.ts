/**
 * Shared annotation drawing, used by both the live preview and the export
 * compositor so the two always produce identical pixels.
 *
 * Coordinate model: every style draws its scene around its own origin. The
 * origin sits at the ground point shifted by the callout offset and lifted by
 * the altitude. Styles that draw their own line to the ground (leader lines,
 * poles) find the ground point in `input.ground`; for the rest, draw runs a
 * generic connector from the origin down to the ground point.
 */

import type { CalloutItem, TimelineItem } from '@/store/types';
import type { AnnotationStyleDefinition, ConnectorConfig, SceneNode, StyleBounds, StyleRenderInput } from './types';
import { computePhase, evaluateTransition, SLIDE_DISTANCE, STYLE_ANIMATION } from './animation';
import { getStyle, validateSettings } from './registry';
import { preloadImage, renderScene } from './scene/renderer';
import { buildFont } from './scene/textMetrics';

/** Room around the measured style box for shadows, glow and overshoot. */
const EFFECT_PADDING = 24;
/** Screen-space altitude cap, matching the inspector slider range. */
export const MAX_ALTITUDE_PX = 300;

export interface FrameBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

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
  /**
   * Everything the callout can draw over its whole life, relative to the ground
   * point and padded for effects. Fixed for the callout, so the canvas never
   * resizes while it animates.
   */
  bounds: FrameBounds;
}

function formatCoordinates(lngLat: [number, number]): string {
  const [lng, lat] = lngLat;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

/**
 * The ground point as the style sees it. The scene is drawn scaled about the
 * origin, so dividing by the scale keeps the drawn ground point on the map.
 */
function groundInStyleSpace(originX: number, originY: number, scale: number): { x: number; y: number } {
  const safeScale = scale > 0 ? scale : 1;
  return { x: -originX / safeScale, y: -originY / safeScale };
}

interface Placement {
  style: AnnotationStyleDefinition;
  /** Origin position relative to the ground point. */
  originX: number;
  originY: number;
  /** Screen-space height the origin is lifted above the ground point. */
  altitude: number;
  lngLat: [number, number];
}

/** Where a callout's style origin sits, or null when it can't be shown (unplaced or unknown style). */
function placeCallout(callout: CalloutItem): Placement | null {
  const { binding } = callout;
  if (binding.kind !== 'geographic') return null;
  if (binding.lngLat[0] === 0 && binding.lngLat[1] === 0) return null;

  const style = getStyle(callout.styleId);
  if (!style) return null;

  const altitude = style.supportsAltitude === false
    ? 0
    : Math.max(0, Math.min(binding.altitude, MAX_ALTITUDE_PX));
  return {
    style,
    originX: callout.offset[0],
    originY: callout.offset[1] - altitude,
    altitude,
    lngLat: binding.lngLat,
  };
}

/** Input for the style's render and measure. `scale` is the total scale the scene is drawn at. */
function styleInput(
  callout: CalloutItem,
  placement: Placement,
  playheadTime: number,
  phase: StyleRenderInput['phase'],
  phaseProgress: number,
  scale: number,
): StyleRenderInput {
  return {
    content: {
      ...callout.content,
      eyebrow: callout.content.eyebrow || formatCoordinates(placement.lngLat),
    },
    settings: validateSettings(callout.styleId, callout.settings),
    phase,
    phaseProgress,
    ground: groundInStyleSpace(placement.originX, placement.originY, scale),
    itemTime: playheadTime - callout.startTime,
    playheadTime,
    pixelRatio: 1,
  };
}

/**
 * Resolves everything needed to draw a callout at a playhead time.
 * Returns null when the callout is not shown (outside its time window,
 * unplaced, or using an unknown style). A frame may still be fully transparent,
 * e.g. at the first instant of a fade-in.
 */
export function prepareAnnotationFrame(callout: CalloutItem, playheadTime: number): AnnotationFrame | null {
  const placement = placeCallout(callout);
  if (!placement) return null;

  const phaseResult = computePhase(
    callout.startTime,
    callout.endTime,
    callout.transition.enterDuration,
    callout.transition.exitDuration,
    playheadTime,
  );
  if (!phaseResult) return null;

  const { style, originX, originY } = placement;
  const { phase, progress } = phaseResult;
  const transitionName = phase === 'enter' ? callout.transition.enter : callout.transition.exit;
  const transition = evaluateTransition(transitionName, phase, progress);
  const scale = transition.scaleX * callout.scale;

  // The style plays its own entrance and exit only when it owns the transition;
  // under a block transition it draws its finished state and the block animates.
  const styleAnimates = transitionName === STYLE_ANIMATION;
  const input = styleAnimates
    ? styleInput(callout, placement, playheadTime, phase, progress, scale)
    : styleInput(callout, placement, playheadTime, 'visible', 1, scale);

  // Bounds cover the finished state, so the canvas never resizes mid-animation.
  const finished = styleInput(callout, placement, playheadTime, 'visible', 1, callout.scale);

  return {
    scene: style.render(input),
    opacity: transition.opacity * callout.opacity,
    scale,
    translateY: transition.translateY,
    originX,
    originY,
    connector: callout.connector.visible && placement.altitude > 0 && !style.drawsConnector
      ? callout.connector
      : null,
    bounds: calloutBounds(callout, style.measure(finished), originX, originY),
  };
}

/** Pads and positions a style's measured box, relative to the ground point. */
function calloutBounds(callout: CalloutItem, measured: StyleBounds, originX: number, originY: number): FrameBounds {
  const { scale } = callout;
  const blockSlides = callout.transition.enter !== STYLE_ANIMATION || callout.transition.exit !== STYLE_ANIMATION;
  const padX = EFFECT_PADDING * Math.max(scale, 1);
  const padY = padX + (blockSlides ? SLIDE_DISTANCE : 0);
  return {
    minX: originX + measured.x * scale - padX,
    minY: originY + measured.y * scale - padY,
    maxX: originX + (measured.x + measured.width) * scale + padX,
    maxY: originY + (measured.y + measured.height) * scale + padY,
  };
}

/**
 * Pixel bounds of everything a frame draws, relative to the ground point. Always
 * includes the ground point (and the connector's end dot around it).
 */
export function getFrameBounds(frame: AnnotationFrame): FrameBounds {
  const dotMargin = frame.connector
    ? Math.max(frame.connector.endDotRadius, frame.connector.width) + 1
    : 0;
  return {
    minX: Math.floor(Math.min(-dotMargin, frame.bounds.minX)),
    minY: Math.floor(Math.min(-dotMargin, frame.bounds.minY)),
    maxX: Math.ceil(Math.max(dotMargin, frame.bounds.maxX)),
    maxY: Math.ceil(Math.max(dotMargin, frame.bounds.maxY)),
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
    // The finished scene: an entrance may not have drawn all its text yet.
    const placement = placeCallout(item);
    if (!placement) continue;
    const time = (item.startTime + item.endTime) / 2;
    const scene = placement.style.render(styleInput(item, placement, time, 'visible', 1, item.scale));
    const assets = collectSceneAssets(scene);
    assets.fonts.forEach((f) => fonts.add(f));
    assets.images.forEach((src) => images.add(src));
  }
  await loadSceneAssets({ fonts: [...fonts], images: [...images] });
}
