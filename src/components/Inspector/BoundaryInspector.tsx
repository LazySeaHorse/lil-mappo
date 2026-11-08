import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { withHistoryLabel } from '@/store/history';
import type { BoundaryItem } from '@/store/types';
import { applyBoundaryDetail, getBoundaryDetailLevel, type BoundaryDetailId } from '@/engine/boundaryDetail';
import { formatDateRange } from '@/engine/historicalDate';
import { sourceForVersion } from '@/engine/historicalSource';
import type { BoundarySearchResult } from '@/services/boundarySearch';
import { fetchHistoricalOutline, type HistoricalOutline } from '@/services/openHistoricalMap';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { toast } from 'sonner';
import { BoundarySearch } from './BoundarySearch';
import { HistoricalPeriodPicker } from './controls/HistoricalPeriodPicker';
import { BoundaryDetailPicker } from './controls/BoundaryDetailPicker';
import { Field } from '@/components/ui/field';
import { PanelWrapper } from './InspectorLayout';
import { BoundaryAnimationSection, BoundaryAppearanceSection } from './BoundaryStyleSections';
import { InspectorHeader } from './InspectorHeader';
import { BOUNDARY_TERMS, HISTORICAL_TERMS } from '@/lib/terms';
import { TimingSection } from './timing/TimingSection';
import { boundaryTiming } from './timing/timingAdapters';
import { Shield, Loader2 } from 'lucide-react';

export function BoundaryInspector({ item }: { item: BoundaryItem }) {
  const updateItem = useProjectStore(s => s.updateItem);

  const u = (updates: Partial<BoundaryItem>) => updateItem(item.id, updates);
  const us = (updates: Partial<BoundaryItem['style']>) => u({ style: { ...item.style, ...updates } });

  const request = useLatestRequest();
  /** The period whose outline is downloading, if any. */
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  /**
   * The full outline of the place or period last picked here, and the detail it
   * was stored at. Only a saved boundary's simplified outline is kept, so the
   * detail can change only while the full one is at hand.
   */
  const [picked, setPicked] = React.useState<{ raw: GeoJSON.Geometry; detail: BoundaryDetailId } | null>(null);

  // Another item in the panel: forget a download and an outline that were for this one.
  React.useEffect(() => {
    return () => {
      request.cancel();
      setLoadingId(null);
      setPicked(null);
    };
  }, [item.id, request]);

  /** Simplifies a picked outline at the detail chosen last (here or in Add Boundary) and remembers it. */
  const pickOutline = (raw: GeoJSON.Geometry) => {
    const detail = useProjectStore.getState().boundaryDetail;
    setPicked({ raw, detail });
    return applyBoundaryDetail(raw, detail);
  };

  // The stored outline is still the one picked here (no undo or other edit since), so its detail can change.
  const detailEditable = !!picked && item.geojson === applyBoundaryDetail(picked.raw, picked.detail);

  const handleDetail = (detail: BoundaryDetailId) => {
    if (!picked) return;
    useProjectStore.getState().setBoundaryDetail(detail);
    setPicked({ raw: picked.raw, detail });
    withHistoryLabel(`Changed detail of ${item.placeName} to ${getBoundaryDetailLevel(detail).label}`, () =>
      updateItem(item.id, { geojson: applyBoundaryDetail(picked.raw, detail) }),
    );
  };

  /**
   * Downloads one period's outline, then `apply` writes it in one go. A newer
   * pick or period change cancels this one, so an old answer is dropped.
   */
  const loadPeriod = async (osmId: string, apply: (outline: HistoricalOutline) => void) => {
    const signal = request.start();
    setLoadingId(osmId);
    try {
      const outline = await fetchHistoricalOutline(osmId, signal);
      if (signal.aborted) return;
      apply(outline);
    } catch (e: unknown) {
      if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error(HISTORICAL_TERMS.loadFailed);
    } finally {
      if (!signal.aborted) setLoadingId(null);
    }
  };

  const handleSelect = (r: BoundarySearchResult) => {
    if (r.kind === 'historical') {
      // A place starts at its latest period (the periods are sorted oldest first).
      const version = r.versions[r.versions.length - 1];
      void loadPeriod(version.osmId, (outline) => {
        const current = useProjectStore.getState().items[item.id];
        if (current?.kind !== 'boundary') return;
        withHistoryLabel(`Changed area to ${r.placeName} (${formatDateRange(version.startDate, version.endDate)})`, () =>
          updateItem(item.id, {
            ...(outline.countryCode ? { style: { ...current.style, flagCode: outline.countryCode } } : {}),
            geojson: pickOutline(outline.geojson),
            placeName: r.placeName,
            source: sourceForVersion(r, version),
          }),
        );
        toast.success('Boundary updated.');
      });
      return;
    }
    request.cancel();
    setLoadingId(null);
    u({
      ...(r.countryCode ? { style: { ...item.style, flagCode: r.countryCode } } : {}),
      geojson: pickOutline(r.geojson),
      placeName: r.placeName,
      source: null,
    });
    toast.success('Boundary updated.');
  };

  /** Shows another period of the historical place this area came from. */
  const handlePeriod = (osmId: string) => {
    const source = item.source;
    const version = source?.versions.find((v) => v.osmId === osmId);
    if (!source || !version) return;
    void loadPeriod(osmId, (outline) => {
      const current = useProjectStore.getState().items[item.id];
      if (current?.kind !== 'boundary' || !current.source) return;
      const nextSource = sourceForVersion(current.source, version);
      withHistoryLabel(`Changed period of ${current.placeName} to ${formatDateRange(version.startDate, version.endDate)}`, () =>
        updateItem(item.id, { geojson: pickOutline(outline.geojson), source: nextSource }),
      );
    });
  };

  // A download for another period of this place locks the picker; one for a different place shows a plain line.
  const loadingPeriod = item.source?.versions.some((v) => v.osmId === loadingId) ? loadingId : null;

  return (
    <PanelWrapper 
      title="Area" 
      icon={<Shield size={15} />}
      header={
        <InspectorHeader
          kind="boundary"
          id={item.id}
          name={item.placeName}
          onRename={(v) => u({ placeName: v })}
          placeholder="Boundary name"
          startTime={item.startTime}
        />
      }
    >

      <div className="mb-2.5">
        <BoundarySearch initialValue={item.placeName} onSelect={handleSelect} />
      </div>

      {loadingId && !loadingPeriod && (
        <div className="mb-2.5 flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin shrink-0" /> {HISTORICAL_TERMS.loading}
        </div>
      )}

      {item.source && (
        <div className="mb-2.5">
          <HistoricalPeriodPicker
            versions={item.source.versions}
            value={loadingPeriod ?? item.source.osmId}
            onChange={handlePeriod}
            loading={!!loadingPeriod}
          />
        </div>
      )}

      {detailEditable && picked && (
        <Field label={BOUNDARY_TERMS.detail} className="mb-2.5">
          <BoundaryDetailPicker value={picked.detail} onChange={handleDetail} />
        </Field>
      )}

      <BoundaryAppearanceSection style={item.style} onStyle={us} />

      <BoundaryAnimationSection style={item.style} onStyle={us} />

      <TimingSection adapter={boundaryTiming} item={item} onChange={u} />

    </PanelWrapper>
  );
}
