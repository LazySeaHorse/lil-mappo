import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { CameraItem, RouteItem } from '@/store/types';
import { Accordion } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, InputNumber, SliderField, EasingSelect } from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';

export function CameraKFInspector({ item }: { item: CameraItem }) {
  const { selectedKeyframeId, updateCameraKeyframe, items } = useProjectStore();

  const kf = item.keyframes.find((k) => k.id === selectedKeyframeId);

  const footer = kf ? <ItemActions id={kf.id} kind="camera-kf" /> : null;

  if (!kf) {
    return (
      <PanelWrapper title="Camera Track" footer={footer}>
        <p className="text-xs text-muted-foreground">Select a keyframe on the timeline to edit it.</p>
        <p className="text-xs text-muted-foreground mt-2">{item.keyframes.length} keyframe{item.keyframes.length !== 1 ? 's' : ''}</p>
      </PanelWrapper>
    );
  }

  const u = (updates: Partial<typeof kf>) => updateCameraKeyframe(kf.id, updates);

  // Get available routes for follow route dropdown
  const routes = Object.values(items).filter((i) => i.kind === 'route') as RouteItem[];

  return (
    <PanelWrapper title={`Camera KF @ ${kf.time.toFixed(1)}s`} footer={footer}>
      <Field label="Time (s)"><InputNumber value={kf.time} onChange={(v) => u({ time: v })} min={0} step={0.1} /></Field>

      <Accordion type="multiple" defaultValue={['cam']} className="w-full">
        <InspectorSection value="cam" title="Camera">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Longitude"><InputNumber value={kf.camera.center[0]} onChange={(v) => u({ camera: { ...kf.camera, center: [v, kf.camera.center[1]] } })} step={0.001} /></Field>
            <Field label="Latitude"><InputNumber value={kf.camera.center[1]} onChange={(v) => u({ camera: { ...kf.camera, center: [kf.camera.center[0], v] } })} step={0.001} /></Field>
          </div>
          <SliderField label="Zoom" value={kf.camera.zoom} onChange={(v) => u({ camera: { ...kf.camera, zoom: v } })} min={0} max={22} step={0.1} />
          <SliderField label="Pitch" value={kf.camera.pitch} onChange={(v) => u({ camera: { ...kf.camera, pitch: v } })} min={0} max={85} step={1} />
          <SliderField label="Bearing" value={kf.camera.bearing} onChange={(v) => u({ camera: { ...kf.camera, bearing: v } })} min={0} max={360} step={1} />
          <EasingSelect value={kf.easing} onChange={(v) => u({ easing: v })} />
          {routes.length > 0 && (
            <Field label="Follow Route">
              <Select value={kf.followRoute || 'none'} onValueChange={(v) => u({ followRoute: v === 'none' ? null : v })}>
                <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {routes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
        </InspectorSection>
      </Accordion>
    </PanelWrapper>
  );
}
