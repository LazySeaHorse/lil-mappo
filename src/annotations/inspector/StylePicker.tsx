/**
 * Style picker for the callout inspector.
 *
 * A callout always has a style, so the picker starts folded: one row with a
 * picture of the style, its name and a Change button. Change opens the full
 * grid of styles, grouped by category, each with a picture drawn by the real
 * renderer. Picking a style folds the picker again.
 */

import React, { useState } from 'react';
import { getAllStyles, getCategories, getStyle } from '@/annotations/registry';
import type { AnnotationStyleDefinition, StyleCategory } from '@/annotations/types';
import { VisualCardSelect } from '@/components/Inspector/VisualCardSelect';
import { STYLE_TERMS } from '@/lib/terms';
import { StylePreview } from './StylePreview';

const CATEGORY_LABELS: Record<StyleCategory, string> = {
  label: 'Labels',
  marker: 'Markers',
  editorial: 'Editorial',
  data: 'Data',
  media: 'Media',
  sign: 'Signs',
};

/** Longest sample text drawn in a preview. */
const SAMPLE_TEXT_LIMIT = 24;

interface StylePickerProps {
  value: string;
  onChange: (styleId: string) => void;
  /** The callout's own title; the pictures show it. */
  title?: string;
}

export function StylePicker({ value, onChange, title }: StylePickerProps) {
  const [open, setOpen] = useState(false);
  const sample = title?.trim().slice(0, SAMPLE_TEXT_LIMIT) || STYLE_TERMS.sampleText;
  const current = getStyle(value);

  if (!open) {
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
      </div>
    );
  }

  const grouped = new Map<StyleCategory, AnnotationStyleDefinition[]>();
  for (const style of getAllStyles()) {
    const list = grouped.get(style.category) || [];
    list.push(style);
    grouped.set(style.category, list);
  }

  return (
    <div className="space-y-3">
      {getCategories().map((category) => {
        const styles = grouped.get(category);
        if (!styles?.length) return null;
        return (
          <div key={category}>
            <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">
              {CATEGORY_LABELS[category] || category}
            </div>
            <VisualCardSelect
              columns={3}
              value={value}
              onChange={(styleId) => {
                setOpen(false);
                onChange(styleId);
              }}
              options={styles.map((style) => ({
                value: style.id,
                label: style.name,
                preview: <StylePreview styleId={style.id} icon={style.icon} text={sample} />,
              }))}
            />
          </div>
        );
      })}
    </div>
  );
}
