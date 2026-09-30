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
import type { AnnotationContent, AnnotationStyleDefinition, ConnectorConfig, SceneNode, StyleBounds, StyleRenderInput } from './types';
import { computePhase, evaluateTransition, SLIDE_DISTANCE, STYLE_ANIMATION } from './animation';
import { getStyle, validateSettings } from './registry';
import { resolveCalloutSizing } from './sizing';
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
  /** Final scale: transition × callout size × pixel scale. */
  scale: number;
  /** Vertical slide from the transition, in output pixels. */
  translateY: number;
  /** Output pixels per editor pixel this frame was prepared for. */
  pixelScale: number;
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

/** The content a style renders: an empty eyebrow becomes the coordinates for styles that opt in. */
function withEyebrowFallback(content: AnnotationContent, placement: Placement): AnnotationContent {
  if (placement.style.eyebrowFallback !== 'coordinates' || content.eyebrow) return content;
  return { ...content, eyebrow: formatCoordinates(placement.lngLat) };
}

/**
 * The ground point as the style sees it. The scene is drawn scaled about the
 * origin, so dividing by the scale keeps the drawn ground point on the map.
 */
function groundInStyleSpace(originX: number, originY: number, scale: number): { x: number; y: number } {
  const safeScale = scale > 0 ? scale : 1;
  return { x: -originX / safeScale, y: -originY / safeScale };
}

/** How a frame is viewed. Omitted, it is drawn as the editor shows it at 1x. */
export interface FrameOptions {
  /**
   * The zoom the editor would show. An export subtracts its zoom offset from the
   * map zoom. Only callouts sized with the map depend on it.
   */
  viewZoom?: number;
  /**
   * Output pixels per editor pixel. Exports render the map larger than the
   * editor, so everything drawn scales along with it to keep the same framing.
   */
  pixelScale?: number;
  /**
   * Draw the settled, fully entered state whatever the time, instead of the
   * animation at the playhead. For showing a callout that is off the playhead.
   */
  settled?: boolean;
}

/** The phase a settled frame is drawn in. */
const SETTLED_PHASE = { phase: 'visible', progress: 1 } as const;

interface Placement {
  style: AnnotationStyleDefinition;
  /** Origin position relative to the ground point. */
  originX: number;
  originY: number;
  /** Height the origin is lifted above the ground point, in output pixels. */
  altitude: number;
  lngLat: [number, number];
}

/**
 * Where a callout's style origin sits, or null when it can't be shown (unplaced
 * or unknown style). `distanceScale` converts the offset and altitude, which are
 * editor pixels, to the pixels the frame is drawn in.
 */
