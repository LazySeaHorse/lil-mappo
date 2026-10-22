import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SectionLabel } from '@/components/ui/field';
import { NumberRow } from '@/components/Inspector/controls/NumberRow';
import { SearchField } from '@/components/Search/SearchField';
import { AirportSearchField } from '@/components/Search/AirportSearchField';
import { AddPlacePill, PlacePill } from '@/components/Search/PlacePills';
import { focusPlaceBox, shortPlaceName } from '@/components/Search/placePillHelpers';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapPicker } from '@/hooks/useMapPicker';
import type { SpokePath } from '@/hooks/useSpokePaths';
import { emptySpoke, MAX_SPOKES, splitPastedPlaces, type Spoke, type SpokeSide, type SpokeTiming } from '@/engine/hubSpoke';
import { isPlacedPoint, UNSET_POINT } from '@/engine/routeMode';
import { resolvePlace } from '@/services/resolvePlace';
import { HUB_SPOKE_TERMS } from '@/lib/terms';

const TIMING_OPTIONS = [
  { value: 'together' as const, label: HUB_SPOKE_TERMS.together },
  { value: 'sequence' as const, label: HUB_SPOKE_TERMS.sequence },
  { value: 'staggered' as const, label: HUB_SPOKE_TERMS.staggered },
];

const focusSpoke = (id: string | null) => useProjectStore.getState().setPreviewSpokeFocus(id);

/**
 * The list side of a hub and spoke plan: one search box that holds the places as pills. A place
 * chosen in the box, picked on the map or pasted in becomes a pill. Taking pills away down to
 * two (or the only one) hands the planner back to the single route planner, so the pill left
 * goes to `onCollapse`.
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
  const remove = (id: string) => {
    focusSpoke(null);
    if (spokes.length <= 2) {
      onCollapse(spokes.find((s) => s.id !== id) ?? emptySpoke(nanoid()));
      return;
    }
    onChange((rows) => rows.filter((r) => r.id !== id));
  };

  const add = (spoke: Spoke) => {
    if (spokes.length >= MAX_SPOKES) {
      toast.warning(HUB_SPOKE_TERMS.tooMany(MAX_SPOKES, 1));
      return;
    }
    onChange((rows) => [...rows, spoke]);
  };

  /** Adds each pasted place as a pill; one that is not found stays as a pill to fix or remove. */
  const pasteList = async (text: string) => {
    const { entries, dropped } = splitPastedPlaces(text);
    const taken = entries.slice(0, Math.max(0, MAX_SPOKES - spokes.length));
    const left = dropped + entries.length - taken.length;

    const rows: Spoke[] = await Promise.all(
      taken.map(async (entry) => {
        const place = await resolvePlace(mode, entry);
        return place
          ? { id: nanoid(), point: place.point, name: place.name }
          : { ...emptySpoke(nanoid()), name: entry, notFound: true };
      }),
    );
    onChange((current) => [...current, ...rows].slice(0, MAX_SPOKES));
    if (left > 0) toast.warning(HUB_SPOKE_TERMS.tooMany(MAX_SPOKES, left));
  };

  const picker = useMapPicker('route-spoke-append', {
    prompt: 'Place',
    enabled: isOpen,
    onPick: (result) => add({ id: nanoid(), point: result.lngLat, name: result.name }),
  });

  const EndpointField = mode === 'flight' ? AirportSearchField : SearchField;
  const problems = spokes.flatMap((spoke) => {
    const message = spoke.notFound ? HUB_SPOKE_TERMS.notFound : paths[spoke.id]?.status === 'error' ? HUB_SPOKE_TERMS.noRoute : null;
    return message ? [{ spoke, message }] : [];
  });

  const chips = (
    <>
      {spokes.map((spoke) => (
        <PlacePill
          key={spoke.id}
          label={shortPlaceName(spoke.name, spoke.point)}
          title={spoke.name || undefined}
          error={spoke.notFound || paths[spoke.id]?.status === 'error'}
          loading={paths[spoke.id]?.status === 'loading'}
          onRemove={() => remove(spoke.id)}
          onHover={(hovering) => focusSpoke(hovering ? spoke.id : null)}
        />
      ))}
      <AddPlacePill label={HUB_SPOKE_TERMS.addPlace} onClick={(e) => focusPlaceBox(e.currentTarget)} />
    </>
  );

  return (
    <div className="flex flex-col gap-2" data-testid="hub-spoke-list">
      <SectionLabel>{side === 'start' ? HUB_SPOKE_TERMS.starts : HUB_SPOKE_TERMS.ends}</SectionLabel>
      <EndpointField
        label={mode === 'flight' ? 'Airport' : 'Place'}
        placeholder={mode === 'flight' ? 'Add airport or city (e.g. CDG)...' : 'Add address or coordinates'}
        {...(mode === 'car' ? { parseCoordinates: true } : {})}
        value={UNSET_POINT}
        name=""
        chips={chips}
        onSelect={(lngLat, name) => {
          if (isPlacedPoint(lngLat)) add({ id: nanoid(), point: lngLat, name });
        }}
        isPicking={picker.isPicking}
        onStartPick={picker.toggle}
        onPasteList={(text) => void pasteList(text)}
      />
      {problems.map(({ spoke, message }) => (
        <p key={spoke.id} role="alert" className="px-1 text-2xs text-destructive">
          <span className="font-medium">{shortPlaceName(spoke.name, spoke.point)}</span>: {message}
        </p>
      ))}
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
