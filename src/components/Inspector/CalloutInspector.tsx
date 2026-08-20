import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  TimingControls, 
  VisualCardSelect 
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
        placeholder="Callout Title"
      />

      <Accordion type="multiple" defaultValue={['location', 'appearance', 'connector', 'position', 'timing']} className="w-full">
        
        <InspectorSection value="location" title="Location & Content">
          <div className="flex flex-col gap-2.5">
            <SearchField
              label="Search places or coordinates..."
              value={item.lngLat}
              name=""
              onSelect={(coords, name) => {
                const patch: Partial<CalloutItem> = { lngLat: coords };
                if (item.linkTitleToLocation) patch.title = name;
                u(patch);
              }}
              isPicking={editingRoutePoint === 'callout'}
              onStartPick={() => {
                const active = editingRoutePoint === 'callout';
                setEditingRoutePoint(active ? null : 'callout');
                setEditingItemId(active ? null : item.id);
              }}
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

            <div className="flex items-center justify-between gap-3 text-xs py-0.5">
              <span className="text-xs font-medium text-muted-foreground shrink-0 w-28">Font</span>
              <div className="flex-1">
                <Select value={item.style.fontFamily} onValueChange={(v) => us({ fontFamily: v })}>
                  <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50 rounded-lg w-full">
                    <span style={{ fontFamily: item.style.fontFamily }}>
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {MAP_FONTS.map(f => (
                      <SelectItem key={f} value={f} className="text-xs">
                        <span style={{ fontFamily: f }}>{f}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {item.style.variant !== 'topo' && (
              <ColorRow
                label="Background"
                value={item.style.bgColor}
                onChange={(v) => us({ bgColor: v })}
              />
            )}

            <ColorRow
              label="Text"
              value={item.style.textColor}
              onChange={(v) => us({ textColor: v })}
            />

            {(item.style.variant === 'modern' || item.style.variant === 'news' || item.style.variant === 'topo') && (
              <ColorRow
                label="Accent"
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
                label="Show GPS Metadata"
                checked={!!item.style.showMetadata}
                onChange={(v) => us({ showMetadata: v })}
              />
            )}
          </div>
        </InspectorSection>

        <InspectorSection value="connector" title="Connector">
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
              className={`w-full h-11 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                isMoveModeActive 
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20" 
                  : "bg-background/60 hover:bg-secondary/80 border-border/60 text-foreground shadow-2xs hover:shadow-xs"
              }`}
            >
              {isMoveModeActive ? <Check size={15} /> : <Crosshair size={15} />}
              <span>{isMoveModeActive ? 'Done Positioning' : 'Move on map'}</span>
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

            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between gap-3 p-2 px-3 bg-secondary/30 rounded-xl border border-border/40">
                <span className="text-xs font-medium text-muted-foreground">Longitude</span>
                <input
                  type="number"
                  value={isNaN(item.lngLat[0]) ? '' : item.lngLat[0]}
                  onChange={(e) => u({ lngLat: [Number(e.target.value), item.lngLat[1]], linkTitleToLocation: false })}
                  step={0.0001}
                  className="h-8 text-xs font-mono text-right w-28 bg-background/60 border border-border/40 rounded-lg px-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center justify-between gap-3 p-2 px-3 bg-secondary/30 rounded-xl border border-border/40">
                <span className="text-xs font-medium text-muted-foreground">Latitude</span>
                <input
                  type="number"
                  value={isNaN(item.lngLat[1]) ? '' : item.lngLat[1]}
                  onChange={(e) => u({ lngLat: [item.lngLat[0], Number(e.target.value)], linkTitleToLocation: false })}
                  step={0.0001}
                  className="h-8 text-xs font-mono text-right w-28 bg-background/60 border border-border/40 rounded-lg px-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>
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


