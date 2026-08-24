import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { CameraItem } from '@/store/types';
import { Accordion } from "@/components/ui/accordion";
import { SliderRow, EasingSelect, InputNumber, CoordinatesRows } from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';
import { Video, Compass, ZoomIn, RotateCw, Sparkles } from 'lucide-react';

export function CameraKFInspector({ item }: { item: CameraItem }) {
  const { selectedKeyframeId, updateCameraKeyframe } = useProjectStore();

  const kf = item.keyframes.find((k) => k.id === selectedKeyframeId);

  const footer = kf ? <ItemActions id={kf.id} kind="camera-kf" customLabel="Delete Keyframe" /> : null;

  if (!kf) {
    return (
      <PanelWrapper title="Camera track" icon={<Video size={15} />} footer={footer}>
        <div className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Select a keyframe in the timeline to edit it.</p>
          <p className="text-[11px] text-muted-foreground/70 mt-2">{item.keyframes.length} keyframe{item.keyframes.length !== 1 ? 's' : ''}</p>
        </div>
      </PanelWrapper>
    );
  }

  const u = (updates: Partial<typeof kf>) => updateCameraKeyframe(kf.id, updates);

  return (
    <PanelWrapper 
      title={`Camera keyframe at ${kf.time.toFixed(2)} s`}
      icon={<Video size={15} />}
      footer={footer}
    >
      <div className="flex items-center justify-between gap-3 p-2 bg-secondary/30 rounded-xl border border-border/40 mb-3">
        <span className="text-xs font-medium text-muted-foreground">Time</span>
        <div className="w-24">
          <InputNumber value={kf.time} onChange={(v) => u({ time: v })} min={0} step={0.01} />
        </div>
      </div>

      <Accordion type="multiple" defaultValue={['cam']} className="w-full">
        <InspectorSection value="cam" title="Camera">
          <div className="flex flex-col gap-3">
            <CoordinatesRows
              lngLat={kf.camera.center}
              onChange={(center) => u({ camera: { ...kf.camera, center } })}
            />

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
              step={0.1}
              formatValue={(v) => `${(v ?? 0).toFixed(1)}°`}
            />

            <SliderRow
              label="Bearing"
              icon={<RotateCw size={13} />}
              value={kf.camera.bearing}
              onChange={(v) => u({ camera: { ...kf.camera, bearing: v } })}
              min={0}
              max={360}
              step={0.1}
              formatValue={(v) => `${(v ?? 0).toFixed(1)}°`}
            />

            <EasingSelect 
              value={kf.easing} 
              onChange={(v) => u({ easing: v })} 
              icon={<Sparkles size={13} />}
            />
          </div>
        </InspectorSection>
      </Accordion>
    </PanelWrapper>
  );
}
