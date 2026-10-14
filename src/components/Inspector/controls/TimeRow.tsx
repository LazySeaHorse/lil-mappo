import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatTimelineTime, parseTimelineTime } from '@/components/Timeline/timelineTime';
import { PlayheadIcon } from '@/components/Timeline/PlayheadIcon';
import { TIMING_LABELS } from '@/lib/terms';
import { RowLabel } from './RowLabel';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';

/**
 * A field to read and edit a time as "mm:ss.cc", the way the timeline shows it,
 * with the label above it. The text is a draft while the user types. It is read when the field loses
 * focus or on Enter; text that is not a time is dropped.
 */
export function TimeRow({
  label,
  value,
  onChange,
  onUsePlayhead,
  className,
}: {
  label: string;
  /** Seconds. */
  value: number;
  onChange: (seconds: number) => void;
  /** Shows a playhead button inside the field, which calls this. */
  onUsePlayhead?: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseTimelineTime(draft);
    setDraft(null);
    if (parsed !== null) onChange(parsed);
  };

  return (
    <div data-slot="time-field" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <RowLabel label={label} />
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={draft ?? formatTimelineTime(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setDraft(null);
          }}
          className={cn(
            "h-8 w-full min-w-0 text-xs font-mono bg-background/60 border-border/40 rounded-lg",
            onUsePlayhead && "pr-8",
          )}
        />
        {onUsePlayhead && (
          <IconButton
            type="button"
            variant="ghost"
            size="xs"
            onClick={onUsePlayhead}
            aria-label={`${label}: ${TIMING_LABELS.usePlayhead}`}
            title={TIMING_LABELS.usePlayhead}
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md text-muted-foreground hover:text-primary"
          >
            <PlayheadIcon size={10} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
