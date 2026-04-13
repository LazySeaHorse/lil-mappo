import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { Check, Crosshair } from 'lucide-react';
import { MAP_FONTS } from '@/constants/fonts';
import { SearchField } from '../Search/SearchField';
import { Field, InputText, InputNumber, SliderField } from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';
import { ColorPicker } from '@/components/ui/color-picker';
import { SwitchField } from '@/components/ui/field';

export function CalloutInspector({ item }: { item: CalloutItem }) {
  const {
    updateItem, removeItem, selectItem, isMoveModeActive, setMoveModeActive,
    editingRoutePoint, setEditingRoutePoint, setEditingItemId
  } = useProjectStore();
  const u = (updates: Partial<CalloutItem>) => updateItem(item.id, updates as any);
  const us = (updates: Partial<CalloutItem['style']>) => u({ style: { ...item.style, ...updates } });

  const footer = <ItemActions id={item.id} kind="callout" />;

  return (
    <PanelWrapper title={`Callout: ${item.title}`} footer={footer}>
      <Accordion type="multiple" defaultValue={['content', 'style']} className="w-full">
        
        <InspectorSection value="content" title="Content & Location">
          <Field label="Location Search">
            <SearchField
              label="Search places..."
              value={item.lngLat}
              name={""} // name is only for initial load in search field, we use current lngLat for center bias
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
          </Field>

          <div className="flex items-center justify-between px-1 mb-2 mt-4">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Title</label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Sync to Place Name</span>
              <Switch
                checked={item.linkTitleToLocation}
                onCheckedChange={(v) => u({ linkTitleToLocation: v })}
                className="scale-75"
              />
            </div>
          </div>
          <Field label="">
            <InputText
              value={item.title}
              onChange={(v) => u({ title: v, linkTitleToLocation: false })}
            />
          </Field>
        </InspectorSection>

        <InspectorSection value="style" title="Style">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-3">Typography</label>
          
          <Field label="Style Variant">
            <Select value={item.style.variant || 'default'} onValueChange={(v) => us({ variant: v as any })}>
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Standard Box</SelectItem>
                <SelectItem value="modern">Modern Pill</SelectItem>
                <SelectItem value="news">News Highlight</SelectItem>
                <SelectItem value="topo">Topo Data</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          
          <Field label="Font Family">
            <Select value={item.style.fontFamily} onValueChange={(v) => us({ fontFamily: v })}>
              <SelectTrigger className="h-8 text-sm w-full">
                <span style={{ fontFamily: item.style.fontFamily }}>
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {MAP_FONTS.map(f => (
                  <SelectItem key={f} value={f}>
                    <span style={{ fontFamily: f }}>{f}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mt-6 mb-3">Card Aesthetics</label>

          {item.style.variant !== 'topo' && (
            <>
              <Field label="BG Color"><ColorPicker value={item.style.bgColor} onChange={(v) => us({ bgColor: v })} /></Field>
              <SliderField label="Max Width" value={item.style.maxWidth} onChange={(v) => us({ maxWidth: v })} min={150} max={400} step={10} />
            </>
          )}
          <Field label="Text Color"><ColorPicker value={item.style.textColor} onChange={(v) => us({ textColor: v })} /></Field>

          {(item.style.variant === 'modern' || item.style.variant === 'news' || item.style.variant === 'topo') && (
            <Field label="Accent Color"><ColorPicker value={item.style.accentColor} onChange={(v) => us({ accentColor: v })} /></Field>
          )}

          {item.style.variant === 'topo' && (
            <SwitchField checked={item.style.showMetadata} onChange={(v) => us({ showMetadata: v })} label="Show GPS Metadata" />
          )}

          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mt-6 mb-3">Connector</label>
          <SwitchField checked={item.poleVisible} onChange={(v) => u({ poleVisible: v })} label="Show Pole" />
          {item.poleVisible && <Field label="Pole Color"><ColorPicker value={item.poleColor} onChange={(v) => u({ poleColor: v })} /></Field>}
        </InspectorSection>

        <InspectorSection value="transform" title="3D Transform">
          <div className="flex items-center justify-between px-1 mb-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Manual Map Pick</label>
            <Button
              onClick={() => setMoveModeActive(!isMoveModeActive)}
              size="sm"
              variant={isMoveModeActive ? "default" : "secondary"}
              className={`h-7 px-3 text-[10px] uppercase font-bold tracking-tight rounded-full transition-all ${isMoveModeActive ? "shadow-lg scale-105" : ""}`}
            >
              {isMoveModeActive ? <Check size={12} /> : <Crosshair size={12} />}
              <span className="ml-1.5">{isMoveModeActive ? 'Done' : 'Move on Map'}</span>
            </Button>
          </div>
          <div className={`grid grid-cols-2 gap-3 transition-opacity mb-4 ${isMoveModeActive ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <Field label="Longitude"><InputNumber value={item.lngLat[0]} onChange={(v) => u({ lngLat: [v, item.lngLat[1]], linkTitleToLocation: false })} step={0.001} /></Field>
            <Field label="Latitude"><InputNumber value={item.lngLat[1]} onChange={(v) => u({ lngLat: [item.lngLat[0], v], linkTitleToLocation: false })} step={0.001} /></Field>
          </div>
          <SliderField label="Altitude (m)" value={item.altitude} onChange={(v) => u({ altitude: v })} min={0} max={500} step={5} />
        </InspectorSection>

        <InspectorSection value="timing" title="Timing">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Start Time"><InputNumber value={item.startTime} onChange={(v) => u({ startTime: v })} min={0} step={0.1} /></Field>
            <Field label="End Time"><InputNumber value={item.endTime} onChange={(v) => u({ endTime: v })} min={0} step={0.1} /></Field>
          </div>
        </InspectorSection>

      </Accordion>
    </PanelWrapper>
  );
}
