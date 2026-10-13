import { cn } from '@/lib/utils';
import { RowLabel } from './RowLabel';

/** A label with a value the user can read but not change. */
export function ReadoutRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 p-2 px-3 rounded-xl border border-dashed border-border/40", className)}>
      <RowLabel label={label} />
      <span className="text-xs font-mono text-foreground/80 tabular-nums">{value}</span>
    </div>
  );
}
