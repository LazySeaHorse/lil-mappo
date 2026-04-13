import React from 'react';
import type { BoundaryItem } from '@/store/types';
import { Field, SwitchField } from '@/components/ui/field';
import { ColorPicker } from '@/components/ui/color-picker';
import { SliderField } from './InspectorShared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BoundaryStyleControlsProps {
  style: BoundaryItem['style'];
  onChange: (updates: Partial<BoundaryItem['style']>) => void;
}

export function BoundaryStyleControls({ style, onChange }: BoundaryStyleControlsProps) {
  return (
    <div className="space-y-4">
      <Field label="Stroke Color">
        <ColorPicker 
          value={style.strokeColor} 
          onChange={(v) => onChange({ strokeColor: v })} 
        />
      </Field>
      
      <SliderField 
        label="Stroke Width" 
        value={style.strokeWidth} 
        onChange={(v) => onChange({ strokeWidth: v })} 
        min={1} 
        max={15} 
        step={1} 
      />
      
      <SwitchField 
        checked={style.glow} 
        onChange={(v) => onChange({ glow: v })} 
        label="Glow" 
      />
      
      <SliderField 
        label="Fill Opacity" 
        value={style.fillOpacity} 
        onChange={(v) => onChange({ fillOpacity: v })} 
        min={0} 
        max={1} 
        step={0.01} 
      />
      
      <SwitchField 
        checked={style.animateStroke} 
        onChange={(v) => onChange({ animateStroke: v })} 
        label="Animate Stroke" 
      />
      
      {style.animateStroke && (
        <div className="space-y-3 mt-2 pl-2 border-l-2 border-primary/20">
          <Field label="Animation Style">
            <Select 
              value={style.animationStyle || 'draw'} 
              onValueChange={(v) => onChange({ animationStyle: v as any })} 
            >
              <SelectTrigger className="h-8 text-sm w-full bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fade">Fade (Basic)</SelectItem>
                <SelectItem value="draw">Draw (Perimeter)</SelectItem>
                <SelectItem value="trace">Trace (Comet)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          
          {style.animationStyle === 'trace' && (
            <SliderField 
              label="Trace Length" 
              value={style.traceLength || 0.1} 
              onChange={(v) => onChange({ traceLength: v })} 
              min={0.01} 
              max={0.5} 
              step={0.01} 
            />
          )}
        </div>
      )}
    </div>
  );
}
