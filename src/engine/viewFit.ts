import { framePadding, type FrameLayout } from '@/engine/mapFraming';

/** A rectangle in the map container's pixels. */
export interface FitFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The free area between the panels, as the fit card: the toolbar on top, the timeline below, the
 * inspector on the right and the screen edge on the left. Always sized as if the inspector is
 * open, so the card does not jump when the inspector toggles.
 */
export function fitCard(
  container: { width: number; height: number },
  layout: FrameLayout,
  timelineHeight: number,
): FitFrame | null {
  if (!(container.width > 0) || !(container.height > 0)) return null;
  const pad = framePadding(container, layout, { isInspectorOpen: true, timelineHeight });
  const width = container.width - pad.left - pad.right;
  const height = container.height - pad.top - pad.bottom;
  return width > 0 && height > 0 ? { x: pad.left, y: pad.top, width, height } : null;
}

/** The largest rectangle with the video's aspect ratio, centred in the card. */
export function fitFrame(
  container: { width: number; height: number },
  aspect: number,
  layout: FrameLayout,
  timelineHeight: number,
): FitFrame | null {
  const card = fitCard(container, layout, timelineHeight);
  if (!card || !(aspect > 0) || !Number.isFinite(aspect)) return null;
  const width = Math.min(card.width, card.height * aspect);
  const height = width / aspect;
  return { x: card.x + (card.width - width) / 2, y: card.y + (card.height - height) / 2, width, height };
}
