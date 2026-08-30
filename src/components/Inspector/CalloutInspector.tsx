import React from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { Check, Crosshair, MapPin, Square, Bookmark, Flag, Mountain } from 'lucide-react';
import { MAP_FONTS } from '@/constants/fonts';
import { SearchField } from '../Search/SearchField';
import { 
  EditableTitle, 
  SliderRow, 
  ColorRow, 
  SwitchRow, 
  SelectRow,
  TimingControls, 
  VisualCardSelect,
  CoordinatesRows
} from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';

export function CalloutInspector({ item }: { item: CalloutItem }) {
  const {
    updateItem, isMoveModeActive, setMoveModeActive,
    editingRoutePoint, setEditingRoutePoint, setEditingItemId
  } = useProjectStore();

  const u = (updates: Partial<CalloutItem>) => updateItem(item.id, updates as any);
  const us = (updates: Partial<CalloutItem['style']>) => u({ style: { ...item.style, ...updates } });

  const footer = <ItemActions id={item.id} kind="callout" customLabel="Delete Callout" />;

  const variantOptions = [
    { value: 'default', label: 'Standard', icon: <Square size={14} /> },
    { value: 'modern', label: 'Modern Pill', icon: <Bookmark size={14} /> },
    { value: 'news', label: 'News', icon: <Flag size={14} /> },
    { value: 'topo', label: 'Topo', icon: <Mountain size={14} /> },
  ] as const;

  return (
    <PanelWrapper 
      title="Callout" 
      icon={<MapPin size={15} />}
      footer={footer}
    >
      <EditableTitle 
        value={item.title} 
        onChange={(v) => u({ title: v, linkTitleToLocation: false })} 
        placeholder="Callout title"
      />

      <Accordion type="multiple" defaultValue={['location', 'appearance', 'connector', 'position', 'timing']} className="w-full">
        
        <InspectorSection value="location" title="Location and content">
          <div className="flex flex-col gap-2.5">
            <SearchField
              label="Search for a place or enter coordinates"
              value={item.lngLat}
              name=""
              onSelect={(coords, name) => {
                const patch: Partial<CalloutItem> = { lngLat: coords };
                if (item.linkTitleToLocation) patch.title = name;
                u(patch);
                toast.success('Callout location updated.');
              }}
              isPicking={editingRoutePoint === 'callout'}
              onStartPick={() => {
                const active = editingRoutePoint === 'callout';
                setEditingRoutePoint(active ? null : 'callout');
                setEditingItemId(active ? null : item.id);
              }}
              showDot={false}
              className="px-0"
              color={item.linkTitleToLocation ? "bg-primary/10 text-primary border-primary/20" : "bg-secondary/50 text-muted-foreground border-border/50"}
            />

            <SwitchRow
              label="Use place name as title"
              checked={item.linkTitleToLocation}
              onChange={(v) => u({ linkTitleToLocation: v })}
            />
          </div>
        </InspectorSection>

        <InspectorSection value="appearance" title="Appearance">
          <div className="flex flex-col gap-3.5">
            <VisualCardSelect
              options={variantOptions as any}
              value={item.style.variant || 'default'}
              onChange={(v) => us({ variant: v as any })}
              columns={4}
            />

            <SelectRow
              label="Font"
              value={item.style.fontFamily}
              onChange={(v) => us({ fontFamily: v })}
              options={MAP_FONTS.map((f) => ({ value: f, label: f, style: { fontFamily: f } }))}
              renderOption={(o) => <span style={{ fontFamily: o.value }}>{o.label}</span>}
            />

            {item.style.variant !== 'topo' && (
              <ColorRow
                label="Background color"
                value={item.style.bgColor}
                onChange={(v) => us({ bgColor: v })}
              />
            )}

            <ColorRow
              label="Text color"
              value={item.style.textColor}
              onChange={(v) => us({ textColor: v })}
            />

            {(item.style.variant === 'modern' || item.style.variant === 'news' || item.style.variant === 'topo') && (
              <ColorRow
                label="Accent color"
                value={item.style.accentColor}
                onChange={(v) => us({ accentColor: v })}
              />
            )}

            {item.style.variant !== 'topo' && (
              <SliderRow
                label="Card width"
                value={item.style.maxWidth}
                onChange={(v) => us({ maxWidth: v })}
                min={120}
                max={400}
                step={5}
                unit="px"
              />
            )}

            {item.style.variant === 'topo' && (
              <SwitchRow
                label="Show coordinates"
                checked={!!item.style.showMetadata}
                onChange={(v) => us({ showMetadata: v })}
              />
            )}
          </div>
        </InspectorSection>

        <InspectorSection value="connector" title="Anchor line">
          <div className="flex flex-col gap-2.5">
            <SwitchRow
              label="Show anchor line"
              checked={item.poleVisible}
              onChange={(v) => u({ poleVisible: v })}
            />
            {item.poleVisible && (
              <ColorRow
                label="Line color"
                value={item.poleColor}
                onChange={(v) => u({ poleColor: v })}
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
              value={item.altitude}
              onChange={(v) => u({ altitude: v })}
              min={0}
              max={500}
              step={5}
              unit="m"
            />

            <CoordinatesRows
              lngLat={item.lngLat}
              onChange={(coords) => u({ lngLat: coords, linkTitleToLocation: false })}
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

