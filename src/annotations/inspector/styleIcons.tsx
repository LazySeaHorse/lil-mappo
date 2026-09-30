/**
 * Picker icons for annotation styles. A style names its icon in its
 * definition (`icon: 'stamp'`); this is the one place those names are mapped
 * to components, and it already covers every icon the planned styles use. To
 * use a different lucide icon, add it here and nowhere else.
 */

import React from 'react';
import {
  CircleDashed,
  Crosshair,
  Flag,
  Hash,
  Image,
  ListOrdered,
  MapPin,
  MoveUpRight,
  Newspaper,
  PenLine,
  Signpost,
  Square,
  Stamp,
  Tag,
  TrendingUp,
  Type,
  type LucideIcon,
} from 'lucide-react';

export const STYLE_ICONS = {
  'move-up-right': MoveUpRight,
  tag: Tag,
  crosshair: Crosshair,
  newspaper: Newspaper,
  type: Type,
  stamp: Stamp,
  flag: Flag,
  image: Image,
  hash: Hash,
  'trending-up': TrendingUp,
  'pen-line': PenLine,
  'circle-dashed': CircleDashed,
  'map-pin': MapPin,
  'list-ordered': ListOrdered,
  signpost: Signpost,
  square: Square,
} as const satisfies Record<string, LucideIcon>;

export type StyleIconName = keyof typeof STYLE_ICONS;

export function isStyleIconName(name: string): name is StyleIconName {
  return Object.prototype.hasOwnProperty.call(STYLE_ICONS, name);
}

/** The icon for a style's `icon` name; a plain square for unknown names. */
export function StyleIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = isStyleIconName(name) ? STYLE_ICONS[name] : Square;
  return <Icon size={size} />;
}
