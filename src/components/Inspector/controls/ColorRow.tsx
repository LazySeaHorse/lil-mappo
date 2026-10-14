import React from 'react';
import { ColorPicker } from '@/components/ui/color-picker';
import { cn } from "@/lib/utils";
import { RowLabel } from './RowLabel';
import { InfoTip } from './InfoTip';

/** A color control: the label (and optional (i) tip) on top, the swatches below. */
export function ColorRow({
  label,
  value,
  onChange,
  presets,
  hint,
  action,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets?: readonly string[] | string[];
  /** Short help. It shows in an (i) tip right after the label. */
  hint?: string;
  /** Extra control next to the swatches, e.g. a Reset button. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-xs py-0.5", className)}>
      <div data-slot="color-row-label" className="flex min-w-0 items-center gap-1">
        <RowLabel label={label} className="min-w-0 shrink" />
        {hint && <InfoTip text={hint} />}
      </div>
      <div className="flex items-center gap-2">
        <ColorPicker value={value} onChange={onChange} presets={presets} className="min-w-0 flex-1" />
        {action}
      </div>
    </div>
  );
}
