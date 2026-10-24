/**
 * BoundaryAddDropdown — the Add Boundary panel.
 *
 * Choosing a search result previews the place's boundary: it is staged (see `sceneItems`),
 * brought into view and its entrance played (see `playAppearPreview`), so the map shows it
 * exactly as the video will, but it is not on the timeline yet. The panel's options change
 * the preview and play it again; another result replaces it, with the same options. Add
 * boundary puts it (and its name label) on the timeline at the playhead, selects it and
 * closes the panel; closing the panel drops the preview.
 */

import React from 'react';
import { Hexagon, Check, MapPin, Plus } from 'lucide-react';
import { applyBoundaryDetail, type BoundaryDetailId } from '@/engine/boundaryDetail';
import { labelPoint } from '@/engine/labelPoint';
import { useProjectStore } from '@/store/useProjectStore';
import { createBoundaryItem, createCalloutItem, DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import type { BoundaryItem, BoundaryStyle, CalloutItem } from '@/store/types';
import { withHistoryLabel } from '@/store/history';
import { parseBoundaryAnimationStyle } from '@/store/domainValues';
import { shortPlaceName, type NominatimResult } from '@/services/nominatim';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { SwitchRow } from '@/components/Inspector/controls/SwitchRow';
import { ColorRow } from '@/components/Inspector/controls/ColorRow';
import { BoundarySearch } from '../Inspector/BoundarySearch';
import { BoundaryDetailPicker } from './BoundaryDetailPicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { SectionLabel, Field } from '@/components/ui/field';
import { BOUNDARY_ADD_TERMS, BOUNDARY_ANIMATION_LABELS, BOUNDARY_TERMS } from '@/lib/terms';

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

/** Shows a boundary, and its name label, in the panel's preview; `play` plays their entrance again. */
function stage(boundary: BoundaryItem, label: CalloutItem | null, { play = true } = {}) {
  const { stageItems, playAppearPreview } = useProjectStore.getState();
  const items = label ? [boundary, label] : [boundary];
  stageItems(items);
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
  const staged = useProjectStore((s) => s.stagedItems);
  const boundary = staged.find((item): item is BoundaryItem => item.kind === 'boundary') ?? null;
  const label = staged.find((item): item is CalloutItem => item.kind === 'callout') ?? null;
  /** The outline as found, before the detail level is applied. */
  const [outline, setOutline] = React.useState<GeoJSON.Geometry | null>(null);
  // Choices that carry over to the next place chosen: a flag (for a country) and a name label.
  const [flag, setFlag] = React.useState(false);
  const [nameLabel, setNameLabel] = React.useState(false);

  // Closing the panel, or leaving the editor, drops the preview.
  React.useEffect(() => {
    if (isOpen) return;
    useProjectStore.getState().stageItems([]);
    setOutline(null);
    setFlag(false);
    setNameLabel(false);
  }, [isOpen]);
  React.useEffect(() => () => useProjectStore.getState().stageItems([]), []);

  const handleSelect = (result: NominatimResult) => {
    const placeName = shortPlaceName(result.display_name);
    const flagCode = result.countryCode;
    // The style carries over from the boundary previewed before, with this place's flag.
    const style: BoundaryStyle = { ...(boundary?.style ?? DEFAULT_BOUNDARY_STYLE), flagCode, ...fillStyle(flag && !!flagCode) };
    const item = createBoundaryItem({
      placeName,
      geojson: applyBoundaryDetail(result.geojson, boundaryDetail),
      startTime: useProjectStore.getState().playheadTime,
      style,
    });
    stage(item, nameLabel ? createNameLabel(item) : null);
    setOutline(result.geojson);
    frame.frameGeometry(result.geojson);
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

  const handleAdd = () => {
    if (!boundary) return;
    withHistoryLabel(label ? `Added boundary and label ${boundary.placeName}` : 'Added boundary', () =>
      useProjectStore.getState().addStagedItems(),
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
    <Button variant={boundary ? 'default' : 'secondary'} onClick={handleAdd} disabled={!boundary} className="w-full">
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
      {!boundary ? (
        <EmptyState
          variant="dropdown"
          icon={MapPin}
          title="No location selected"
          description={BOUNDARY_ADD_TERMS.empty}
        />
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>
            <SectionLabel>{BOUNDARY_ADD_TERMS.preview}</SectionLabel>
            <div className="flex items-center gap-2 overflow-hidden p-3 rounded-xl bg-primary/5 border border-primary/10">
              <Check size={14} className="text-primary shrink-0" />
              <span className="text-xs font-medium truncate">{boundary.placeName}</span>
            </div>
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
            <SectionLabel>Detail</SectionLabel>
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
