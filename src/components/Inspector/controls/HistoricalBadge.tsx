import { History } from 'lucide-react';
import { formatDateRange } from '@/engine/historicalDate';
import { placeSpan } from '@/engine/historicalSource';
import { HISTORICAL_TERMS } from '@/lib/terms';
import type { BoundaryVersion } from '@/store/types';
import { InfoTip } from './InfoTip';

/**
 * The small "history icon + 1701–1918" pill on a historical search result. It
 * is a button with a tooltip (hover, keyboard focus, tap) that says how many
 * periods the place has and where the outlines come from. The range is the
 * whole span of the place, from its earliest start to its latest end.
 */
export function HistoricalBadge({ versions }: { versions: readonly BoundaryVersion[] }) {
  const { startDate, endDate } = placeSpan(versions);
  const range = formatDateRange(startDate, endDate);
  return (
    <InfoTip
      text={HISTORICAL_TERMS.badgeTip(versions.length, range)}
      label={HISTORICAL_TERMS.badge(range)}
      className="h-5 gap-1 rounded-full bg-secondary/60 px-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground focus-visible:text-foreground"
    >
      <History size={11} aria-hidden="true" />
      {range && <span className="tabular-nums">{range}</span>}
    </InfoTip>
  );
}
