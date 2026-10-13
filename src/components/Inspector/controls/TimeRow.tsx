import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatTimelineTime, parseTimelineTime } from '@/components/Timeline/timelineTime';
import { RowLabel } from './RowLabel';
import { Input } from '@/components/ui/input';

/**
 * A row to read and edit a time as "mm:ss.cc", the way the timeline shows it.
 * The text is a draft while the user types. It is read when the field loses
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
  /** Sits right of the field, e.g. a button. */
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
    <div className={cn("flex items-center justify-between gap-3 p-2 px-3 bg-secondary/30 rounded-xl border border-border/40", className)}>
      <RowLabel label={label} />
      <div className="flex items-center gap-2 min-w-0">
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
          className="h-8 w-[5.5rem] text-xs font-mono text-right bg-background/60 border-border/40 rounded-lg"
        />
        {action}
      </div>
    </div>
  );
}
