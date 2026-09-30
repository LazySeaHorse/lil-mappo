/**
 * Style picker grid for the annotation creation and inspector UIs.
 * Shows all registered styles grouped by category with visual icons.
 */

import React from 'react';
import { getAllStyles, getCategories } from '@/annotations/registry';
import type { AnnotationStyleDefinition, StyleCategory } from '@/annotations/types';
import { StyleIcon } from './StyleIcon';

const CATEGORY_LABELS: Record<StyleCategory, string> = {
  label: 'Labels',
  marker: 'Markers',
  editorial: 'Editorial',
  data: 'Data',
  media: 'Media',
  sign: 'Signs',
};

interface StylePickerProps {
  value: string;
  onChange: (styleId: string) => void;
  columns?: number;
}

export function StylePicker({ value, onChange, columns = 4 }: StylePickerProps) {
  const categories = getCategories();
  const allStyles = getAllStyles();

  // Group styles by category
  const grouped = new Map<StyleCategory, AnnotationStyleDefinition[]>();
  for (const style of allStyles) {
    const list = grouped.get(style.category) || [];
    list.push(style);
    grouped.set(style.category, list);
  }

  return (
    <div className="space-y-3">
      {categories.map((category) => {
        const styles = grouped.get(category);
        if (!styles?.length) return null;

        return (
          <div key={category}>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">
              {CATEGORY_LABELS[category] || category}
            </div>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
            >
              {styles.map((style) => {
                const isSelected = value === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => onChange(style.id)}
                    className={`
                      flex flex-col items-center gap-1 p-2 rounded-lg text-center transition-all
                      border cursor-pointer
                      ${isSelected
                        ? 'bg-primary/10 border-primary/30 text-primary shadow-sm'
                        : 'bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                      }
                    `}
                    title={style.description}
                  >
                    <div className="flex items-center justify-center h-6">
                      <StyleIcon name={style.icon} />
                    </div>
                    <span className="text-[10px] font-medium leading-tight truncate w-full">
                      {style.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
