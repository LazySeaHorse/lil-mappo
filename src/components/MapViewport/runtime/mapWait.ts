import type { Map as MapboxMap } from 'mapbox-gl';

export type MapIdleResult = 'idle' | 'timeout';

export interface WaitForMapIdleOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  waitForAnimationFrame?: boolean;
}

/**
 * Waits until Mapbox is ready to capture, without leaving event listeners or
 * timers behind when a timeout or cancellation wins the race.
 */
export function waitForMapIdle(
  map: MapboxMap,
  {
    timeoutMs = 5_000,
    signal,
    waitForAnimationFrame = true,
  }: WaitForMapIdleOptions = {},
): Promise<MapIdleResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Operation cancelled', 'AbortError'));
      return;
    }

    let settled = false;
    let listeningForIdle = false;
    let animationFrameId: number | null = null;

    const cleanup = () => {
      if (listeningForIdle) {
        map.off('idle', handleIdle);
        listeningForIdle = false;
      }
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

    const settleAfterPaint = () => {
      if (!waitForAnimationFrame) {
        settle('idle');
        return;
      }
      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        settle('idle');
      });
    };

    function handleIdle() {
      if (listeningForIdle) {
        map.off('idle', handleIdle);
        listeningForIdle = false;
      }
      settleAfterPaint();
    }

    function handleAbort() {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Operation cancelled', 'AbortError'));
    }

    const timeoutId = setTimeout(() => settle('timeout'), timeoutMs);
    signal?.addEventListener('abort', handleAbort, { once: true });

    if (map.loaded()) {
      settleAfterPaint();
    } else {
      listeningForIdle = true;
      map.on('idle', handleIdle);
    }
  });
}
