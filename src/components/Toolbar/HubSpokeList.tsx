import { useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SectionLabel } from '@/components/ui/field';
import { NumberRow } from '@/components/Inspector/controls/NumberRow';
import { SearchField } from '@/components/Search/SearchField';
import { AirportSearchField } from '@/components/Search/AirportSearchField';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapPicker } from '@/hooks/useMapPicker';
import type { SpokePath } from '@/hooks/useSpokePaths';
import { emptySpoke, MAX_SPOKES, splitPastedPlaces, type Spoke, type SpokeSide, type SpokeTiming } from '@/engine/hubSpoke';
import { isPlacedPoint } from '@/engine/routeMode';
import { resolvePlace } from '@/services/resolvePlace';
import { HUB_SPOKE_TERMS } from '@/lib/terms';
import { cn } from '@/lib/utils';

const TIMING_OPTIONS = [
  { value: 'together' as const, label: HUB_SPOKE_TERMS.together },
  { value: 'sequence' as const, label: HUB_SPOKE_TERMS.sequence },
  { value: 'staggered' as const, label: HUB_SPOKE_TERMS.staggered },
];

interface SpokeRowProps {
  spoke: Spoke;
  mode: 'car' | 'flight';
  path?: SpokePath;
  isOpen: boolean;
  onSelect: (lngLat: [number, number], name: string) => void;
  onPasteList: (text: string) => void;
  onRemove: () => void;
}

/** One place of the list: a normal place search with a remove button and, when it fails, why. */
const SpokeRow = ({ spoke, mode, path, isOpen, onSelect, onPasteList, onRemove }: SpokeRowProps) => {
  const picker = useMapPicker(`route-spoke-${spoke.id}`, {
    prompt: 'Place',
    enabled: isOpen,
    onPick: (result) => onSelect(result.lngLat, result.name),
  });
  const EndpointField = mode === 'flight' ? AirportSearchField : SearchField;
  const error = spoke.notFound ? HUB_SPOKE_TERMS.notFound : path?.status === 'error' ? HUB_SPOKE_TERMS.noRoute : null;

  return (
    <div
      className="flex flex-col gap-1"
      onMouseEnter={() => focusSpoke(spoke.id)}
      onMouseLeave={() => focusSpoke(null)}
    >
      <div className="flex items-center gap-1">
        <div className={cn('flex-1 min-w-0 rounded-lg', error && 'ring-1 ring-destructive/60')}>
          <EndpointField
            label={mode === 'flight' ? 'Airport' : 'Place'}
            placeholder={mode === 'flight' ? 'Airport or city (e.g. CDG)...' : 'Search address or coordinates'}
            {...(mode === 'car' ? { parseCoordinates: true } : {})}
            value={spoke.point}
            name={spoke.name}
            onSelect={onSelect}
            isPicking={picker.isPicking}
            onStartPick={picker.toggle}
            onPasteList={onPasteList}
          />
        </div>
        {path?.status === 'loading' && <Loader2 size={12} className="animate-spin text-muted-foreground shrink-0" aria-hidden="true" />}
        <IconButton
          type="button"
          size="xs"
          variant="destructive"
          onClick={onRemove}
          title={HUB_SPOKE_TERMS.removePlace}
          aria-label={HUB_SPOKE_TERMS.removePlace}
        >
          <X size={12} />
        </IconButton>
      </div>
      {error && <p role="alert" className="px-1 text-2xs text-destructive">{error}</p>}
    </div>
  );
};

const focusSpoke = (id: string | null) => useProjectStore.getState().setPreviewSpokeFocus(id);

/**
 * The list side of a hub and spoke plan. Rows are place searches; pasting several places into a
 * row fills the list. Removing rows down to one hands the planner back to the single route
 * planner, so the last row goes to `onCollapse`.
 */
