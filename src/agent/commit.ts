import {
  beginGesture,
  endGesture,
  isGestureActive,
  withHistoryLabel,
  withHistorySource,
} from '@/store/history';

/**
 * Runs all of a tool's store writes as ONE undo step, tagged source 'ai' with
 * the given label. Synchronous by design: do fetches first, then call this.
 * (zundo records one step per store write, so the writes are coalesced with a
 * gesture; the label and source are applied when the step is recorded.)
 */
export function commitAiWrite<T>(label: string, fn: () => T): T {
  return withHistorySource('ai', () =>
    withHistoryLabel(label, () => {
      beginGesture();
      try {
        return fn();
      } finally {
        endGesture();
      }
    }),
  );
}

/** True while the user is mid-drag; AI writes would be folded into their step. */
export function isUserGestureActive(): boolean {
  return isGestureActive();
}
