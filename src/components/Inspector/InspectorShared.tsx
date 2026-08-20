import React from 'react';
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorPicker } from '@/components/ui/color-picker';
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Pencil, Clock } from 'lucide-react';
import { cn } from "@/lib/utils";
import type { EasingName } from '@/store/types';
import { Field, SectionLabel, SwitchField } from "@/components/ui/field";

// Canonical re-exports from ui/
export { Field, SectionLabel, SwitchField };

export function EditableTitle({
  value,
  onChange,
  placeholder = "Item name..."
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full mb-3">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 px-3.5 pr-8 text-xs font-semibold bg-background/60 hover:bg-background/80 focus:bg-background border-border/50 rounded-xl transition-all shadow-xs placeholder:text-muted-foreground/60"
      />
      <Pencil size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
    </div>
  );
}

export function InputText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-xs"
    />
  );
}

export function InputNumber({ 
  value, 
  onChange, 
  min, 
  max, 
  step = 1 
}: { 
  value: number; 
  onChange: (v: number) => void; 
  min?: number; 
  max?: number; 
  step?: number 
}) {
  return (
    <Input
      type="number"
      value={isNaN(value) ? '' : value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="h-8 text-xs font-mono"
    />
  );
}

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
  className?: string;
}) {
  const displayVal = formatValue ? formatValue(value) : `${value}${unit ? ` ${unit}` : ''}`;
  return (
    <div className={cn("flex items-center justify-between gap-3 text-xs py-0.5", className)}>
      <span className="text-xs font-medium text-muted-foreground shrink-0 w-28 flex items-center gap-1.5 truncate">
        {icon && <span className="text-muted-foreground/70 shrink-0">{icon}</span>}
        <span className="truncate">{label}</span>
      </span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="flex-1 py-1"
      />
      <span className="text-xs font-mono text-muted-foreground shrink-0 w-14 text-right tabular-nums">
        {displayVal}
      </span>
    </div>
  );
}

export function ColorRow({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-xs py-0.5", className)}>
      <span className="text-xs font-medium text-muted-foreground shrink-0 w-28 truncate">{label}</span>
      <div className="flex-1">
        <ColorPicker value={value} onChange={onChange} />
      </div>
    </div>
  );
}

