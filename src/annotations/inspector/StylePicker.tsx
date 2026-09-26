/**
 * Style picker grid for the annotation creation and inspector UIs.
 * Shows all registered styles grouped by category with visual icons.
 */

import React from 'react';
import { getAllStyles, getCategories } from '@/annotations/registry';
import type { AnnotationStyleDefinition, StyleCategory } from '@/annotations/types';
import {
  Square, Bookmark, Flag, Mountain, CircleDot, Radio, Image, MapPin,
  Type, Sparkles, Newspaper, Monitor,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  'square': <Square size={16} />,
  'bookmark': <Bookmark size={16} />,
  'flag': <Flag size={16} />,
  'mountain': <Mountain size={16} />,
  'circle-dot': <CircleDot size={16} />,
  'radio': <Radio size={16} />,
  'image': <Image size={16} />,
  'map-pin': <MapPin size={16} />,
  'type': <Type size={16} />,
  'sparkles': <Sparkles size={16} />,
  'newspaper': <Newspaper size={16} />,
  'monitor': <Monitor size={16} />,
};

const CATEGORY_LABELS: Record<StyleCategory, string> = {
  marker: 'Markers',
  label: 'Labels',
  card: 'Cards',
  media: 'Media',
  data: 'Data',
  editorial: 'Editorial',
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
                      {ICON_MAP[style.icon] || <Square size={16} />}
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
