import React, { useState } from 'react';
import { Check, ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MAP_STYLES, STYLE_MOODS, getMapStyleDef, type MapStyleDef, type StyleMood } from '@/config/mapbox';
import { customStyleSwatches, sameCustomLook } from '@/customMapStyles/model';
import { useSavedMapStyles, type SavedMapStyle } from '@/customMapStyles/savedStyles';
import { useCustomStylesAllowed } from '@/customMapStyles/useCustomStylesAllowed';
import { MAP_STYLE_TERMS } from '@/lib/terms';
import { useProjectStore } from '@/store/useProjectStore';

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

/** A screenshot of the style (`file`), over its colors while the picture loads; custom styles have only their colors. */
function StyleThumb({ file, swatches, size }: { file?: string; swatches: MapStyleDef['swatches']; size: number }) {
  const [land, water, road] = swatches;
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-border/60"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${land} 0 45%, ${water} 45% 70%, ${road} 70%)` }}
    >
      {file && (
        <img
          src={thumbnailUrl(file)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

/** Swatches of a saved style: its own colors, the built-in style's where it sets none. */
function savedSwatches(saved: SavedMapStyle): MapStyleDef['swatches'] {
  const base = getMapStyleDef(saved.mapStyle)?.swatches ?? MAP_STYLES.standard.swatches;
  return customStyleSwatches(saved.style, base);
}

/** The custom styles saved by the AI (paid plans): pick one to apply it, or delete it with an undo toast. */
function SavedStyles({ onPicked }: { onPicked: () => void }) {
  const allowed = useCustomStylesAllowed();
  const saved = useSavedMapStyles((s) => s.styles);
  const mapStyle = useProjectStore((s) => s.mapStyle);
  const customStyle = useProjectStore((s) => s.customStyle);
  if (!allowed || !saved.length) return null;

  const apply = (entry: SavedMapStyle) => {
    useProjectStore.getState().setMapStyle(entry.mapStyle, entry.style);
    onPicked();
  };
  const remove = (entry: SavedMapStyle) => {
    const removed = useSavedMapStyles.getState().remove(entry.id);
    if (!removed) return;
    toast(MAP_STYLE_TERMS.deleted(entry.style.name), {
      action: { label: MAP_STYLE_TERMS.undo, onClick: () => useSavedMapStyles.getState().restore(removed.saved, removed.index) },
    });
  };

  return (
    <div role="group" aria-label={MAP_STYLE_TERMS.yourStyles} className="mb-2 border-b border-border/50 pb-2">
      <p className="mb-1 px-1.5 text-2xs font-medium text-muted-foreground">{MAP_STYLE_TERMS.yourStyles}</p>
      <div className="flex max-h-[150px] flex-col gap-0.5 overflow-y-auto">
        {saved.map((entry) => {
          const current = entry.mapStyle === mapStyle && !!customStyle && sameCustomLook(entry.style, customStyle);
          return (
            <div key={entry.id} className={`flex items-center rounded-lg transition-colors hover:bg-secondary/70 ${current ? 'bg-primary/10' : ''}`}>
              <button
                type="button"
                aria-pressed={current}
                onClick={() => apply(entry)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 text-left focus-visible:bg-secondary/70 focus-visible:outline-none"
              >
                <StyleThumb swatches={savedSwatches(entry)} size={THUMB_PX} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium">{entry.style.name}</span>
                  <span className="truncate text-2xs text-muted-foreground">
                    {MAP_STYLE_TERMS.basedOn(getMapStyleDef(entry.mapStyle)?.label ?? entry.mapStyle)}
                  </span>
                </span>
                <Check size={13} className={current ? 'text-primary' : 'opacity-0'} />
              </button>
              <button
                type="button"
                aria-label={MAP_STYLE_TERMS.delete(entry.style.name)}
                title={MAP_STYLE_TERMS.delete(entry.style.name)}
                onClick={() => remove(entry)}
                className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MapStylePickerProps {
  /** `inline` suits a place inside a menu, where a popover cannot open; it expands in place instead. */
  variant?: 'popover' | 'inline';
  className?: string;
}

/** The saved custom styles, the mood chips and the list of styles. Picking either applies it to the project. */
function MapStylePanel({ onPicked, className }: {
  /** After a style was applied. */
  onPicked: () => void;
  className?: string;
}) {
  const [mood, setMood] = useState<StyleMood | 'All'>('All');
  const value = useProjectStore((s) => s.mapStyle);
  // A built-in style is the one in use only without a custom style over it.
  const custom = useProjectStore((s) => s.customStyle !== null);
  const pick = (style: string) => {
    useProjectStore.getState().setMapStyle(style);
    onPicked();
  };
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
      <SavedStyles onPicked={onPicked} />
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Filter by mood">
        {(['All', ...STYLE_MOODS] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mood === m}
            onClick={() => setMood(m)}
            className={`rounded-full px-2.5 py-1 text-2xs font-medium transition-colors ${
              mood === m ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Map style" className="flex max-h-[360px] flex-col gap-0.5 overflow-y-auto">
        {entries.map(([key, def]) => {
          const checked = key === value && !custom;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={checked}
              onKeyDown={handleRowKeyDown}
              onClick={() => pick(key)}
              className={`flex items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none ${
                checked ? 'bg-primary/10' : ''
              }`}
            >
              <StyleThumb file={key} swatches={def.swatches} size={THUMB_PX} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium">{def.label}</span>
                <span className="truncate text-2xs text-muted-foreground">
                  {def.basemap === 'standard' ? '3D buildings · four times of day' : def.mood}
                </span>
              </span>
              {def.basemap === 'standard' ? <TimesOfDay /> : <Swatches colors={def.swatches} />}
              <Check size={13} className={checked ? 'text-primary' : 'opacity-0'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TRIGGER_CLASS =
  'flex h-8 items-center gap-2 rounded-lg pl-1 pr-2 text-xs transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** The project's map style: a built-in style, or a custom style over one. */
export function MapStylePicker({ variant = 'popover', className }: MapStylePickerProps) {
  const [open, setOpen] = useState(false);
  const value = useProjectStore((s) => s.mapStyle);
  const customStyle = useProjectStore((s) => s.customStyle);
  const current = getMapStyleDef(value);
  const close = () => setOpen(false);
  const label = customStyle?.name ?? current?.label ?? 'Map style';

  const triggerContent = (
    <>
      {current && (customStyle
        ? <StyleThumb swatches={customStyleSwatches(customStyle, current.swatches)} size={24} />
        : <StyleThumb file={value} swatches={current.swatches} size={24} />)}
      <span className="flex-1 truncate text-left">{label}</span>
      <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
    </>
  );
  const triggerProps = {
    type: 'button' as const,
    'data-walkthrough': 'map-style',
    'aria-label': `Map style: ${label}`,
  };

  if (variant === 'inline') {
    return (
      <div className={className}>
        <button {...triggerProps} aria-expanded={open} onClick={() => setOpen(!open)} className={`${TRIGGER_CLASS} h-9 w-full bg-secondary/40`}>
          {triggerContent}
        </button>
        {open && <MapStylePanel onPicked={close} className="mt-2" />}
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
        <MapStylePanel onPicked={close} />
      </PopoverContent>
    </Popover>
  );
}