export function SwitchRow({
  label,
  checked,
  onChange,
  sublabel,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  sublabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1 px-0.5", className)}>
      <div className="flex flex-col pr-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {sublabel && <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">{sublabel}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
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

const EASING_OPTIONS: { value: EasingName; label: string }[] = [
  { value: 'easeInOutSine', label: 'Smooth' },
  { value: 'linear', label: 'Linear' },
  { value: 'easeInQuad', label: 'Ease In' },
  { value: 'easeOutQuad', label: 'Ease Out' },
  { value: 'easeInOutQuad', label: 'Ease In-Out' },
  { value: 'easeInOutCubic', label: 'Cubic' },
];

export function EasingSelect({ 
  value, 
  onChange,
  label = "Motion",
  icon
}: { 
  value?: EasingName; 
  onChange: (v: EasingName) => void;
  label?: string;
  icon?: React.ReactNode;
}) {
  const currentVal = value || 'easeInOutSine';
  return (
    <div className="flex items-center justify-between gap-3 text-xs py-0.5">
      <span className="text-xs font-medium text-muted-foreground shrink-0 w-28 flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground/70 shrink-0">{icon}</span>}
        <span>{label}</span>
      </span>
      <div className="flex-1">
        <Select value={currentVal} onValueChange={(v) => onChange(v as EasingName)}>
          <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50 rounded-lg w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EASING_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function TimingControls({
  startTime,
  endTime,
  onChangeTime,
  easing,
  onChangeEasing,
  exitAnimation,
  onChangeExitAnimation,
  showExitAnimation = false,
}: {
  startTime: number;
  endTime: number;
  onChangeTime: (start: number, end: number) => void;
  easing?: EasingName;
  onChangeEasing?: (v: EasingName) => void;
  exitAnimation?: 'none' | 'reverse' | 'fade';
  onChangeExitAnimation?: (v: 'none' | 'reverse' | 'fade') => void;
  showExitAnimation?: boolean;
}) {
  const duration = Math.max(0.1, +(endTime - startTime).toFixed(2));

  const handleStartChange = (newStart: number) => {
    const s = Math.max(0, newStart);
    onChangeTime(s, +(s + duration).toFixed(2));
  };

  const handleDurationChange = (newDur: number) => {
    const d = Math.max(0.1, newDur);
    onChangeTime(startTime, +(startTime + d).toFixed(2));
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 p-2 px-3 bg-secondary/30 rounded-xl border border-border/40">
          <span className="text-xs font-medium text-muted-foreground">Starts</span>
          <div className="relative flex items-center w-28">
            <Input
              type="number"
              value={isNaN(startTime) ? '' : startTime}
              onChange={(e) => handleStartChange(Number(e.target.value))}
              min={0}
              step={0.1}
              className="h-8 text-xs font-mono text-right pr-6 bg-background/60 border-border/40 rounded-lg"
            />
            <Clock size={12} className="absolute right-2 text-muted-foreground/60 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-2 px-3 bg-secondary/30 rounded-xl border border-border/40">
          <span className="text-xs font-medium text-muted-foreground">Duration</span>
          <div className="relative flex items-center w-28">
            <Input
              type="number"
              value={isNaN(duration) ? '' : duration}
              onChange={(e) => handleDurationChange(Number(e.target.value))}
              min={0.1}
              step={0.1}
              className="h-8 text-xs font-mono text-right pr-6 bg-background/60 border-border/40 rounded-lg"
            />
            <span className="absolute right-2 text-xs font-mono text-muted-foreground/60 pointer-events-none">s</span>
          </div>
        </div>
      </div>

      {onChangeEasing && (
        <EasingSelect value={easing} onChange={onChangeEasing} />
      )}

      {showExitAnimation && onChangeExitAnimation && (
        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
          <span className="text-xs font-medium text-muted-foreground shrink-0">When ends</span>
          <div className="flex-1 max-w-[200px]">
            <SegmentedControl
              options={[
                { value: 'none', label: 'Stay' },
                { value: 'reverse', label: 'Erase' },
                { value: 'fade', label: 'Fade' },
              ]}
              value={exitAnimation || 'none'}
              onValueChange={onChangeExitAnimation}
              className="h-7 text-[11px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export interface VisualCardOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  disabled?: boolean;
}

export function VisualCardSelect<T extends string>({
  options,
  value,
  onChange,
  columns = 4,
}: {
  options: VisualCardOption<T>[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
}) {
  const colClass = 
    columns === 2 ? "grid-cols-2" :
    columns === 3 ? "grid-cols-3" :
    "grid-cols-4";

  return (
    <div className={cn("grid gap-2 w-full", colClass)}>
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1.5 p-2 py-3 min-h-[58px] rounded-xl border text-center transition-all cursor-pointer select-none",
              isSelected
                ? "bg-primary/10 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/20"
                : "bg-secondary/40 hover:bg-secondary/70 border-border/40 text-muted-foreground hover:text-foreground",
              opt.disabled && "opacity-40 cursor-not-allowed pointer-events-none"
            )}
          >
            {opt.icon && (
              <div className={cn(
                "flex items-center justify-center transition-colors",
                isSelected ? "text-primary" : "text-muted-foreground/80"
              )}>
                {opt.icon}
              </div>
            )}
            <span className="text-[10px] font-semibold leading-tight text-center w-full block whitespace-normal break-words">{opt.label}</span>
            {opt.badge && (
              <span className="absolute top-1 right-1 text-[8px] bg-primary/20 text-primary px-1 py-0.2 rounded font-black tracking-wider uppercase">
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}


