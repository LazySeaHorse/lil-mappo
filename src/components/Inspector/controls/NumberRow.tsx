import React from 'react';
import { cn } from "@/lib/utils";
import { RowLabel } from './RowLabel';
import { InputNumber } from './inputs';

export function NumberRow({
  label,
  icon,
  value,
  onChange,
  min,
  max,
  step = 1,
  precision,
  unit,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  /** Shown inside the input's right edge: a unit like "s", or an icon. */
  unit?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 p-2 px-3 bg-secondary/30 rounded-xl border border-border/40", className)}>
      <RowLabel label={label} icon={icon} />
      <div className="relative flex items-center w-28">
        <InputNumber
          aria-label={label}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          precision={precision}
          className={cn("text-right bg-background/60 border-border/40 rounded-lg", unit && "pr-6")}
        />
        {unit && (
          <span className="absolute right-2 text-xs font-mono text-muted-foreground/60 pointer-events-none">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