export const HubSpokeList = ({
  side,
  mode,
  spokes,
  paths,
  isOpen,
  onChange,
  onCollapse,
}: {
  side: SpokeSide;
  mode: 'car' | 'flight';
  spokes: Spoke[];
  paths: Record<string, SpokePath>;
  isOpen: boolean;
  onChange: (update: (spokes: Spoke[]) => Spoke[]) => void;
  onCollapse: (last: Spoke) => void;
}) => {
  const patch = (id: string, p: Partial<Spoke>) =>
    onChange((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const remove = (id: string) => {
    if (spokes.length <= 2) {
      const last = spokes.find((s) => s.id !== id);
      if (last) onCollapse(last);
      return;
    }
    onChange((rows) => rows.filter((r) => r.id !== id));
  };

  /** Splits pasted text into rows after (or in place of, when blank) the row it landed in. */
  const pasteInto = async (id: string, text: string) => {
    const { entries, dropped } = splitPastedPlaces(text);
    const index = spokes.findIndex((s) => s.id === id);
    const replaces = index >= 0 && !isPlacedPoint(spokes[index].point) && !spokes[index].notFound;
    const room = MAX_SPOKES - (spokes.length - (replaces ? 1 : 0));
    const taken = entries.slice(0, Math.max(0, room));
    const left = dropped + entries.length - taken.length;

    const rows: Spoke[] = await Promise.all(
      taken.map(async (entry) => {
        const place = await resolvePlace(mode, entry);
        return place
          ? { id: nanoid(), point: place.point, name: place.name }
          : { ...emptySpoke(nanoid()), name: entry, notFound: true };
      }),
    );
    onChange((current) => {
      const at = current.findIndex((s) => s.id === id);
      if (at < 0) return [...current, ...rows];
      return [...current.slice(0, at), ...rows, ...current.slice(at + (replaces ? 1 : 0))];
    });
    if (left > 0) toast.warning(HUB_SPOKE_TERMS.tooMany(MAX_SPOKES, left));
  };

  const add = (spoke: Spoke = emptySpoke(nanoid())) => {
    if (spokes.length >= MAX_SPOKES) {
      toast.warning(HUB_SPOKE_TERMS.tooMany(MAX_SPOKES, 1));
      return;
    }
    onChange((rows) => [...rows, spoke]);
  };

  const append = useMapPicker('route-spoke-append', {
    prompt: 'Place',
    enabled: isOpen,
    onPick: (result) => add({ id: nanoid(), point: result.lngLat, name: result.name }),
  });

  return (
    <div className="flex flex-col gap-2" data-testid="hub-spoke-list">
      <SectionLabel>{side === 'start' ? HUB_SPOKE_TERMS.starts : HUB_SPOKE_TERMS.ends}</SectionLabel>
      {spokes.map((spoke) => (
        <SpokeRow
          key={spoke.id}
          spoke={spoke}
          mode={mode}
          path={paths[spoke.id]}
          isOpen={isOpen}
          onSelect={(lngLat, name) => patch(spoke.id, { point: lngLat, name, notFound: false })}
          onPasteList={(text) => void pasteInto(spoke.id, text)}
          onRemove={() => remove(spoke.id)}
        />
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="subtle" size="sm" className="flex-1" onClick={() => add()}>
          {HUB_SPOKE_TERMS.addPlace}
        </Button>
        <Button
          type="button"
          variant={append.isPicking ? 'default' : 'subtle'}
          size="sm"
          className="flex-1"
          aria-pressed={append.isPicking}
          onClick={append.toggle}
        >
          <MapPin size={13} /> {HUB_SPOKE_TERMS.addFromMap}
        </Button>
      </div>
    </div>
  );
};

/** How the routes of a hub and spoke plan are placed on the timeline. */
export const SpokeTimingControls = ({
  timing,
  gap,
  onTimingChange,
  onGapChange,
}: {
  timing: SpokeTiming;
  gap: number;
  onTimingChange: (t: SpokeTiming) => void;
  onGapChange: (gap: number) => void;
}) => (
  <div className="flex flex-col gap-2">
    <SectionLabel>{HUB_SPOKE_TERMS.timing}</SectionLabel>
    <SegmentedControl options={TIMING_OPTIONS} value={timing} onValueChange={onTimingChange} className="h-8" />
    {timing === 'staggered' && (
      <NumberRow label={HUB_SPOKE_TERMS.gap} value={gap} onChange={onGapChange} min={0.1} max={30} step={0.5} precision={1} unit="s" />
    )}
  </div>
);
