import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem } from '@/store/types';
import { NominatimResult } from '@/services/nominatim';
import { toast } from 'sonner';
import { Accordion } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BoundarySearch } from './BoundarySearch';
import { BoundaryStyleControls } from './BoundaryStyleControls';
import { Field, SwitchField, InputNumber, EasingSelect } from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';

export function BoundaryInspector({ item }: { item: BoundaryItem }) {
  const { updateItem } = useProjectStore();

  const u = (updates: Partial<BoundaryItem>) => updateItem(item.id, updates as any);
  const us = (updates: Partial<BoundaryItem['style']>) => u({ style: { ...item.style, ...updates } });

  const handleSelect = (r: NominatimResult) => {
    u({
      geojson: r.geojson,
      resolveStatus: 'resolved',
      placeName: r.display_name.split(',')[0]
    } as any);
    toast.success('Boundary resolved');
  };

  const footer = <ItemActions id={item.id} kind="boundary" />;

  return (
    <PanelWrapper title={`Boundary: ${item.placeName || 'New'}`} footer={footer}>
      <Field label="Place Name">
        <BoundarySearch
          initialValue={item.placeName}
          onSelect={handleSelect}
          onSearchingChange={(loading) => u({ resolveStatus: loading ? 'loading' : 'idle' } as any)}
        />
      </Field>

      {item.resolveStatus === 'resolved' && <p className="text-[10px] text-primary font-bold uppercase tracking-wider px-1 mb-3">✓ Boundary resolved</p>}

      <Accordion type="multiple" defaultValue={['timing', 'style']} className="w-full">
        <InspectorSection value="timing" title="Timing">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start (s)"><InputNumber value={item.startTime} onChange={(v) => u({ startTime: v })} min={0} step={0.1} /></Field>
            <Field label="End (s)"><InputNumber value={item.endTime} onChange={(v) => u({ endTime: v })} min={0} step={0.1} /></Field>
          </div>
          <EasingSelect value={item.easing} onChange={(v) => u({ easing: v })} />
          
          {item.style.animationStyle !== 'trace' && (
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
          <BoundaryStyleControls style={item.style} onChange={us} />
        </InspectorSection>
      </Accordion>
    </PanelWrapper>
  );
}
