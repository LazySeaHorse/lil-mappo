/**
 * Export renderer for annotations.
 *
 * Replaces the old renderCalloutToCanvas and compositeFrame callout loop.
 * Uses the same style registry and scene renderer as the preview layer.
 */

import type { Map as MapboxMap } from 'mapbox-gl';
import type { CalloutItem, TimelineItem } from '@/store/types';
import type { StyleRenderInput } from '@/annotations/types';
import { computePhase, evaluateTransition } from '@/annotations/animation';
import { getStyle } from '@/annotations/registry';
import { renderScene } from '@/annotations/scene/renderer';

/**
 * Render a single annotation onto the export compositing canvas.
 * This replaces renderCalloutToCanvas from the old system.
 */
export function renderAnnotationToCanvas(
  ctx: CanvasRenderingContext2D,
  callout: CalloutItem,
  playheadTime: number,
  pos: { x: number; y: number },
  altitudeOffset = 0,
): void {
  // Calculate phase
  const phaseResult = computePhase(
    callout.startTime,
    callout.endTime,
    callout.transition.enterDuration,
    callout.transition.exitDuration,
    playheadTime,
  );
  if (!phaseResult) return;

  const { phase, progress } = phaseResult;
  const transitionName = phase === 'enter' ? callout.transition.enter : callout.transition.exit;
  const transition = evaluateTransition(transitionName, phase, progress);

  if (transition.opacity <= 0) return;

  // Look up style
  const style = getStyle(callout.styleId);
  if (!style) return;

  const effectiveAltitude = style.supportsAltitude === false ? 0 : altitudeOffset;

  // Enrich content with geographic metadata
  const enrichedContent = { ...callout.content };
  if (callout.binding.kind === 'geographic') {
    const lat = callout.binding.lngLat[1];
    const lng = callout.binding.lngLat[0];
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lng >= 0 ? 'E' : 'W';
    if (!enrichedContent.eyebrow) {
      enrichedContent.eyebrow = `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
    }
  }

  // Build render input
  const renderInput: StyleRenderInput = {
    content: enrichedContent,
    settings: callout.settings,
    phase,
    phaseProgress: progress,
    itemTime: playheadTime - callout.startTime,
    playheadTime,
    pixelRatio: 1,
  };

  // Render scene
  const scene = style.render(renderInput);

  // Draw connector first (below card)
  const anchorX = pos.x + callout.offset[0];
  const anchorY = pos.y - effectiveAltitude + callout.offset[1];

  ctx.save();
  ctx.globalAlpha = transition.opacity * callout.opacity;

  if (callout.connector.visible && effectiveAltitude > 0) {
    ctx.save();
    ctx.strokeStyle = callout.connector.color;
    ctx.lineWidth = callout.connector.width;
    switch (callout.connector.style) {
      case 'dashed':
        ctx.setLineDash([4, 2]);
        break;
      case 'dotted':
        ctx.setLineDash([2, 2]);
        break;
      default:
        ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (callout.connector.endDot) {
      ctx.globalAlpha = transition.opacity * callout.opacity * 0.8;
      ctx.fillStyle = callout.connector.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, callout.connector.endDotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw the annotation scene
  ctx.save();
  ctx.globalAlpha = transition.opacity * callout.opacity;
  ctx.translate(anchorX, anchorY);
  ctx.translate(0, transition.translateY);
  ctx.scale(transition.scaleX * callout.scale, transition.scaleY * callout.scale);

  renderScene(ctx, scene);
  ctx.restore();

  ctx.restore();
}

/**
 * Render all annotations for a frame onto the compositing canvas.
 * Replaces the callout loop in compositeFrame.
 */
export function compositeAnnotations(
  map: MapboxMap,
  ctx: CanvasRenderingContext2D,
  items: Record<string, TimelineItem>,
  itemOrder: string[],
  playheadTime: number,
): void {
  for (const id of itemOrder) {
    const item = items[id];
    if (item?.kind !== 'callout') continue;
    const callout = item as CalloutItem;

    if (callout.binding.kind !== 'geographic') continue;
    const lngLat = callout.binding.lngLat;
    if (lngLat[0] === 0 && lngLat[1] === 0) continue;

    const projected = map.project(lngLat);

    let altitudeOffset = 0;
    const style = getStyle(callout.styleId);
    if (style?.supportsAltitude !== false && callout.binding.altitude > 0) {
      altitudeOffset = Math.min(callout.binding.altitude, 300);
    }

    renderAnnotationToCanvas(
      ctx,
      callout,
      playheadTime,
      { x: projected.x, y: projected.y },
      altitudeOffset,
    );
  }
}
