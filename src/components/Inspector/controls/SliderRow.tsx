import React from 'react';
import { Slider } from "@/components/ui/slider";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { RowLabel } from './RowLabel';

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
  /** One muted line of help text under the row. */
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
      <div className="flex items-start justify-between gap-3">
        <RowLabel label={label} icon={icon} className="w-28 h-6 truncate" />
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
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
        {showValue && (
          <span className="flex h-6 items-center justify-end text-xs font-mono text-muted-foreground shrink-0 w-14 tabular-nums">
            {displayVal}
          </span>
        )}
      </div>
      {hint && (
        <p data-slot="slider-hint" className="text-[11px] leading-tight text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SliderField({ 
  value, 
  onChange, 
  min, 
  max, 
  step = 0.1, 
  label 
}: { 
  value: number; 
  onChange: (v: number) => void; 
  min: number; 
  max: number; 
  step?: number; 
  label: string 
}) {
  return (
    <Field label={`${label}: ${value}`}>
      <Slider 
        min={min} 
        max={max} 
        step={step} 
        value={[value]} 
        onValueChange={([v]) => onChange(v)} 
        className="w-full py-1" 
      />
    </Field>
  );
}
