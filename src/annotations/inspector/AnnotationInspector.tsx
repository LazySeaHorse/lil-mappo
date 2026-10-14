/**
 * AnnotationInspector — replaces CalloutInspector.
 *
 * Shared inspector shell with dynamic style-specific controls.
 * No switch(variant) anywhere — controls are generated from the style definition.
 */

import React from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import { useMapPicker } from '@/hooks/useMapPicker';
import type { CalloutItem } from '@/store/types';
import { Button } from "@/components/ui/button";
import { Check, Crosshair, MapPin } from 'lucide-react';
import { SearchField } from '@/components/Search/SearchField';
import {
  SliderRow,
  ColorRow,
  SwitchRow,
  SelectRow,
  CoordinatesRows,
} from '@/components/Inspector/InspectorShared';
import { PanelWrapper } from '@/components/Inspector/InspectorLayout';
import { InspectorSection } from '@/components/Inspector/InspectorSection';
import { Disclosure } from '@/components/Inspector/controls/Disclosure';
import { InspectorHeader } from '@/components/Inspector/InspectorHeader';
import { TimingSection } from '@/components/Inspector/timing/TimingSection';
import { calloutTiming } from '@/components/Inspector/timing/timingAdapters';
import { getStyle } from '@/annotations/registry';
import { switchCalloutStyle } from '@/store/itemFactories';
import { placeLabel } from '@/engine/routeMode';
import { CALLOUT_LOCATION_TERMS, STYLE_TERMS } from '@/lib/terms';
import { undo } from '@/store/history';
import { DynamicControls } from './DynamicControls';
import { StylePicker } from './StylePicker';
import { ContentFields } from './ContentFields';
import { SizeControls } from './SizeControls';

/**
 * The patch that moves a callout to a point. A name says which place it is; no
 * name (typed or edited coordinates, a pick with no place) clears the old one,
 * so the stored name never describes another place. A title that follows the
 * place name follows a real name; with no name it keeps its text and stops
 * following.
 */
function movePatch(item: CalloutItem, lngLat: [number, number], name: string): Partial<CalloutItem> {
  const altitude = item.binding.kind === 'geographic' ? item.binding.altitude : 0;
  const patch: Partial<CalloutItem> = {
    binding: { kind: 'geographic', lngLat, altitude },
    locationName: name,
  };
  if (item.linkTitleToLocation) {
    if (name) patch.content = { ...item.content, title: name };
    else patch.linkTitleToLocation = false;
  }
  return patch;
}

