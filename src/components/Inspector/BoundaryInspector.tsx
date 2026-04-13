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
      <Accordion type="multiple" defaultValue={['data', 'style']} className="w-full mt-2">
        
        <InspectorSection value="data" title="Location Data">
          <Field label="Place Name">
            <BoundarySearch
              initialValue={item.placeName}
              onSelect={handleSelect}
              onSearchingChange={(loading) => u({ resolveStatus: loading ? 'loading' : 'idle' } as any)}
            />
          </Field>
          
          <div className="px-1 mt-3 pb-1">
            {item.resolveStatus === 'resolved' ? (
              <div className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                <span className="text-[10px] font-bold uppercase tracking-wider">✓ Boundary Mapped</span>
              </div>
            ) : item.resolveStatus === 'loading' ? (
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Searching...</span>
            ) : null}
          </div>
        </InspectorSection>

        <InspectorSection value="style" title="Appearance">
          <BoundaryStyleControls style={item.style} onChange={us} />
        </InspectorSection>

        <InspectorSection value="timing" title="Timing">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Start Time"><InputNumber value={item.startTime} onChange={(v) => u({ startTime: v })} min={0} step={0.1} /></Field>
            <Field label="End Time"><InputNumber value={item.endTime} onChange={(v) => u({ endTime: v })} min={0} step={0.1} /></Field>
          </div>
          <EasingSelect value={item.easing} onChange={(v) => u({ easing: v })} />
          
          {item.style.animationStyle !== 'trace' && (
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
      </Accordion>
    </PanelWrapper>
  );
}
