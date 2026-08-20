import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { CameraItem, RouteItem } from '@/store/types';
import { Accordion } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SliderRow, EasingSelect, InputNumber } from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';
import { Video, Compass, ZoomIn, Eye, RotateCw, Sparkles } from 'lucide-react';

export function CameraKFInspector({ item }: { item: CameraItem }) {
  const { selectedKeyframeId, updateCameraKeyframe, items } = useProjectStore();

  const kf = item.keyframes.find((k) => k.id === selectedKeyframeId);

  const footer = kf ? <ItemActions id={kf.id} kind="camera-kf" customLabel="Delete Keyframe" /> : null;

  if (!kf) {
    return (
      <PanelWrapper title="Camera Track" icon={<Video size={15} />} footer={footer}>
        <div className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Select a keyframe on the timeline to edit it.</p>
          <p className="text-[11px] text-muted-foreground/70 mt-2">{item.keyframes.length} keyframe{item.keyframes.length !== 1 ? 's' : ''}</p>
        </div>
      </PanelWrapper>
    );
  }

  const u = (updates: Partial<typeof kf>) => updateCameraKeyframe(kf.id, updates);

  // Get available routes for follow route dropdown
  const routes = Object.values(items).filter((i) => i.kind === 'route') as RouteItem[];

  return (
    <PanelWrapper 
      title={`Camera KF @ ${kf.time.toFixed(1)}s`} 
      icon={<Video size={15} />}
      footer={footer}
    >
      <div className="flex items-center justify-between gap-3 p-2 bg-secondary/30 rounded-xl border border-border/40 mb-3">
        <span className="text-xs font-medium text-muted-foreground">Time (seconds)</span>
        <div className="w-24">
          <InputNumber value={kf.time} onChange={(v) => u({ time: v })} min={0} step={0.1} />
        </div>
      </div>

      <Accordion type="multiple" defaultValue={['cam']} className="w-full">
        <InspectorSection value="cam" title="Camera Settings">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 p-2 px-3 bg-secondary/30 rounded-xl border border-border/40">
                <span className="text-xs font-medium text-muted-foreground">Longitude</span>
                <input
                  type="number"
                  value={isNaN(kf.camera.center[0]) ? '' : kf.camera.center[0]}
                  onChange={(e) => u({ camera: { ...kf.camera, center: [Number(e.target.value), kf.camera.center[1]] } })}
                  step={0.0001}
                  className="h-8 text-xs font-mono text-right w-28 bg-background/60 border border-border/40 rounded-lg px-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center justify-between gap-3 p-2 px-3 bg-secondary/30 rounded-xl border border-border/40">
                <span className="text-xs font-medium text-muted-foreground">Latitude</span>
                <input
                  type="number"
                  value={isNaN(kf.camera.center[1]) ? '' : kf.camera.center[1]}
                  onChange={(e) => u({ camera: { ...kf.camera, center: [kf.camera.center[0], Number(e.target.value)] } })}
                  step={0.0001}
                  className="h-8 text-xs font-mono text-right w-28 bg-background/60 border border-border/40 rounded-lg px-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>

            <SliderRow
              label="Zoom"
              icon={<ZoomIn size={13} />}
              value={kf.camera.zoom}
              onChange={(v) => u({ camera: { ...kf.camera, zoom: v } })}
              min={0}
              max={22}
              step={0.1}
              formatValue={(v) => v.toFixed(1)}
            />

            <SliderRow
              label="Pitch"
              icon={<Compass size={13} />}
              value={kf.camera.pitch}
              onChange={(v) => u({ camera: { ...kf.camera, pitch: v } })}
              min={0}
              max={85}
              step={1}
              unit="°"
            />

            <SliderRow
              label="Bearing"
              icon={<RotateCw size={13} />}
              value={kf.camera.bearing}
              onChange={(v) => u({ camera: { ...kf.camera, bearing: v } })}
              min={0}
              max={360}
              step={1}
              unit="°"
            />

            <EasingSelect 
              value={kf.easing} 
              onChange={(v) => u({ easing: v })} 
              icon={<Sparkles size={13} />}
            />

            {routes.length > 0 && (
              <div className="flex items-center justify-between gap-3 text-xs py-0.5">
                <span className="text-xs font-medium text-muted-foreground shrink-0 w-28 flex items-center gap-1.5">
                  <Eye size={13} className="text-muted-foreground/70" />
                  <span>Follow Route</span>
                </span>
                <div className="flex-1">
                  <Select value={kf.followRoute || 'none'} onValueChange={(v) => u({ followRoute: v === 'none' ? null : v })}>
                    <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50 rounded-lg w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">None</SelectItem>
                      {routes.map((r) => <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </InspectorSection>
      </Accordion>
    </PanelWrapper>
  );
}

