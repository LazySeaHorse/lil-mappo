import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MAP_STYLES, STYLE_MOODS, type MapStyleDef, type StyleMood } from '@/config/mapbox';

const THUMB_PX = 40;

/**
 * Screenshots of the real styles, all of the same place (see src/assets/map-styles). Vite gives each a
 * content-hashed URL, so browsers cache it until the file changes (vite.config.ts keeps them from being inlined).
 */
const THUMBNAILS = import.meta.glob<string>('@/assets/map-styles/*.webp', { eager: true, query: '?url', import: 'default' });
const thumbnailUrl = (file: string) => THUMBNAILS[`/src/assets/map-styles/${file}.webp`];

/** The style keys and Standard's times of day that have a screenshot. */
export const THUMBNAIL_FILES = Object.keys(THUMBNAILS).map((path) => path.replace(/^.*\/|\.webp$/g, ''));

/** Standard is the one style with 3D buildings and a time of day, shown as small pictures of each. */
const STANDARD_TIMES = [
  { file: 'standard', label: 'Day' },
  { file: 'standard-dawn', label: 'Dawn' },
  { file: 'standard-dusk', label: 'Dusk' },
  { file: 'standard-night', label: 'Night' },
] as const;

function TimesOfDay() {
  return (
    <span className="flex gap-0.5" title="Day, dawn, dusk and night">
      {STANDARD_TIMES.map(({ file, label }) => (
        <img
          key={file}
          src={thumbnailUrl(file)}
          alt={label}
          title={label}
          width={16}
          height={16}
          loading="lazy"
          draggable={false}
          className="size-4 rounded-[4px] object-cover ring-1 ring-border/60"
        />
      ))}
    </span>
  );
}

function Swatches({ colors }: { colors: MapStyleDef['swatches'] }) {
  return (
    <span className="flex -space-x-1" aria-hidden="true">
      {colors.map((color, i) => (
        <span key={i} className="size-2.5 rounded-full ring-1 ring-background" style={{ background: color }} />
      ))}
    </span>
  );
}

/** A screenshot of the style, over its colors while the picture loads. */
function StyleThumb({ file, def, size }: { file: string; def: MapStyleDef; size: number }) {
  const [land, water, road] = def.swatches;
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-border/60"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${land} 0 45%, ${water} 45% 70%, ${road} 70%)` }}
    >
      <img
        src={thumbnailUrl(file)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        className="absolute inset-0 size-full object-cover"
      />
    </span>
  );
}

interface MapStylePickerProps {
  value: string;
  onChange: (style: string) => void;
  /** `inline` suits a place inside a menu, where a popover cannot open; it expands in place instead. */
  variant?: 'popover' | 'inline';
  className?: string;
}

/** The mood chips and the list of styles. */
function MapStylePanel({ value, onPick, className }: { value: string; onPick: (style: string) => void; className?: string }) {
  const [mood, setMood] = useState<StyleMood | 'All'>('All');
  const entries = Object.entries(MAP_STYLES as Record<string, MapStyleDef>).filter(
    ([, def]) => mood === 'All' || def.mood === mood,
  );

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const rows = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const next = rows.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1);
    rows[(next + rows.length) % rows.length]?.focus();
  };

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Filter by mood">
        {(['All', ...STYLE_MOODS] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mood === m}
            onClick={() => setMood(m)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              mood === m ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Map style" className="flex max-h-[360px] flex-col gap-0.5 overflow-y-auto">
        {entries.map(([key, def]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={key === value}
            onKeyDown={handleRowKeyDown}
            onClick={() => onPick(key)}
            className={`flex items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none ${
              key === value ? 'bg-primary/10' : ''
            }`}
          >
            <StyleThumb file={key} def={def} size={THUMB_PX} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium">{def.label}</span>
              <span className="truncate text-[10px] text-muted-foreground">
                {def.basemap === 'standard' ? '3D buildings · four times of day' : def.mood}
              </span>
            </span>
            {def.basemap === 'standard' ? <TimesOfDay /> : <Swatches colors={def.swatches} />}
            <Check size={13} className={key === value ? 'text-primary' : 'opacity-0'} />
          </button>
        ))}
      </div>
    </div>
  );
}

const TRIGGER_CLASS =
  'flex h-8 items-center gap-2 rounded-lg pl-1 pr-2 text-xs transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function MapStylePicker({ value, onChange, variant = 'popover', className }: MapStylePickerProps) {
  const [open, setOpen] = useState(false);
  const current = (MAP_STYLES as Record<string, MapStyleDef>)[value];
  const pick = (style: string) => { onChange(style); setOpen(false); };

  const triggerContent = (
    <>
      {current && <StyleThumb file={value} def={current} size={24} />}
      <span className="flex-1 truncate text-left">{current?.label ?? 'Map style'}</span>
      <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
    </>
  );
  const triggerProps = {
    type: 'button' as const,
    'data-walkthrough': 'map-style',
    'aria-label': `Map style: ${current?.label ?? 'Map style'}`,
  };

  if (variant === 'inline') {
    return (
      <div className={className}>
        <button {...triggerProps} aria-expanded={open} onClick={() => setOpen(!open)} className={`${TRIGGER_CLASS} h-9 w-full bg-secondary/40`}>
          {triggerContent}
        </button>
        {open && <MapStylePanel value={value} onPick={pick} className="mt-2" />}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button {...triggerProps} className={`${TRIGGER_CLASS} data-[state=open]:bg-secondary/60 ${className ?? 'w-[150px]'}`}>
          {triggerContent}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={8} className="w-[min(330px,calc(100vw-1rem))] rounded-xl border-border/50 p-2 shadow-2xl">
        <MapStylePanel value={value} onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}
