import { Loader2 } from 'lucide-react';
import { formatDateRangeLong } from '@/engine/historicalDate';
import { HISTORICAL_TERMS } from '@/lib/terms';
import type { BoundaryVersion } from '@/store/types';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const rangeOf = (version: BoundaryVersion) => formatDateRangeLong(version.startDate, version.endDate) || HISTORICAL_TERMS.undated;

/**
 * Picks which period of a historical place to show. The periods are listed
 * oldest first, so the newest is last (the one a pick starts with). A place
 * with one period shows its range as plain text instead. `notes` are the
 * remarks OpenHistoricalMap makes about the chosen period; they show in the
 * field's (i) tip.
 */
export function HistoricalPeriodPicker({
  versions,
  value,
  onChange,
  notes = [],
  loading = false,
}: {
  versions: readonly BoundaryVersion[];
  /** `osmId` of the chosen period. */
  value: string;
  onChange: (osmId: string) => void;
  notes?: readonly string[];
  /** A period is downloading: the field is locked and shows a spinner. */
  loading?: boolean;
}) {
  const hint = notes.length > 0 ? HISTORICAL_TERMS.notes(notes) : undefined;
  const chosen = versions.find((v) => v.osmId === value);

  return (
    <Field label={HISTORICAL_TERMS.period} hint={hint} className="mb-0">
      {versions.length > 1 ? (
        <div className="flex items-center gap-2">
          <Select value={value} onValueChange={onChange} disabled={loading}>
            <SelectTrigger
              aria-label={HISTORICAL_TERMS.period}
              className="h-9 flex-1 text-xs transition-all bg-secondary/20 border-transparent focus:border-border/50 rounded-lg"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/50 shadow-2xl">
              {versions.map((version) => (
                <SelectItem key={version.osmId} value={version.osmId} className="text-xs">
                  {rangeOf(version)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label={HISTORICAL_TERMS.loading} />}
        </div>
      ) : (
        <p className="text-xs text-foreground">{chosen ? rangeOf(chosen) : ''}</p>
      )}
    </Field>
  );
}
