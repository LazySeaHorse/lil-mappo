import { cn } from '@/lib/utils';

/** The playhead marker of the timeline ruler. Buttons that use the playhead time show it too. */
export function PlayheadIcon({ size = 11, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={(size * 12) / 11}
      viewBox="0 0 11 12"
      aria-hidden="true"
      className={cn('fill-current', className)}
    >
      <path d="M0 0 H11 V6 L5.5 12 L0 6 Z" />
    </svg>
  );
}
