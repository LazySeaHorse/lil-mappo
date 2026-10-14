import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatTimelineTime, parseTimelineTime } from '@/components/Timeline/timelineTime';
import { RowLabel } from './RowLabel';
import { Input } from '@/components/ui/input';

/**
 * A field to read and edit a time as "mm:ss.cc", the way the timeline shows it,
 * with the label above it. The text is a draft while the user types. It is read when the field loses
 * focus or on Enter; text that is not a time is dropped.
 */
export function TimeRow({
  label,
  value,
  onChange,
  action,
  className,
}: {
  label: string;
  /** Seconds. */
  value: number;
  onChange: (seconds: number) => void;
  /** Sits under the field, e.g. a button. */
  action?: React.ReactNode;
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
        className="h-8 w-full min-w-0 text-xs font-mono bg-background/60 border-border/40 rounded-lg"
      />
      {action}
    </div>
  );
}
