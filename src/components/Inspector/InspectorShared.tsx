import React from 'react';
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EasingName } from '@/store/types';
import { Field } from "@/components/ui/field";

// Canonical re-exports from ui/ — prefer importing from ui/ directly in new code
export { Field, SectionLabel, SwitchField } from "@/components/ui/field";
export { SectionLabel as PremiumLabel } from "@/components/ui/field";
export { SwitchField as Toggle } from "@/components/ui/field";
export { ColorPicker as InputColor } from "@/components/ui/color-picker";

// Previous SectionTitle, Field, InputColor, Toggle, PremiumLabel bodies removed 
// as they are now canonical re-exports from ui/ primitives.

// Inspector-specific helpers (kept here)
export function InputText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-sm"
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
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="h-8 text-sm font-mono"
    />
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

export function EasingSelect({ value, onChange }: { value: EasingName; onChange: (v: EasingName) => void }) {
  const options: EasingName[] = [
    'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 
    'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'easeInOutSine'
  ];
  return (
    <Field label="Easing">
      <Select value={value} onValueChange={(v) => onChange(v as EasingName)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}
