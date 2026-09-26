/**
 * Animation phase calculation and transition evaluation for annotations.
 *
 * Replaces src/engine/calloutAnimation.ts with:
 * - Same enter/visible/exit phase logic (backward-compatible)
 * - Extended StyleRenderInput construction for continuous animations
 */

import type { CalloutItem } from '@/store/types';
import type { StyleRenderInput, AnnotationContent } from './types';
import { getStyle } from './registry';

/**
 * Compute the animation phase and progress for a callout at a given playhead time.
 * Returns null if the callout is not within its time window.
 */
export function computePhase(
  startTime: number,
  endTime: number,
  enterDuration: number,
  exitDuration: number,
  playheadTime: number,
): { phase: 'enter' | 'visible' | 'exit'; progress: number } | null {
  if (playheadTime < startTime || playheadTime > endTime) return null;

  const enterEnd = startTime + enterDuration;
  const exitStart = endTime - exitDuration;

  if (playheadTime < enterEnd && enterDuration > 0) {
    return {
      phase: 'enter',
      progress: Math.min((playheadTime - startTime) / enterDuration, 1),
    };
  } else if (playheadTime > exitStart && exitDuration > 0) {
    return {
      phase: 'exit',
      progress: Math.min((playheadTime - exitStart) / exitDuration, 1),
    };
  }

  return { phase: 'visible', progress: 1 };
}

/**
 * Apply a transition to compute opacity and transform values.
 * Returns opacity and a CSS-like transform string.
 */
export function evaluateTransition(
  transitionName: string,
  phase: 'enter' | 'visible' | 'exit',
  progress: number,
): { opacity: number; scaleX: number; scaleY: number; translateY: number } {
  const isEntering = phase === 'enter';
  const isExiting = phase === 'exit';
  const p = Math.min(progress, 1);

  let opacity = 1;
  let scale = 1;
  let translateY = 0;

  if (isEntering) {
    switch (transitionName) {
      case 'fade':
        opacity = p;
        break;
      case 'scale-up':
        opacity = p;
        scale = 0.5 + 0.5 * p;
        break;
      case 'slide-up':
        opacity = p;
        translateY = 20 * (1 - p);
        break;
      default:
        opacity = p;
        break;
    }
  } else if (isExiting) {
    switch (transitionName) {
      case 'fade':
        opacity = 1 - p;
        break;
      case 'scale-down':
        opacity = 1 - p;
        scale = 1 - 0.5 * p;
        break;
      case 'slide-down':
        opacity = 1 - p;
        translateY = 20 * p;
        break;
      default:
        opacity = 1 - p;
        break;
    }
  }

  return { opacity, scaleX: scale, scaleY: scale, translateY };
}

/**
 * Build a full StyleRenderInput from a CalloutItem and playhead time.
 * Returns null if the callout is not visible at this time.
 */
export function buildRenderInput(
  callout: CalloutItem,
  playheadTime: number,
  pixelRatio = 1,
): StyleRenderInput | null {
  const phaseResult = computePhase(
    callout.startTime,
    callout.endTime,
    callout.transition.enterDuration,
    callout.transition.exitDuration,
    playheadTime,
  );

  if (!phaseResult) return null;

  return {
    content: callout.content,
    settings: callout.settings,
    phase: phaseResult.phase,
    phaseProgress: phaseResult.progress,
    itemTime: playheadTime - callout.startTime,
    playheadTime,
    pixelRatio,
  };
}

/**
 * Compute the overall opacity for a callout at a given time.
 * Convenience for export pipeline — returns 0 when not visible.
 */
export function computeOpacity(callout: CalloutItem, playheadTime: number): number {
  const phaseResult = computePhase(
    callout.startTime,
    callout.endTime,
    callout.transition.enterDuration,
    callout.transition.exitDuration,
    playheadTime,
  );

  if (!phaseResult) return 0;

  const transition = phaseResult.phase === 'enter'
    ? callout.transition.enter
    : callout.transition.exit;

  return evaluateTransition(transition, phaseResult.phase, phaseResult.progress).opacity;
}