function placeCallout(callout: CalloutItem, distanceScale: number): Placement | null {
  const { binding } = callout;
  if (binding.kind !== 'geographic') return null;
  if (binding.lngLat[0] === 0 && binding.lngLat[1] === 0) return null;

  const style = getStyle(callout.styleId);
  if (!style) return null;

  const altitude = style.supportsAltitude === false
    ? 0
    : Math.max(0, Math.min(binding.altitude, MAX_ALTITUDE_PX)) * distanceScale;
  return {
    style,
    originX: callout.offset[0] * distanceScale,
    originY: callout.offset[1] * distanceScale - altitude,
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
    content: withEyebrowFallback(callout.content, placement),
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
 * unplaced, using an unknown style, or a map-sized callout too small to see).
 * A frame may still be fully transparent, e.g. at the first instant of a fade-in.
 */
export function prepareAnnotationFrame(
  callout: CalloutItem,
  playheadTime: number,
  { viewZoom, pixelScale = 1, settled = false }: FrameOptions = {},
): AnnotationFrame | null {
  const sizing = resolveCalloutSizing(callout, viewZoom);
  if (!sizing) return null;

  const placement = placeCallout(callout, sizing.placement * pixelScale);
  if (!placement) return null;

  const { enterDuration, exitDuration } = callout.transition;
  const phaseResult = settled
    ? SETTLED_PHASE
    : computePhase(callout.startTime, callout.endTime, enterDuration, exitDuration, playheadTime);
  if (!phaseResult) return null;
  // A settled frame is drawn from the moment the entrance has finished.
  const time = settled ? Math.min(callout.startTime + enterDuration, callout.endTime) : playheadTime;

  const { style, originX, originY } = placement;
  const { phase, progress } = phaseResult;
  const transitionName = phase === 'enter' ? callout.transition.enter : callout.transition.exit;
  const transition = evaluateTransition(transitionName, phase, progress);
  const baseScale = sizing.scale * pixelScale;
  const scale = transition.scaleX * baseScale;

  // The style plays its own entrance and exit only when it owns the transition;
  // under a block transition it draws its finished state and the block animates.
  const styleAnimates = transitionName === STYLE_ANIMATION;
  const input = styleAnimates
    ? styleInput(callout, placement, time, phase, progress, scale)
    : styleInput(callout, placement, time, 'visible', 1, scale);

  // Bounds cover the finished state, so the canvas never resizes mid-animation.
  const finished = styleInput(callout, placement, time, 'visible', 1, baseScale);

  return {
    scene: style.render(input),
    opacity: transition.opacity * callout.opacity * sizing.fade,
    scale,
    translateY: transition.translateY * pixelScale,
    pixelScale,
    originX,
    originY,
    connector: callout.connector.visible && placement.altitude > 0 && !style.drawsConnector
      ? callout.connector
      : null,
    bounds: calloutBounds(callout, style.measure(finished), originX, originY, sizing.scale, pixelScale),
  };
}

/**
 * Pads and positions a style's measured box, relative to the ground point.
 * `size` is the artwork's scale in editor pixels and `pixelScale` converts to output pixels.
 */
function calloutBounds(
  callout: CalloutItem,
  measured: StyleBounds,
  originX: number,
  originY: number,
  size: number,
  pixelScale: number,
): FrameBounds {
  const scale = size * pixelScale;
  const blockSlides = callout.transition.enter !== STYLE_ANIMATION || callout.transition.exit !== STYLE_ANIMATION;
  const padX = EFFECT_PADDING * Math.max(size, 1) * pixelScale;
  const padY = padX + (blockSlides ? SLIDE_DISTANCE * pixelScale : 0);
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
    ? (Math.max(frame.connector.endDotRadius, frame.connector.width) + 1) * frame.pixelScale
    : 0;
  return {
    minX: Math.floor(Math.min(-dotMargin, frame.bounds.minX)),
    minY: Math.floor(Math.min(-dotMargin, frame.bounds.minY)),
    maxX: Math.ceil(Math.max(dotMargin, frame.bounds.maxX)),
    maxY: Math.ceil(Math.max(dotMargin, frame.bounds.maxY)),
  };
}

function applyDash(ctx: CanvasRenderingContext2D, style: ConnectorConfig['style'], pixelScale: number): void {
  if (style === 'dashed') ctx.setLineDash([4 * pixelScale, 2 * pixelScale]);
  else if (style === 'dotted') ctx.setLineDash([2 * pixelScale, 2 * pixelScale]);
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
    ctx.lineWidth = connector.width * frame.pixelScale;
    applyDash(ctx, connector.style, frame.pixelScale);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(groundX, groundY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (connector.endDot) {
      ctx.globalAlpha = frame.opacity * 0.8;
      ctx.fillStyle = connector.color;
      ctx.beginPath();
      ctx.arc(groundX, groundY, connector.endDotRadius * frame.pixelScale, 0, Math.PI * 2);
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
    else if (node.type === 'text') fonts.add(buildFont(node.fontSize, node.fontFamily, node.fontWeight ?? 400, node.fontStyle));
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
    const placement = placeCallout(item, 1);
    if (!placement) continue;
    const time = (item.startTime + item.endTime) / 2;
    const scene = placement.style.render(styleInput(item, placement, time, 'visible', 1, item.scale));
    const assets = collectSceneAssets(scene);
    assets.fonts.forEach((f) => fonts.add(f));
    assets.images.forEach((src) => images.add(src));
  }
  await loadSceneAssets({ fonts: [...fonts], images: [...images] });
}
