import React from 'react';
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { RowLabel } from './RowLabel';
import { InfoTip } from './InfoTip';

export function SliderRow({
  label,
  icon,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  unit = '',
  formatValue,
  onReset,
  logarithmic = false,
  hint,
  endLabels,
  showValue = true,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  formatValue?: (v: number) => string;
  /** Called on double-click, to return the slider to its default. */
  onReset?: () => void;
  /** Spreads a range spanning orders of magnitude evenly; `min` must be positive. */
  logarithmic?: boolean;
  /** Short help. It shows in an (i) tip right after the label. */
  hint?: string;
  /** Words under the left and right ends of the slider, e.g. ["Calm", "Lively"]. */
  endLabels?: readonly [string, string];
  /** Set to false to hide the number, usually when `endLabels` say enough. */
  showValue?: boolean;
  className?: string;
}) {
  const displayVal = formatValue ? formatValue(value) : `${value}${unit ? ` ${unit}` : ''}`;
  // A log slider runs over ln(value); its values snap back to `step` on the way out.
  const toSlider = (v: number) => (logarithmic ? Math.log(Math.max(min, v)) : v);
  const fromSlider = (v: number) =>
    logarithmic ? Math.min(max, Math.max(min, Math.round(Math.exp(v) / step) * step)) : v;
  return (
    <div className={cn("flex flex-col gap-1 text-xs py-0.5", className)}>
      <div data-slot="slider-top-line" className="flex min-h-5 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <RowLabel label={label} icon={icon} className="min-w-0 shrink" />
          {hint && <InfoTip text={hint} />}
        </div>
        {showValue && (
          <span className="shrink-0 text-xs font-mono text-muted-foreground tabular-nums">{displayVal}</span>
        )}
      </div>
      <Slider
        min={toSlider(min)}
        max={toSlider(max)}
        step={logarithmic ? (toSlider(max) - toSlider(min)) / 500 : step}
        value={[toSlider(value)]}
        onValueChange={([v]) => onChange(fromSlider(v))}
        onDoubleClick={onReset}
        title={onReset ? 'Double-click to reset' : undefined}
        className="py-1"
      />
      {endLabels && (
        <div data-slot="slider-end-labels" className="flex justify-between text-[10px] leading-none text-muted-foreground">
          <span>{endLabels[0]}</span>
          <span>{endLabels[1]}</span>
        </div>
      )}
    </div>
  );
}
