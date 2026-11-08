import { MIXED_VALUE } from '@/lib/terms';

/** Beside a control's label, says the selected clips hold different values here. */
export function MixedTag() {
  return <span className="text-2xs font-normal text-muted-foreground">{MIXED_VALUE}</span>;
}
