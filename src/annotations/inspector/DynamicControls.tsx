/**
 * Dynamic inspector controls generated from style definitions.
 *
 * Instead of hardcoding variant-conditional controls, this component
 * renders controls from the style's `controls` array.
 */

import React from 'react';
import type { ControlDefinition } from '@/annotations/types';
import {
  SliderRow,
  ColorRow,
  SwitchRow,
  SelectRow,
} from '@/components/Inspector/InspectorShared';
import { MAP_FONTS } from '@/constants/fonts';

interface DynamicControlsProps {
  controls: ControlDefinition[];
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
}

export function DynamicControls({ controls, settings, onUpdate }: DynamicControlsProps) {
  return (
    <div className="flex flex-col gap-3.5">
      {controls.map((control) => {
        const value = settings[control.key];

        switch (control.type) {
          case 'color':
            return (
              <ColorRow
                key={control.key}
                label={control.label}
                value={(value as string) || '#000000'}
                onChange={(v) => onUpdate(control.key, v)}
              />
            );

          case 'slider':
            return (
              <SliderRow
                key={control.key}
                label={control.label}
                value={(value as number) ?? control.min}
                onChange={(v) => onUpdate(control.key, v)}
                min={control.min}
                max={control.max}
                step={control.step}
                unit={control.unit}
              />
            );

          case 'switch':
            return (
              <SwitchRow
                key={control.key}
                label={control.label}
                checked={!!value}
                onChange={(v) => onUpdate(control.key, v)}
              />
            );

          case 'select':
            return (
              <SelectRow
                key={control.key}
                label={control.label}
                value={(value as string) ?? control.options[0]?.value ?? ''}
                onChange={(v) => onUpdate(control.key, v)}
                options={control.options}
              />
            );

          case 'font':
            return (
              <SelectRow
                key={control.key}
                label={control.label}
                value={(value as string) || 'Outfit'}
                onChange={(v) => onUpdate(control.key, v)}
                options={MAP_FONTS.map((f) => ({ value: f, label: f, style: { fontFamily: f } }))}
                renderOption={(o) => <span style={{ fontFamily: o.value }}>{o.label}</span>}
              />
            );

          case 'text-input':
            return (
              <div key={control.key} className="space-y-1">
                <label className="text-xs text-muted-foreground">{control.label}</label>
                <input
                  type="text"
                  value={(value as string) || ''}
                  onChange={(e) => onUpdate(control.key, e.target.value)}
                  placeholder={control.placeholder}
                  className="w-full h-8 px-2.5 text-xs bg-secondary/20 border border-transparent rounded-md focus:border-border/50 transition-all outline-none"
                />
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
