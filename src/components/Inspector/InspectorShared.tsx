import React from 'react';
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EasingName } from '@/store/types';

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-4 mb-2 px-1">{children}</h3>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 px-1">
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

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

export function InputNumber({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
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

export function InputColor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2.5 w-full">
      <div 
        className="relative shrink-0 w-8 h-8 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] border border-white/10 dark:border-white/5 overflow-hidden cursor-pointer ring-1 ring-border/50"
        style={{ backgroundColor: value }}
      >
        <input 
          type="color" 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          className="opacity-0 absolute -inset-2 w-12 h-12 cursor-pointer" 
        />
      </div>
      <Input 
        type="text" 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className="flex-1 h-8 font-mono text-[11px] uppercase tracking-wider bg-background/50 focus-visible:ring-1 focus-visible:ring-offset-0 placeholder:text-muted-foreground" 
      />
    </div>
  );
}

export function SliderField({ value, onChange, min, max, step = 0.1, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string }) {
  return (
    <Field label={`${label}: ${value}`}>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} className="w-full py-1" />
    </Field>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group rounded p-1.5 hover:bg-secondary/50 transition-colors">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-xs font-medium text-foreground group-hover:text-foreground/80">{label}</span>
    </label>
  );
}

export function PremiumLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70 mb-2.5 px-1">{children}</h3>;
}

export function EasingSelect({ value, onChange }: { value: EasingName; onChange: (v: EasingName) => void }) {
  const options: EasingName[] = ['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'easeInOutSine'];
  return (
    <Field label="Easing">
      <Select value={value} onValueChange={(v) => onChange(v as EasingName)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}
