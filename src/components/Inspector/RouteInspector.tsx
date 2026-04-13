import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import { RoutePlanner } from './RoutePlanner';
import { Accordion } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, SwitchField } from '@/components/ui/field';
import { ColorPicker } from '@/components/ui/color-picker';
import { InputText, InputNumber, SliderField, EasingSelect } from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';

export function RouteInspector({ item }: { item: RouteItem }) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const deleteItem = useProjectStore((s) => s.removeItem);
  const selectItem = useProjectStore((s) => s.selectItem);

  const u = (patch: Partial<RouteItem>) => updateItem(item.id, patch as any);
  const us = (patch: Partial<RouteItem['style']>) => u({ style: { ...item.style, ...patch } });

  const animType = item.style.animationType || 'draw';
  const footer = <ItemActions id={item.id} kind="route" />;

  return (
    <PanelWrapper title={`Route: ${item.name}`} footer={footer}>
      <Field label="Name"><InputText value={item.name} onChange={(v) => u({ name: v })} /></Field>

      <div className="mb-6 px-1">
        <RoutePlanner item={item} />
      </div>

      <Accordion type="multiple" defaultValue={['timing', 'style']} className="w-full">
        <InspectorSection value="timing" title="Timing">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start (s)"><InputNumber value={item.startTime} onChange={(v) => u({ startTime: v })} min={0} step={0.1} /></Field>
            <Field label="End (s)"><InputNumber value={item.endTime} onChange={(v) => u({ endTime: v })} min={0} step={0.1} /></Field>
          </div>
          <EasingSelect value={item.easing} onChange={(v) => u({ easing: v })} />
          
          {animType === 'draw' && (
            <Field label="Exit Animation">
              <Select 
                value={item.exitAnimation || 'none'} 
                onValueChange={(v) => u({ exitAnimation: v as any })}
              >
                <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="reverse">Reverse</SelectItem>
                  <SelectItem value="fade">Fade</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        </InspectorSection>

        <InspectorSection value="style" title="Style">
          <Field label="Animation">
            <Select value={animType} onValueChange={(v) => us({ animationType: v as RouteItem['style']['animationType'] })}>
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draw">Draw</SelectItem>
                <SelectItem value="navigation">Navigation</SelectItem>
                <SelectItem value="comet">Comet</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Color"><ColorPicker value={item.style.color} onChange={(v) => us({ color: v })} /></Field>
          <SliderField label="Width" value={item.style.width} onChange={(v) => us({ width: v })} min={1} max={12} step={1} />

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
        </InspectorSection>
      </Accordion>
    </PanelWrapper>
  );
}
