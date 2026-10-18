import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useProjectDuration } from '@/hooks/useProjectDuration';
import { DURATION_TERMS } from '@/lib/terms';
import { formatTimelineTime, parseTimelineTime } from './timelineTime';

/**
 * The total length of the video, shown in the timeline header. Click it to type
 * a new length ("1:30" or "90"). Enter or leaving the field applies it, Escape
 * cancels. It writes through `useProjectDuration`, like the settings panel, so
 * the same plan limit applies.
 */
export function VideoLengthControl() {
  const { duration, setDuration } = useProjectDuration();
  const [draft, setDraft] = useState<string | null>(null);
  // Escape closes the field; the blur that follows must not apply the text.
  const cancelled = useRef(false);

  const finish = (apply: boolean) => {
    if (draft === null) return;
    const text = draft;
    setDraft(null);
    if (!apply) return;
    const seconds = parseTimelineTime(text);
    if (seconds === null) return;
    const result = setDuration(seconds);
    if (result.clamped) toast.info(DURATION_TERMS.limit(result.seconds));
  };

  if (draft === null) {
    const length = formatTimelineTime(duration);
    return (
      <button
        type="button"
        title={DURATION_TERMS.change}
        aria-label={`${DURATION_TERMS.change} (${length})`}
        onClick={() => {
          cancelled.current = false;
          setDraft(length);
        }}
        // Space and Enter press the button; the timeline shortcuts must not also play or step.
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
        }}
        className="rounded px-0.5 -mx-0.5 opacity-50 transition hover:bg-secondary hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {length}
      </button>
    );
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={DURATION_TERMS.change}
      title={DURATION_TERMS.change}
      value={draft}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(!cancelled.current)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(true);
        if (event.key === 'Escape') {
          cancelled.current = true;
          finish(false);
        }
      }}
      className="h-4 w-[4.5rem] rounded border border-border/60 bg-background/80 px-1 text-2xs font-mono tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring/60"
    />
  );
}
