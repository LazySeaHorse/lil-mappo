import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MapPillProps {
  /** Icon or status dot before the label. */
  leading: ReactNode;
  /** The label. It truncates when the pill runs out of room. */
  children: ReactNode;
  onClick: () => void;
  /** Tooltip of the label button. */
  title?: string;
  /** Adds a close button after the label. */
  dismiss?: { label: string; onClick: () => void };
  testId?: string;
}

/**
 * The look shared by every pill under the top bar: a frosted capsule whose
 * label is one button, with an optional close button. Where it sits is up to
 * `MapStatusPills`; when it shows is up to the pill that uses it.
 */
export function MapPill({ leading, children, onClick, title, dismiss, testId }: MapPillProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-border/50 bg-background/85 py-1 pl-3 text-xs font-medium text-foreground shadow-lg shadow-black/10 backdrop-blur-xl',
        dismiss ? 'pr-1.5' : 'pr-3',
      )}
    >
      <button
        type="button"
        title={title}
        onClick={onClick}
        className="flex min-w-0 items-center gap-2 py-0.5 transition-colors hover:text-primary"
      >
        {leading}
        <span className="truncate">{children}</span>
      </button>
      {dismiss && (
        <button
          type="button"
          aria-label={dismiss.label}
          title={dismiss.label}
          onClick={dismiss.onClick}
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-secondary/80 hover:text-foreground"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
