/**
 * Style picker for the callout inspector and the add-callout panel.
 *
 * One row: a picture of the style drawn by the real renderer, its name and a
 * Change button. Change opens `StylePickerDialog`, where the current style and
 * the one being looked at play side by side.
 */

import React, { useState } from 'react';
import { getStyle } from '@/annotations/registry';
import { STYLE_TERMS } from '@/lib/terms';
import { StylePickerDialog } from './StylePickerDialog';
import { StylePreview } from './StylePreview';

/** Longest sample text drawn in a preview. */
const SAMPLE_TEXT_LIMIT = 24;

interface StylePickerProps {
  value: string;
  onChange: (styleId: string) => void;
  /** The callout's own title; the pictures show it. */
  title?: string;
  /** The callout's own subtitle; the dialog's previews show it. */
  subtitle?: string;
}

export function StylePicker({ value, onChange, title, subtitle }: StylePickerProps) {
  const [open, setOpen] = useState(false);
  const sample = title?.trim().slice(0, SAMPLE_TEXT_LIMIT) || STYLE_TERMS.sampleText;
  const current = getStyle(value);

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0 rounded-lg border border-border/40 bg-secondary/40">
        {current && <StylePreview styleId={current.id} icon={current.icon} text={sample} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-foreground">
          {current?.name ?? value}
          <span className="text-muted-foreground"> · </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-primary hover:underline cursor-pointer"
          >
            {STYLE_TERMS.change}
          </button>
        </div>
        {current && <div className="truncate text-2xs text-muted-foreground">{current.description}</div>}
      </div>
      <StylePickerDialog open={open} onOpenChange={setOpen} value={value} onChange={onChange} text={sample} subtitle={subtitle?.trim() || undefined} />
    </div>
  );
}
