import React from 'react';
import { Square } from 'lucide-react';
import { STYLE_ICONS, isStyleIconName } from './styleIcons';

/** The icon for a style's `icon` name; a plain square for unknown names. */
export function StyleIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = isStyleIconName(name) ? STYLE_ICONS[name] : Square;
  return <Icon size={size} />;
}
