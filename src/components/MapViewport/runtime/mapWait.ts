import type { Map as MapboxMap, MapSourceDataEvent } from 'mapbox-gl';

export type MapIdleResult = 'idle' | 'timeout';

export interface WaitForMapIdleOptions {
  /** How long to wait before giving up with `'timeout'`. */
  timeoutMs?: number;
  /**
   * Restarts the time limit each time a tile arrives, so a slow connection gets
   * as long as it keeps making progress and only a stalled one times out.
   */
  extendWhileLoading?: boolean;
  /** Rejects with the signal's reason when aborted. */
  signal?: AbortSignal;
  waitForAnimationFrame?: boolean;
}

/**
 * Waits until Mapbox is ready to capture, without leaving event listeners or
 * timers behind when a timeout or cancellation wins the race.
 *
 * Resolves `'timeout'` only when tiles are still loading as the time runs out.
 * A map whose tiles are all in but which never reports idle (a layer that keeps
 * repainting), or one that went idle but whose paint frame never came, is as
 * complete as it will get, so it resolves `'idle'`.
 */
export function waitForMapIdle(
  map: MapboxMap,
  {
    timeoutMs = 5_000,
    extendWhileLoading = false,
    signal,
    waitForAnimationFrame = true,
  }: WaitForMapIdleOptions = {},
): Promise<MapIdleResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }

    let settled = false;
    let listeningForIdle = false;
    let listeningForTiles = false;
    let animationFrameId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const stopListening = () => {
      if (listeningForIdle) {
        map.off('idle', handleIdle);
        listeningForIdle = false;
      }
      if (listeningForTiles) {
        map.off('sourcedata', handleSourceData);
        listeningForTiles = false;
      }
    };

    const cleanup = () => {
      stopListening();
      clearTimeout(timeoutId);
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      signal?.removeEventListener('abort', handleAbort);
    };

    const settle = (result: MapIdleResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    // The timer keeps running through the paint: a background tab may never deliver the frame.
    const settleAfterPaint = () => {
      stopListening();
      if (!waitForAnimationFrame) {
        settle('idle');
        return;
      }
      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        settle('idle');
      });
    };

    const startTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleTimeout, timeoutMs);
    };

    function handleTimeout() {
      const paintPending = animationFrameId !== null;
      settle(paintPending || map.areTilesLoaded() ? 'idle' : 'timeout');
    }

    function handleIdle() {
      settleAfterPaint();
    }

    function handleSourceData(event: MapSourceDataEvent) {
      if (event.tile) startTimer();
    }

    function handleAbort() {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortReason(signal!));
    }

    startTimer();
    signal?.addEventListener('abort', handleAbort, { once: true });

    if (map.loaded()) {
      settleAfterPaint();
      return;
    }
    listeningForIdle = true;
    map.on('idle', handleIdle);
    if (extendWhileLoading) {
      listeningForTiles = true;
      map.on('sourcedata', handleSourceData);
    }
  });
}

/** The signal's own reason (a caller can abort with a specific error), else a plain AbortError. */
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Operation cancelled', 'AbortError');
}
