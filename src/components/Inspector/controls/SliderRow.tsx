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
  className?: string;
}) {
  const displayVal = formatValue ? formatValue(value) : `${value}${unit ? ` ${unit}` : ''}`;
  // A log slider runs over ln(value); its values snap back to `step` on the way out.
  const toSlider = (v: number) => (logarithmic ? Math.log(Math.max(min, v)) : v);
  const fromSlider = (v: number) =>
    logarithmic ? Math.min(max, Math.max(min, Math.round(Math.exp(v) / step) * step)) : v;
  return (
    <div className={cn("flex items-center justify-between gap-3 text-xs py-0.5", className)}>
      <RowLabel label={label} icon={icon} className="w-28 truncate" />
      <Slider
        min={toSlider(min)}
        max={toSlider(max)}
        step={logarithmic ? (toSlider(max) - toSlider(min)) / 500 : step}
        value={[toSlider(value)]}
        onValueChange={([v]) => onChange(fromSlider(v))}
        onDoubleClick={onReset}
        title={onReset ? 'Double-click to reset' : undefined}
        className="flex-1 py-1"
      />
      <span className="text-xs font-mono text-muted-foreground shrink-0 w-14 text-right tabular-nums">
        {displayVal}
      </span>
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
