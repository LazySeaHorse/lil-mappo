import React from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem, EasingName, AutoCamConfig } from '@/store/types';
import { RoutePlanner } from './RoutePlanner';
import { Accordion } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, SwitchField } from '@/components/ui/field';
import { Clapperboard } from 'lucide-react';
import { ColorPicker } from '@/components/ui/color-picker';
import { InputText, InputNumber, SliderField, EasingSelect } from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';

const AUTO_CAM_DEFAULTS: AutoCamConfig = {
  enabled: true,
  mode: 'cinematic',
  pitch: 65,
  smoothing: 0.3,
  distance: 500,
  height: 300,
  zoom: 14,
  lookAhead: 300,
  easing: 'easeInOutSine' as EasingName,
};

export function RouteInspector({ item }: { item: RouteItem }) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const deleteItem = useProjectStore((s) => s.removeItem);
  const selectItem = useProjectStore((s) => s.selectItem);

  const u = (patch: Partial<RouteItem>) => updateItem(item.id, patch as any);
  const us = (patch: Partial<RouteItem['style']>) => u({ style: { ...item.style, ...patch } });

  const handleAutoCamToggle = (enabled: boolean) => {
    if (enabled) {
      // Require geometry
      let coordCount = 0;
      for (const f of item.geojson.features) {
        if (f.geometry.type === 'LineString') coordCount += (f.geometry.coordinates as any[]).length;
        else if (f.geometry.type === 'MultiLineString') for (const l of (f.geometry.coordinates as any[])) coordCount += l.length;
      }
      if (coordCount < 2) {
        toast.error('Add a route path before enabling Auto Camera.');
        return;
      }

      // Check for overlap with other enabled auto-cam routes
      const allItems = useProjectStore.getState().items;
      const overlapping = Object.values(allItems).find(
        (other) =>
          other.id !== item.id &&
          other.kind === 'route' &&
          (other as RouteItem).autoCam?.enabled &&
          (other as RouteItem).startTime < item.endTime &&
          (other as RouteItem).endTime > item.startTime,
      ) as RouteItem | undefined;

      if (overlapping) {
        toast.error(`"${overlapping.name}" already has Auto Camera on in this time range.`);
        return;
      }

      // Preserve prior settings if they exist, otherwise use defaults
      u({ autoCam: { ...AUTO_CAM_DEFAULTS, ...(item.autoCam ?? {}), enabled: true } });
    } else {
      u({ autoCam: item.autoCam ? { ...item.autoCam, enabled: false } : undefined });
    }
  };

  const animType = item.style.animationType || 'draw';
  const footer = <ItemActions id={item.id} kind="route" />;

  return (
    <PanelWrapper title={`Route: ${item.name}`} footer={footer}>
      <Field label="Name"><InputText value={item.name} onChange={(v) => u({ name: v })} /></Field>

      <Accordion type="multiple" defaultValue={['path', 'style', 'timing', 'autocam']} className="w-full mt-4">
        
        <InspectorSection value="path" title="Path Data">
          <div className="px-1 mt-1 mb-2">
            <RoutePlanner item={item} />
          </div>
        </InspectorSection>

        <InspectorSection value="style" title="Style">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-3">Route Look</label>
          <Field label="Animation Type">
            <Select value={animType} onValueChange={(v) => us({ animationType: v as RouteItem['style']['animationType'] })}>
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draw">Animated Path</SelectItem>
                <SelectItem value="navigation">Reveal Progress</SelectItem>
                <SelectItem value="comet">Meteor Trail</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Color"><ColorPicker value={item.style.color} onChange={(v) => us({ color: v })} /></Field>
          <SliderField label="Width" value={item.style.width} onChange={(v) => us({ width: v })} min={1} max={12} step={1} />

          {animType !== 'comet' && (
            <Field label="Dash Pattern">
              <Select value={item.style.dashPattern ? (item.style.dashPattern[0] === 2 ? 'dotted' : 'dashed') : 'solid'} onValueChange={(v) => us({ dashPattern: v === 'dashed' ? [8, 4] : v === 'dotted' ? [2, 4] : null })}>
                <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="dashed">Dashed</SelectItem>
                  <SelectItem value="dotted">Dotted</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mt-6 mb-3">Trail Effects</label>
          {animType !== 'comet' && (
            <SwitchField checked={item.style.glow} onChange={(v) => us({ glow: v })} label="Glow" />
          )}

          {animType === 'comet' && (
            <SliderField
              label="Trail Length"
              value={item.style.cometTrailLength ?? 0.2}
              onChange={(v) => us({ cometTrailLength: v })}
              min={0.05}
              max={0.8}
              step={0.05}
            />
          )}

          {animType === 'draw' && (
            <>
              <SwitchField checked={item.style.trailFade} onChange={(v) => us({ trailFade: v })} label="Trail Fade" />
              {item.style.trailFade && <SliderField label="Fade Length" value={item.style.trailFadeLength} onChange={(v) => us({ trailFadeLength: v })} min={0.05} max={1} />}
            </>
          )}
        </InspectorSection>

        <InspectorSection value="timing" title="Timing">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Start Time"><InputNumber value={item.startTime} onChange={(v) => u({ startTime: v })} min={0} step={0.1} /></Field>
            <Field label="End Time"><InputNumber value={item.endTime} onChange={(v) => u({ endTime: v })} min={0} step={0.1} /></Field>
          </div>
          <EasingSelect value={item.easing} onChange={(v) => u({ easing: v })} />
          
          {animType === 'draw' && (
            <Field label="Exit Animation">
              <Select 
                value={item.exitAnimation || 'none'} 
                onValueChange={(v) => u({ exitAnimation: v as any })}
              >
                <SelectTrigger className="h-8 text-sm w-full mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Persist on Map</SelectItem>
                  <SelectItem value="reverse">Erase Backwards</SelectItem>
                  <SelectItem value="fade">Fade Out</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        </InspectorSection>
        <InspectorSection value="autocam" title="Auto Camera">
          <SwitchField
            checked={item.autoCam?.enabled ?? false}
            onChange={handleAutoCamToggle}
            label="Follow this route automatically"
          />
          {item.autoCam?.enabled && (
            <p className="text-[11px] text-sky-400/80 mt-2 flex items-center gap-1.5">
              <Clapperboard size={11} />
              Click the blue block in the Camera track to edit camera settings.
            </p>
          )}
        </InspectorSection>
      </Accordion>
    </PanelWrapper>
  );
}
