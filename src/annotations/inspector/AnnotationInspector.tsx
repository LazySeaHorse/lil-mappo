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
import { InspectorHeader } from '@/components/Inspector/InspectorHeader';
import { TimingSection } from '@/components/Inspector/timing/TimingSection';
import { calloutTiming } from '@/components/Inspector/timing/timingAdapters';
import { getStyle } from '@/annotations/registry';
import { switchCalloutStyle } from '@/store/itemFactories';
import { placeLabel } from '@/engine/routeMode';
import { DynamicControls } from './DynamicControls';
import { StylePicker } from './StylePicker';
import { ContentFields } from './ContentFields';
import { SizeControls } from './SizeControls';

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
      const patch: Partial<CalloutItem> = {
        binding: {
          kind: 'geographic',
          lngLat: result.lngLat,
          altitude: current.binding.kind === 'geographic' ? current.binding.altitude : 0,
        },
        locationName: result.name,
      };
      if (current.linkTitleToLocation) {
        patch.content = { ...current.content, title: result.name };
      }
      updateItem(item.id, patch);
    },
  });

  const u = (updates: Partial<CalloutItem>) => updateItem(item.id, updates);
  const updateSettings = (key: string, value: unknown) => {
    u({ settings: { ...item.settings, [key]: value } });
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
          onChange={(newStyleId) => {
            const patch = switchCalloutStyle(item, newStyleId);
            if (patch) u(patch);
          }}
        />
      </InspectorSection>

      <InspectorSection kind="callout" id="location">
        <div className="flex flex-col gap-2.5">
          <SearchField
            label="Search for a place or enter coordinates"
            value={lngLat as [number, number]}
            name={placeLabel(item.locationName, lngLat as [number, number])}
            onSelect={(coords, name) => {
              const patch: Partial<CalloutItem> = {
                binding: {
                  kind: 'geographic',
                  lngLat: coords,
                  altitude,
                },
                locationName: name,
              };
              if (item.linkTitleToLocation) {
                patch.content = { ...item.content, title: name };
              }
              u(patch);
              toast.success('Callout location updated.');
            }}
            isPicking={isPicking}
            onStartPick={handleTogglePick}
            showDot={false}
            className="px-0"
            color={item.linkTitleToLocation
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-secondary/50 text-muted-foreground border-border/50"
            }
          />

          <SwitchRow
            label="Use place name as title"
            checked={item.linkTitleToLocation}
            onChange={(v) => u({ linkTitleToLocation: v })}
          />

          <ContentFields
            content={item.content}
            slots={style?.contentSlots ?? []}
            eyebrowFallback={style?.eyebrowFallback}
            onChange={(content) => u({ content })}
          />
        </div>
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

      <InspectorSection kind="callout" id="position">
        <div className="flex flex-col gap-3.5 pt-0.5">
          <Button
            type="button"
            onClick={() => setMoveModeActive(!isMoveModeActive)}
            variant={isMoveModeActive ? "default" : "outline"}
            className="w-full h-11 py-2.5 px-4 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow"
          >
            {isMoveModeActive ? <Check size={15} /> : <Crosshair size={15} />}
            <span>{isMoveModeActive ? 'Finish positioning' : 'Position on map'}</span>
          </Button>

          {supportsAltitude && (
            <SliderRow
              label="Altitude"
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

          <CoordinatesRows
            lngLat={lngLat as [number, number]}
            onChange={(coords) => u({
              binding: {
                kind: 'geographic',
                lngLat: coords,
                altitude,
              },
              linkTitleToLocation: false,
              locationName: '',
            })}
            className="pt-1"
          />
        </div>
      </InspectorSection>

      <TimingSection adapter={calloutTiming} item={item} onChange={u} />

    </PanelWrapper>
  );
}
