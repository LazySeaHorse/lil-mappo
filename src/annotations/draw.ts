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

import type { CalloutItem } from '@/store/types';
import type { ConnectorConfig, SceneNode } from './types';
import { computePhase, evaluateTransition } from './animation';
import { getStyle, validateSettings } from './registry';
import { renderScene } from './scene/renderer';

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
 * Returns null when the callout is hidden (outside its time window, fully
 * transparent, unplaced, or using an unknown style).
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
  if (opacity <= 0) return null;

  const input = {
    content: {
      ...callout.content,
      eyebrow: callout.content.eyebrow || formatCoordinates(binding.lngLat),
    },
    settings: validateSettings(callout.styleId, callout.settings),
    phase,
    phaseProgress: progress,
    itemTime: playheadTime - callout.startTime,
    playheadTime,
    pixelRatio: 1,
  };

  const altitude = style.supportsAltitude === false
    ? 0
    : Math.max(0, Math.min(binding.altitude, MAX_ALTITUDE_PX));
  const scale = transition.scaleX * callout.scale;
  const measured = style.measure(input);

  return {
    scene: style.render(input),
    opacity,
    scale,
    translateY: transition.translateY,
    originX: callout.offset[0],
    originY: callout.offset[1] - altitude,
    connector: callout.connector.visible && altitude > 0 ? callout.connector : null,
    extent: (Math.max(measured.width, measured.height) + EFFECT_PADDING) * Math.max(scale, 1)
      + Math.abs(transition.translateY),
  };
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
