/**
 * BoundaryAddDropdown — the Add Boundary panel.
 *
 * Choosing a search result previews the place's boundary: it is staged (see `sceneItems`),
 * brought into view and its entrance played (see `playAppearPreview`), so the map shows it
 * exactly as the video will, but it is not on the timeline yet. The panel's options change
 * the preview and play it again; another result replaces it, with the same options. Add
 * boundary puts it (and its name label) on the timeline at the playhead, selects it and
 * closes the panel; closing the panel drops the preview.
 *
 * A place from the past (OpenHistoricalMap) is staged the same way once the outline of its
 * latest period has downloaded; the period picker then swaps the outline and plays it again.
 */

import React from 'react';
import { Hexagon, Check, MapPin, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { applyBoundaryDetail, type BoundaryDetailId } from '@/engine/boundaryDetail';
import { labelPoint } from '@/engine/labelPoint';
import { stagedItemsOf, type StagingOwner } from '@/engine/stagedItems';
import { formatDateRange } from '@/engine/historicalDate';
import { sourceForVersion } from '@/engine/historicalSource';
import { useProjectStore } from '@/store/useProjectStore';
import { createBoundaryItem, createCalloutItem, DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import type { BoundaryItem, BoundarySource, BoundaryStyle, CalloutItem } from '@/store/types';
import { withHistoryLabel } from '@/store/history';
import { parseBoundaryAnimationStyle } from '@/store/domainValues';
import type { BoundarySearchResult, HistoricalBoundaryResult } from '@/services/boundarySearch';
import { fetchHistoricalOutline } from '@/services/openHistoricalMap';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { SwitchRow } from '@/components/Inspector/controls/SwitchRow';
import { ColorRow } from '@/components/Inspector/controls/ColorRow';
import { HistoricalPeriodPicker } from '@/components/Inspector/controls/HistoricalPeriodPicker';
import { BoundarySearch } from '../Inspector/BoundarySearch';
import { BoundaryDetailPicker } from '@/components/Inspector/controls/BoundaryDetailPicker';
import { CountryCutoutFeature } from '@/components/FeatureVotes/CountryCutoutFeature';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { SectionLabel, Field } from '@/components/ui/field';
import { BOUNDARY_ADD_TERMS, BOUNDARY_ANIMATION_LABELS, BOUNDARY_TERMS, HISTORICAL_TERMS } from '@/lib/terms';

// A flag reads best fully opaque; the Dim switch uses a lighter mask than the inspector default.
const FLAG_FILL_OPACITY = 1;
const DIM_MASK_OPACITY = 0.7;

/** The fill for a flag, or for a plain colour. */
const fillStyle = (flag: boolean): Partial<BoundaryStyle> => ({
  fillMode: flag ? 'flag' : 'color',
  fillOpacity: flag ? FLAG_FILL_OPACITY : DEFAULT_BOUNDARY_STYLE.fillOpacity,
});

/** A Map Label with the place name at the area's visual centre, timed like the boundary. */
function createNameLabel(boundary: BoundaryItem) {
  const centre = boundary.geojson ? labelPoint(boundary.geojson) : null;
  if (!centre) return null;
  return createCalloutItem({
    styleId: 'map-label',
    content: { title: boundary.placeName },
    lngLat: centre,
    startTime: boundary.startTime,
    endTime: boundary.endTime,
    linkTitleToLocation: false,
  });
}

const STAGING: StagingOwner = 'boundary-add';

/** Shows a boundary, and its name label, in the panel's preview; `play` plays their entrance again. */
function stage(boundary: BoundaryItem, label: CalloutItem | null, { play = true } = {}) {
  const { stageItems, playAppearPreview } = useProjectStore.getState();
  const items = label ? [boundary, label] : [boundary];
  stageItems(STAGING, items);
  if (play) playAppearPreview(items.map((item) => item.id));
}

export const BoundaryAddDropdown = ({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const frame = useFrameOnMap();
  const boundaryDetail = useProjectStore((s) => s.boundaryDetail);
  // The boundary being previewed, and its name label, before they are added.
  const staged = useProjectStore((s) => stagedItemsOf(s, STAGING));
  const boundary = staged.find((item): item is BoundaryItem => item.kind === 'boundary') ?? null;
  const label = staged.find((item): item is CalloutItem => item.kind === 'callout') ?? null;
  /** The outline as found, before the detail level is applied. */
  const [outline, setOutline] = React.useState<GeoJSON.Geometry | null>(null);
  /** The historical place being previewed (null for a place as it is today) and the id of its shown period. */
  const [place, setPlace] = React.useState<{ result: HistoricalBoundaryResult; osmId: string } | null>(null);
  /** The period whose outline is downloading, if any. */
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const request = useLatestRequest();
  // Choices that carry over to the next place chosen: a flag (for a country) and a name label.
  const [flag, setFlag] = React.useState(false);
  const [nameLabel, setNameLabel] = React.useState(false);

  // Closing the panel, or leaving the editor, drops the preview.
  React.useEffect(() => {
    if (isOpen) return;
    request.cancel();
    useProjectStore.getState().clearStagedItems(STAGING);
    setOutline(null);
    setPlace(null);
    setLoadingId(null);
    setFlag(false);
    setNameLabel(false);
  }, [isOpen, request]);
  React.useEffect(() => () => useProjectStore.getState().clearStagedItems(STAGING), []);

  // The latest choices, for an outline that arrives after the user went on changing options.
  const latest = React.useRef({ flag, nameLabel });
  latest.current = { flag, nameLabel };

  /** Stages a place from its raw outline. The style carries over from the boundary previewed before, with this place's flag. */
  const stageOutline = (placeName: string, raw: GeoJSON.Geometry, flagCode: string | null, source: BoundarySource | null) => {
    const state = useProjectStore.getState();
    const before = stagedItemsOf(state, STAGING).find((item): item is BoundaryItem => item.kind === 'boundary') ?? null;
    const style: BoundaryStyle = {
      ...(before?.style ?? DEFAULT_BOUNDARY_STYLE),
      flagCode,
      ...fillStyle(latest.current.flag && !!flagCode),
    };
    const item = createBoundaryItem({
      placeName,
      geojson: applyBoundaryDetail(raw, state.boundaryDetail),
      startTime: state.playheadTime,
      style,
      source,
    });
    stage(item, latest.current.nameLabel ? createNameLabel(item) : null);
    setOutline(raw);
    frame.frameGeometry(raw);
  };

  /** Downloads the outline of one period of a historical place and stages it; a newer pick or period change wins. */
  const showPeriod = async (result: HistoricalBoundaryResult, osmId: string) => {
    const version = result.versions.find((v) => v.osmId === osmId);
    if (!version) return;
    const signal = request.start();
    setLoadingId(osmId);
    try {
      const found = await fetchHistoricalOutline(osmId, signal);
      if (signal.aborted) return;
      stageOutline(result.placeName, found.geojson, found.countryCode, sourceForVersion(result, version));
      setPlace({ result, osmId });
    } catch (e: unknown) {
      if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error(HISTORICAL_TERMS.loadFailed);
    } finally {
      if (!signal.aborted) setLoadingId(null);
    }
  };

  const handleSelect = (result: BoundarySearchResult) => {
    if (result.kind === 'historical') {
      // A place starts at its latest period (the periods are sorted oldest first).
      void showPeriod(result, result.versions[result.versions.length - 1].osmId);
      return;
    }
    request.cancel();
    setLoadingId(null);
    setPlace(null);
    stageOutline(result.placeName, result.geojson, result.countryCode, null);
  };

  const updateStyle = (patch: Partial<BoundaryStyle>, { play = true } = {}) => {
    if (boundary) stage({ ...boundary, style: { ...boundary.style, ...patch } }, label, { play });
  };

  const handleFlag = (on: boolean) => {
    setFlag(on);
    updateStyle(fillStyle(on));
  };

  const handleNameLabel = (on: boolean) => {
    setNameLabel(on);
    if (boundary) stage(boundary, on ? createNameLabel(boundary) : null);
  };

  const handleDetail = (detail: BoundaryDetailId) => {
    useProjectStore.getState().setBoundaryDetail(detail);
    if (boundary && outline) stage({ ...boundary, geojson: applyBoundaryDetail(outline, detail) }, label);
  };

  // A period of the place shown is downloading (the picker locks); another place downloading hides the picker.
  const loadingPeriod = place?.result.versions.some((v) => v.osmId === loadingId) ? loadingId : null;

  const handleAdd = () => {
    if (!boundary || loadingId) return;
    withHistoryLabel(label ? `Added boundary and label ${boundary.placeName}` : 'Added boundary', () =>
      useProjectStore.getState().addStagedItems(STAGING),
    );
    useProjectStore.getState().selectItem(boundary.id);
    onOpenChange(false);
  };

  const trigger = (
    <IconButton
      variant={isOpen ? 'toolbar-active' : 'toolbar'}
      size="sm"
      title="Add Boundary"
      data-walkthrough="add-boundary"
    >
      <Hexagon size={18} />
    </IconButton>
  );

  const header = (
    <PanelHeader
      icon={<Hexagon size={16} />}
      title="Add Boundary"
      subtitle="Search regions and countries"
    >
      <div data-walkthrough="boundary-action">
        <BoundarySearch initialValue="" onSelect={handleSelect} />
      </div>
    </PanelHeader>
  );

  const footer = (
    <Button variant={boundary ? 'default' : 'secondary'} onClick={handleAdd} disabled={!boundary || !!loadingId} className="w-full">
      <Plus size={16} /> {BOUNDARY_ADD_TERMS.add}
    </Button>
  );

  return (
    <ToolbarDropdownPanel
      open={isOpen}
      onOpenChange={onOpenChange}
      trigger={trigger}
      header={header}
      footer={footer}
    >
      {!boundary && !loadingId ? (
        <EmptyState
          variant="dropdown"
          icon={MapPin}
          title="No location selected"
          description={BOUNDARY_ADD_TERMS.empty}
        />
      ) : !boundary ? (
        // The first outline of a historical place is still downloading.
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin shrink-0" />
          {HISTORICAL_TERMS.loading}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-3">
            <div>
              <SectionLabel>{BOUNDARY_ADD_TERMS.preview}</SectionLabel>
              <div className="flex items-center gap-2 overflow-hidden p-3 rounded-xl bg-primary/5 border border-primary/10">
                {loadingId ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{HISTORICAL_TERMS.loading}</span>
                  </>
                ) : (
                  <>
                    <Check size={14} className="text-primary shrink-0" />
                    <span className="text-xs font-medium truncate">{boundary.placeName}</span>
                    {boundary.source && (
                      <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
                        {formatDateRange(boundary.source.startDate, boundary.source.endDate)}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            {place && (!loadingId || loadingPeriod) && (
              <HistoricalPeriodPicker
                versions={place.result.versions}
                value={loadingPeriod ?? place.osmId}
                onChange={(osmId) => void showPeriod(place.result, osmId)}
                notes={place.result.versions.find((v) => v.osmId === (loadingPeriod ?? place.osmId))?.notes}
                loading={!!loadingPeriod}
              />
            )}
          </div>

          <div className="px-1">
            {boundary.style.flagCode && (
              <SwitchRow
                label="Flag"
                sublabel="Fill with the country's flag"
                checked={boundary.style.fillMode === 'flag'}
                onChange={handleFlag}
              />
            )}
            <div className="my-3">
              <CountryCutoutFeature onOpen={() => onOpenChange(false)} />
            </div>
            <SwitchRow
              label="Dim surroundings"
              sublabel="Darken the map outside this area"
              checked={boundary.style.maskOutside}
              onChange={(v) => updateStyle(v ? { maskOutside: true, maskOpacity: DIM_MASK_OPACITY } : { maskOutside: false })}
            />
            <SwitchRow
              label="Name label"
              sublabel="Add a label with the place name"
              checked={!!label}
              onChange={handleNameLabel}
            />
          </div>

          <div>
            <SectionLabel>{BOUNDARY_TERMS.detail}</SectionLabel>
            <BoundaryDetailPicker value={boundaryDetail} onChange={handleDetail} />
          </div>

          <div className="space-y-4">
            <SectionLabel>Visual appearance</SectionLabel>
            <div className="space-y-4 px-1">
              <ColorRow
                label={BOUNDARY_TERMS.borderColor}
                value={boundary.style.strokeColor}
                // Not played again: the colour changes as the user drags through the picker.
                onChange={(v) => updateStyle({ strokeColor: v, fillColor: v }, { play: false })}
              />
              <Field label={BOUNDARY_TERMS.animation}>
                <Select
                  value={boundary.style.animationStyle}
                  onValueChange={(v) => updateStyle({ animationStyle: parseBoundaryAnimationStyle(v) })}
                >
                  <SelectTrigger aria-label={BOUNDARY_TERMS.animation} className="h-9 text-xs transition-all bg-secondary/20 border-transparent focus:border-border/50 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/50 shadow-2xl">
                    <SelectItem value="fade">{BOUNDARY_ANIMATION_LABELS.fade}</SelectItem>
                    <SelectItem value="draw">{BOUNDARY_ANIMATION_LABELS.draw}</SelectItem>
                    <SelectItem value="trace">{BOUNDARY_ANIMATION_LABELS.trace}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        </div>
      )}
    </ToolbarDropdownPanel>
  );
};
