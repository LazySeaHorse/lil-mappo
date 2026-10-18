import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import type { CameraItem } from '@/store/types';
import { SliderRow, CoordinatesRows } from './InspectorShared';
import { formatDegrees } from './inspectorValues';
import { PanelWrapper } from './InspectorLayout';
import { InspectorSection } from './InspectorSection';
import { InspectorHeader } from './InspectorHeader';
import { TimingSection } from './timing/TimingSection';
import { cameraViewTiming } from './timing/timingAdapters';
import { formatTimelineTime } from '@/components/Timeline/timelineTime';
import { Button } from '@/components/ui/button';
import { useMapRef } from '@/hooks/useMapRef';
import { readMapCamera } from '@/engine/readMapCamera';
import { moveToCamera } from '@/engine/mapFraming';
import { CAMERA_VIEW_TERMS, ITEM_TYPE_LABELS } from '@/lib/terms';
import { Video, Compass, ZoomIn, RotateCw, Crosshair, Eye } from 'lucide-react';

export function CameraKFInspector({ item }: { item: CameraItem }) {
  const mapRef = useMapRef();
  const { selectedKeyframeId, updateCameraKeyframe } = useProjectStore(
    useShallow(s => ({
      selectedKeyframeId: s.selectedKeyframeId,
      updateCameraKeyframe: s.updateCameraKeyframe,
    }))
  );

  const kf = item.keyframes.find((k) => k.id === selectedKeyframeId);

  if (!kf) {
    return (
      <PanelWrapper title={CAMERA_VIEW_TERMS.track} icon={<Video size={15} />}>
        <div className="p-4 text-center">
          <p className="text-xs text-muted-foreground">{CAMERA_VIEW_TERMS.selectOne}</p>
          <p className="text-2xs text-muted-foreground/70 mt-2">{item.keyframes.length} camera view{item.keyframes.length !== 1 ? 's' : ''}</p>
        </div>
      </PanelWrapper>
    );
  }

  const u = (updates: Partial<typeof kf>) => updateCameraKeyframe(kf.id, updates);

  /** Saves what the map shows now into this camera view. One store write, so one undo step. */
  const saveCurrentView = () => {
    const map = mapRef.current?.getMap?.();
    if (map) u({ camera: { ...kf.camera, ...readMapCamera(map) } });
  };

  /** Shows this camera view on the map. Does nothing while the project plays, scrubs or exports. */
  const goToView = () => {
    const map = mapRef.current?.getMap?.();
    if (map) moveToCamera(map, kf.camera);
  };

  return (
    <PanelWrapper 
      title="Camera view"
      icon={<Video size={15} />}
      header={
        <InspectorHeader
          kind="camera-kf"
          id={kf.id}
          name={`${ITEM_TYPE_LABELS['camera-kf']} at ${formatTimelineTime(kf.time)}`}
          startTime={kf.time}
        />
      }
    >
      <div className="flex flex-col gap-2 pb-1">
        <p className="text-2xs leading-tight text-muted-foreground">{CAMERA_VIEW_TERMS.help}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={saveCurrentView}>
            <Crosshair size={14} aria-hidden="true" />
            {CAMERA_VIEW_TERMS.useCurrent}
          </Button>
          <Button type="button" variant="outline" onClick={goToView}>
            <Eye size={14} aria-hidden="true" />
            {CAMERA_VIEW_TERMS.goTo}
          </Button>
        </div>
      </div>

      <InspectorSection kind="camera-kf" id="exact">
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
            formatValue={formatDegrees}
          />

          <SliderRow
            label="Bearing"
            icon={<RotateCw size={13} />}
            value={kf.camera.bearing}
            onChange={(v) => u({ camera: { ...kf.camera, bearing: v } })}
            min={0}
            max={360}
            step={0.1}
            formatValue={formatDegrees}
          />
        </div>
      </InspectorSection>

      <TimingSection adapter={cameraViewTiming} item={kf} onChange={u} />
    </PanelWrapper>
  );
}
