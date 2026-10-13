import { CircleCheck, CircleDot, TriangleAlert } from 'lucide-react';
import { useWorkingDraftStatus } from '@/hooks/useWorkingDraftStatus';
import type { DraftSaveStatus } from '@/services/workingProjectDraft';
import { cn } from '@/lib/utils';

const ICONS = {
  saved: CircleCheck,
  saving: CircleDot,
  error: TriangleAlert,
} as const satisfies Record<DraftSaveStatus['state'], unknown>;

/**
 * Shows whether the autosave has the latest changes. Icon only (with a tooltip) in the
 * toolbar next to undo and redo; with `showLabel` it also writes the status out.
 */
export function AutosaveStatus({ iconSize = 14, showLabel = false }: { iconSize?: number; showLabel?: boolean }) {
  const { status, label } = useWorkingDraftStatus();
  const Icon = ICONS[status.state];

  return (
    <span
      role="status"
      title={label}
      aria-label={showLabel ? undefined : label}
      data-autosave={status.state}
      className={cn(
        'inline-flex shrink-0 items-center transition-colors',
        showLabel ? 'gap-1.5' : 'h-8 w-5 justify-center',
        status.state === 'error' ? 'text-destructive' : 'text-muted-foreground/60',
      )}
    >
      <Icon size={iconSize} aria-hidden />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
