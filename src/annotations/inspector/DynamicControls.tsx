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
import { FlagPicker } from '@/components/Inspector/FlagPicker';
import { Disclosure } from '@/components/Inspector/controls/Disclosure';
import { ACCENT_TERMS } from '@/lib/terms';
import { MAP_FONTS } from '@/constants/fonts';
import { accentControls, accentSettings } from '@/annotations/accent';

interface DynamicControlsProps {
  controls: ControlDefinition[];
  settings: Record<string, unknown>;
  /** Settings to change, by key. One call is one undo step. */
  onUpdate: (changes: Record<string, unknown>) => void;
}

type ColorControl = Extract<ControlDefinition, { type: 'color' }>;

/**
 * The controls of a style. Accent colors collapse into one "Accent color" row
 * that sets them all (it shows the first one's value). The style's other
 * colors then sit behind "Customize colors", closed by default.
 */
export function DynamicControls({ controls, settings, onUpdate }: DynamicControlsProps) {
  const accents = accentControls(controls);
  const colors = controls.filter((c): c is ColorControl => c.type === 'color' && c.role !== 'accent');
  // Without an accent every color shows as before.
  const foldColors = accents.length > 0;
  const plain = controls.filter((c) => c.type !== 'color' || (!foldColors && c.role !== 'accent'));

  const renderControl = (control: ControlDefinition) => {
    const value = settings[control.key];
    const set = (v: unknown) => onUpdate({ [control.key]: v });

    switch (control.type) {
      case 'color':
        return (
          <ColorRow
            key={control.key}
            label={control.label}
            value={(value as string) || '#000000'}
            onChange={set}
          />
        );

      case 'slider':
        return (
          <SliderRow
            key={control.key}
            label={control.label}
            value={(value as number) ?? control.min}
            onChange={set}
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
            onChange={set}
          />
        );

      case 'select':
        return (
          <SelectRow
            key={control.key}
            label={control.label}
            value={(value as string) ?? control.options[0]?.value ?? ''}
            onChange={set}
            options={control.options}
          />
        );

      case 'font':
        return (
          <SelectRow
            key={control.key}
            label={control.label}
            value={(value as string) || 'Outfit'}
            onChange={set}
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
              onChange={(e) => set(e.target.value)}
              placeholder={control.placeholder}
              className="w-full h-8 px-2.5 text-xs bg-secondary/20 border border-transparent rounded-md focus:border-border/50 transition-all outline-none"
            />
          </div>
        );

      case 'flag':
        return (
          <div key={control.key} className="space-y-1">
            <label className="text-xs text-muted-foreground">{control.label}</label>
            <FlagPicker value={(value as string) || null} onChange={set} />
            {!!value && (
              <button
                type="button"
                onClick={() => set('')}
                className="text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Remove the country flag
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      {accents.length > 0 && (
        <ColorRow
          label={ACCENT_TERMS.accent}
          value={(settings[accents[0].key] as string) || '#000000'}
          onChange={(v) => onUpdate(accentSettings(accents, v))}
        />
      )}
      {plain.map(renderControl)}
      {foldColors && colors.length > 0 && (
        <Disclosure label={ACCENT_TERMS.customize}>{colors.map(renderControl)}</Disclosure>
      )}
    </div>
  );
}
