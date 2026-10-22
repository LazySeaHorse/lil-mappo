import { Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HUB_SPOKE_TERMS } from '@/lib/terms';

/**
 * A place in a list of places, inside the box of a search field. `error` marks a place that
 * could not be found or routed, and `loading` shows its path being worked out.
 */
export const PlacePill = ({
  label,
  title,
  error,
  loading,
  onRemove,
  onHover,
}: {
  label: string;
  title?: string;
  error?: boolean;
  loading?: boolean;
  onRemove: () => void;
  onHover?: (hovering: boolean) => void;
}) => (
  <span
    title={title ?? label}
    onMouseEnter={() => onHover?.(true)}
    onMouseLeave={() => onHover?.(false)}
    className={cn(
      'ph-no-capture inline-flex h-6 max-w-[11rem] items-center gap-1 rounded-full pl-2 pr-0.5 text-xs font-medium',
      error ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-foreground',
    )}
  >
    <span className="truncate">{label}</span>
    {loading && <Loader2 size={11} aria-hidden="true" className="shrink-0 animate-spin opacity-70" />}
    <button
      type="button"
      onClick={onRemove}
      title={HUB_SPOKE_TERMS.removePlace}
      aria-label={`${HUB_SPOKE_TERMS.removePlace}: ${label}`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
    >
      <X size={11} />
    </button>
  </span>
);

/** The small "+" pill: it makes a field a list of places, and in a list it moves to the text box. */
export const AddPlacePill = ({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className={cn(
      'inline-flex h-6 shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/30 px-1.5 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary',
      className,
    )}
  >
    <Plus size={12} />
  </button>
);
