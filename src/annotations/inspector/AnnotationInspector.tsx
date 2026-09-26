/**
 * AnnotationInspector — replaces CalloutInspector.
 *
 * Shared inspector shell with dynamic style-specific controls.
 * No switch(variant) anywhere — controls are generated from the style definition.
 */

import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { Check, Crosshair, MapPin } from 'lucide-react';
import { SearchField } from '@/components/Search/SearchField';
import {
  EditableTitle,
  SliderRow,
  ColorRow,
  SwitchRow,
  TimingControls,
  CoordinatesRows,
} from '@/components/Inspector/InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from '@/components/Inspector/InspectorLayout';
import { getStyle } from '@/annotations/registry';
import { DynamicControls } from './DynamicControls';
import { StylePicker } from './StylePicker';

export function AnnotationInspector({ item }: { item: CalloutItem }) {
  const {
    updateItem, isMoveModeActive, setMoveModeActive,
    activePicker, startPicking, stopPicking,
  } = useProjectStore();

  const pickerId = `callout-${item.id}`;
  const isPicking = activePicker?.id === pickerId;

  const handleTogglePick = () => {
    if (isPicking) {
      stopPicking();
    } else {
      startPicking({
        id: pickerId,
        prompt: 'Callout',
        onPick: (result) => {
          const patch: Partial<CalloutItem> = {
            binding: {
              ...item.binding,
              kind: 'geographic',
              lngLat: result.lngLat,
            } as CalloutItem['binding'],
          };
          if (item.linkTitleToLocation) {
            patch.content = { ...item.content, title: result.name };
          }
          u(patch);
        },
      });
    }
  };

  useEffect(() => {
    return () => {
      if (useProjectStore.getState().activePicker?.id === pickerId) {
        useProjectStore.getState().stopPicking();
      }
    };
  }, [pickerId]);

  const u = (updates: Partial<CalloutItem>) => updateItem(item.id, updates);
  const updateSettings = (key: string, value: unknown) => {
    u({ settings: { ...item.settings, [key]: value } });
  };

  const style = getStyle(item.styleId);
  const lngLat = item.binding.kind === 'geographic' ? item.binding.lngLat : [0, 0] as [number, number];
  const altitude = item.binding.kind === 'geographic' ? item.binding.altitude : 0;

  const footer = <ItemActions id={item.id} kind="callout" customLabel="Delete Callout" />;

  return (
    <PanelWrapper
      title="Callout"
      icon={<MapPin size={15} />}
      footer={footer}
    >
      <EditableTitle
        value={item.content.title}
        onChange={(v) => u({ content: { ...item.content, title: v }, linkTitleToLocation: false })}
        placeholder="Callout title"
      />

      <Accordion type="multiple" defaultValue={['style', 'location', 'appearance', 'connector', 'position', 'timing']} className="w-full">

        <InspectorSection value="style" title="Style">
          <StylePicker
            value={item.styleId}
            onChange={(newStyleId) => {
              const newStyle = getStyle(newStyleId);
              if (!newStyle) return;
              u({
                styleId: newStyleId,
                styleVersion: newStyle.version,
                settings: { ...newStyle.defaultSettings } as Record<string, unknown>,
                connector: {
                  ...item.connector,
                  ...newStyle.defaultConnector,
                },
                ...(newStyle.defaultTransition ? { transition: { ...item.transition, ...newStyle.defaultTransition } } : {}),
              });
            }}
          />
        </InspectorSection>

        <InspectorSection value="location" title="Location and content">
          <div className="flex flex-col gap-2.5">
            <SearchField
              label="Search for a place or enter coordinates"
              value={lngLat as [number, number]}
              name=""
              onSelect={(coords, name) => {
                const patch: Partial<CalloutItem> = {
                  binding: {
                    kind: 'geographic',
                    lngLat: coords,
                    altitude,
                  },
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
          </div>
        </InspectorSection>

        {style && style.controls.length > 0 && (
          <InspectorSection value="appearance" title="Appearance">
            <DynamicControls
              controls={style.controls}
              settings={item.settings}
              onUpdate={updateSettings}
            />
          </InspectorSection>
        )}

        <InspectorSection value="connector" title="Anchor line">
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

        <InspectorSection value="position" title="Position">
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

            <SliderRow
              label="Altitude"
              value={altitude}
              onChange={(v) => u({
                binding: item.binding.kind === 'geographic'
                  ? { ...item.binding, altitude: v }
                  : item.binding,
              })}
              min={0}
              max={500}
              step={5}
              unit="m"
            />

            <CoordinatesRows
              lngLat={lngLat as [number, number]}
              onChange={(coords) => u({
                binding: {
                  kind: 'geographic',
                  lngLat: coords,
                  altitude,
                },
                linkTitleToLocation: false,
              })}
              className="pt-1"
            />
          </div>
        </InspectorSection>

        <InspectorSection value="timing" title="Timing">
          <TimingControls
            startTime={item.startTime}
            endTime={item.endTime}
            onChangeTime={(start, end) => u({ startTime: start, endTime: end })}
          />
        </InspectorSection>

      </Accordion>
    </PanelWrapper>
  );
}
