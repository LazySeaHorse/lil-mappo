import { useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useSubscription } from '@/hooks/useSubscription';
import { getExportLimits, type ExportLimits } from '@/lib/cloudAccess';

export interface DurationResult {
  /** The length that was written. */
  seconds: number;
  /** True when the plan limit cut the length down. */
  clamped: boolean;
}

/** Cuts a length down to the longest video the plan allows. */
export function clampDuration(seconds: number, limits: Pick<ExportLimits, 'maxDuration'>): DurationResult {
  const capped = Math.min(seconds, limits.maxDuration);
  return { seconds: capped, clamped: capped < seconds };
}

/**
 * The one way to read and change the video length. The settings panel and the
 * timeline header both use it, so the plan limit applies the same in both.
 */
export function useProjectDuration() {
  const duration = useProjectStore((s) => s.duration);
  const storeSetDuration = useProjectStore((s) => s.setDuration);
  const { data: subscription } = useSubscription();
  const limits = getExportLimits(subscription);

  const setDuration = useCallback(
    (seconds: number): DurationResult => {
      const result = clampDuration(seconds, limits);
      storeSetDuration(result.seconds);
      return result;
    },
    [limits, storeSetDuration],
  );

  return { duration, maxDuration: limits.maxDuration, limited: limits.limited, setDuration };
}