export function AnnotationInspector({ item }: { item: CalloutItem }) {
  const { updateItem, isMoveModeActive, setMoveModeActive } = useProjectStore(
    useShallow(s => ({
      updateItem: s.updateItem,
      isMoveModeActive: s.isMoveModeActive,
      setMoveModeActive: s.setMoveModeActive,
    }))
  );

  const { isPicking, toggle: handleTogglePick } = useMapPicker(`callout-${item.id}`, {
    ownerId: item.id,
    prompt: 'Callout',
    onPick: (result) => {
      // Read the latest item: it may have been edited since picking started.
      const current = useProjectStore.getState().items[item.id];
      if (current?.kind !== 'callout') return;
      updateItem(item.id, movePatch(current, result.lngLat, result.name));
    },
  });

  const u = (updates: Partial<CalloutItem>) => updateItem(item.id, updates);
  const updateSettings = (changes: Record<string, unknown>) => {
    u({ settings: { ...item.settings, ...changes } });
  };

  const style = getStyle(item.styleId);
  const supportsAltitude = style?.supportsAltitude !== false;
  const lngLat = item.binding.kind === 'geographic' ? item.binding.lngLat : [0, 0] as [number, number];
  const altitude = item.binding.kind === 'geographic' ? item.binding.altitude : 0;

  return (
    <PanelWrapper
      title="Callout"
      icon={<MapPin size={15} />}
      header={
        <InspectorHeader
          kind="callout"
          id={item.id}
          name={item.content.title}
          onRename={(v) => u({ content: { ...item.content, title: v }, linkTitleToLocation: false })}
          placeholder="Callout title"
          startTime={item.startTime}
        />
      }
    >

      <InspectorSection kind="callout" id="style">
        <StylePicker
          value={item.styleId}
          title={item.content.title}
          onChange={(newStyleId) => {
            const patch = switchCalloutStyle(item, newStyleId);
            if (!patch) return;
            u(patch);
            toast(STYLE_TERMS.changed, { action: { label: STYLE_TERMS.undo, onClick: () => { undo(); } } });
          }}
        />
      </InspectorSection>

      <InspectorSection kind="callout" id="location">
        <SearchField
          label={CALLOUT_LOCATION_TERMS.search}
          value={lngLat as [number, number]}
          name={placeLabel(item.locationName, lngLat as [number, number])}
          onSelect={(coords, name) => {
            u(movePatch(item, coords, name));
            toast.success(CALLOUT_LOCATION_TERMS.updated);
          }}
          parseCoordinates
          isPicking={isPicking}
          onStartPick={handleTogglePick}
          className="px-0"
        />

        <Button
          type="button"
          onClick={() => setMoveModeActive(!isMoveModeActive)}
          variant={isMoveModeActive ? 'default' : 'outline'}
          className="w-full h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-2"
        >
          {isMoveModeActive ? <Check size={15} /> : <Crosshair size={15} />}
          <span>{isMoveModeActive ? CALLOUT_LOCATION_TERMS.doneDragging : CALLOUT_LOCATION_TERMS.dragOnMap}</span>
        </Button>

        {supportsAltitude && (
          <SliderRow
            label={CALLOUT_LOCATION_TERMS.heightAboveMap}
            hint={CALLOUT_LOCATION_TERMS.heightHint}
            value={altitude}
            onChange={(v) => u({
              binding: item.binding.kind === 'geographic'
                ? { ...item.binding, altitude: v }
                : item.binding,
            })}
            min={0}
            max={150}
            step={2}
            unit="px"
          />
        )}

        <Disclosure label={CALLOUT_LOCATION_TERMS.exactPosition}>
          <CoordinatesRows
            lngLat={lngLat as [number, number]}
            onChange={(coords) => u(movePatch(item, coords, ''))}
          />
        </Disclosure>
      </InspectorSection>

      <InspectorSection kind="callout" id="content">
        <SwitchRow
          label={CALLOUT_LOCATION_TERMS.linkTitle}
          checked={item.linkTitleToLocation}
          onChange={(v) => u({ linkTitleToLocation: v })}
        />

        <ContentFields
          content={item.content}
          slots={style?.contentSlots ?? []}
          eyebrowFallback={style?.eyebrowFallback}
          onChange={(content) => u({ content })}
        />
      </InspectorSection>

      {style && style.controls.length > 0 && (
        <InspectorSection kind="callout" id="appearance">
          <DynamicControls
            controls={style.controls}
            settings={item.settings}
            onUpdate={updateSettings}
          />
        </InspectorSection>
      )}

      <InspectorSection kind="callout" id="size">
        <SizeControls item={item} onChange={u} />
      </InspectorSection>

      {supportsAltitude && !style?.drawsConnector && (
        <InspectorSection kind="callout" id="connector">
          <div className="flex flex-col gap-2.5">
            <SwitchRow
              label="Show anchor line"
              checked={item.connector.visible}
              onChange={(v) => u({ connector: { ...item.connector, visible: v } })}
            />
            {item.connector.visible && (
              <ColorRow
                label="Line color"
                value={item.connector.color}
                onChange={(v) => u({ connector: { ...item.connector, color: v } })}
              />
            )}
          </div>
        </InspectorSection>
      )}

      <TimingSection adapter={calloutTiming} item={item} onChange={u} />

    </PanelWrapper>
  );
}
