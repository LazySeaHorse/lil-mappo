import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MAP_STYLES, MAPBOX_GALLERY_TOKEN, STYLE_MOODS, getEffectiveMapboxToken, type MapStyleDef, type StyleMood } from '@/config/mapbox';

/** Every thumbnail shows the same place, so the styles compare fairly and the browser caches each image. */
const THUMB_VIEW = '-122.42,37.77,11,0';
const THUMB_PX = 40;

/** The Static Images API cannot draw Mapbox Standard, so its thumbnail shows the closest classic style. */
const STATIC_STAND_IN = 'mapbox://styles/mapbox/streets-v12';

function thumbnailUrl(def: MapStyleDef): string | null {
  const styleUrl = def.basemap === 'standard' ? STATIC_STAND_IN : def.url;
  const match = /^mapbox:\/\/styles\/([^/]+)\/(.+)$/.exec(styleUrl);
  if (!match) return null;
  const [, owner, id] = match;
  const token = owner === 'mapbox-map-design' ? MAPBOX_GALLERY_TOKEN : getEffectiveMapboxToken();
  if (!token) return null;
  const size = `${THUMB_PX}x${THUMB_PX}@2x`;
  return `https://api.mapbox.com/styles/v1/${owner}/${id}/static/${THUMB_VIEW}/${size}?access_token=${token}&logo=false&attribution=false`;
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

/** A map picture of the style, or its colors until the picture loads or if it cannot. */
function StyleThumb({ def, size, load }: { def: MapStyleDef; size: number; load: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = load && !failed ? thumbnailUrl(def) : null;
  const [land, water, road] = def.swatches;
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-border/60"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${land} 0 45%, ${water} 45% 70%, ${road} 70%)` }}
    >
      {url && (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

interface MapStylePickerProps {
  value: string;
  onChange: (style: string) => void;
}

export function MapStylePicker({ value, onChange }: MapStylePickerProps) {
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<StyleMood | 'All'>('All');
  const current = (MAP_STYLES as Record<string, MapStyleDef>)[value];
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-walkthrough="map-style"
          aria-label={`Map style: ${current?.label ?? 'Map style'}`}
          className="flex h-8 w-[150px] items-center gap-2 rounded-md border border-border bg-background pl-1 pr-2 text-xs transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {current && <StyleThumb def={current} size={24} load />}
          <span className="flex-1 truncate text-left">{current?.label ?? 'Map style'}</span>
          <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[330px] rounded-xl border-border/50 p-2 shadow-2xl">
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
              onClick={() => { onChange(key); setOpen(false); }}
              className={`flex items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none ${
                key === value ? 'bg-primary/10' : ''
              }`}
            >
              <StyleThumb def={def} size={THUMB_PX} load={open} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium">{def.label}</span>
                <span className="text-[10px] text-muted-foreground">{def.mood}</span>
              </span>
              <Swatches colors={def.swatches} />
              <Check size={13} className={key === value ? 'text-primary' : 'opacity-0'} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
