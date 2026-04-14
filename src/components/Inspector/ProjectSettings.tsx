import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import { useMapStyleCapabilities } from '@/hooks/useMapStyleCapabilities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { Field, InputText, InputNumber, SliderField } from './InspectorShared';
import { PanelWrapper, InspectorSection } from './InspectorLayout';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ColorPicker } from '@/components/ui/color-picker';
import { SwitchField } from '@/components/ui/field';
import { RotateCw } from 'lucide-react';
import type { AspectRatio, ExportResolution } from '@/types/render';
import { RESOLUTION_LABELS } from '@/types/render';

const ASPECT_RATIO_SIZES: Record<AspectRatio, { w: number; h: number }> = {
  '1:1':  { w: 16, h: 16 },
  '16:9': { w: 26, h: 15 },
  '4:3':  { w: 22, h: 16 },
  '21:9': { w: 29, h: 12 },
};

function AspectRatioButton({ ratio, selected, onClick }: {
  ratio: AspectRatio; selected: boolean; onClick: () => void;
}) {
  const { w, h } = ASPECT_RATIO_SIZES[ratio];
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-md border text-[9px] font-bold transition-all ${
        selected
          ? 'bg-primary/10 border-primary/40 text-primary'
          : 'border-border text-muted-foreground hover:border-border/80'
      }`}
    >
      <div
        className={`rounded-[2px] border-2 ${selected ? 'border-primary' : 'border-current opacity-60'}`}
        style={{ width: w, height: h }}
      />
      {ratio}
    </button>
  );
}

export function ProjectSettings() {
  const {
    name, duration, fps, resolution, terrainExaggeration, projection, lightPreset,
    show3dLandmarks, show3dTrees, show3dFacades, starIntensity, fogColor,
    labelVisibility, setLabelGroupVisibility, setAllLabelsVisibility,
    setProjectName, setDuration, setFps, setTerrainExaggeration,
    setProjection, setLightPreset, set3dDetails, setAtmosphere,
    mapStyle,
    projectSettingsTab, setProjectSettingsTab,
    aspectRatio, exportResolution, isVertical,
    setAspectRatio, setExportResolution, setIsVertical,
  } = useProjectStore(
    useShallow(s => ({
      name: s.name, duration: s.duration, fps: s.fps, resolution: s.resolution,
      terrainExaggeration: s.terrainExaggeration, projection: s.projection, lightPreset: s.lightPreset,
      show3dLandmarks: s.show3dLandmarks, show3dTrees: s.show3dTrees, show3dFacades: s.show3dFacades,
      starIntensity: s.starIntensity, fogColor: s.fogColor,
      labelVisibility: s.labelVisibility,
      setLabelGroupVisibility: s.setLabelGroupVisibility, setAllLabelsVisibility: s.setAllLabelsVisibility,
      setProjectName: s.setProjectName, setDuration: s.setDuration, setFps: s.setFps,
      setTerrainExaggeration: s.setTerrainExaggeration,
      setProjection: s.setProjection, setLightPreset: s.setLightPreset,
      set3dDetails: s.set3dDetails, setAtmosphere: s.setAtmosphere,
      mapStyle: s.mapStyle,
      projectSettingsTab: s.projectSettingsTab, setProjectSettingsTab: s.setProjectSettingsTab,
      aspectRatio: s.aspectRatio, exportResolution: s.exportResolution, isVertical: s.isVertical,
      setAspectRatio: s.setAspectRatio, setExportResolution: s.setExportResolution, setIsVertical: s.setIsVertical,
    }))
  );
  const capabilities = useMapStyleCapabilities();

  return (
    <PanelWrapper title="Project Settings">
      <SegmentedControl
        options={[
          { value: 'general', label: 'General' },
          { value: 'map', label: 'Map' },
        ]}
        value={projectSettingsTab}
        onValueChange={setProjectSettingsTab}
        className="mb-4"
      />

      {projectSettingsTab === 'general' ? (
        <>
          <Field label="Name"><InputText value={name} onChange={setProjectName} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (s)"><InputNumber value={duration} onChange={setDuration} min={1} max={600} /></Field>
            <Field label="FPS">
              <Select value={fps.toString()} onValueChange={(v) => setFps(Number(v) as 30 | 60)}>
                <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="60">60</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {/* Aspect ratio */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Aspect Ratio</p>
            <div className="flex items-center gap-1.5">
              {(['16:9', '4:3', '1:1', '21:9'] as AspectRatio[]).map((r) => (
                <AspectRatioButton key={r} ratio={r} selected={aspectRatio === r} onClick={() => setAspectRatio(r)} />
              ))}
              <button
                onClick={() => setIsVertical(!isVertical)}
                title={isVertical ? 'Switch to Landscape' : 'Switch to Portrait'}
                className={`ml-auto p-1.5 rounded-md border transition-all ${
                  isVertical
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-border text-muted-foreground hover:border-border/80'
                }`}
              >
                <RotateCw size={13} />
              </button>
            </div>
          </div>

          {/* Resolution */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resolution</p>
            <div className="flex items-center gap-2">
              <Select
                value={exportResolution}
                onValueChange={(v) => setExportResolution(v as ExportResolution)}
              >
                <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['480p', '720p', '1080p', '1440p', '2160p'] as ExportResolution[]).map((r) => (
                    <SelectItem key={r} value={r}>{RESOLUTION_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                {resolution[0]} × {resolution[1]}
              </span>
            </div>
          </div>
        </>
      ) : (
        <Accordion type="multiple" defaultValue={['env', 'labels', '3d']} className="w-full">
          <InspectorSection value="env" title="Environment">
            <Field label="Projection">
              <Select value={projection} onValueChange={(v) => setProjection(v as any)}>
                <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="globe">Globe</SelectItem>
                  <SelectItem value="mercator">Mercator (Flat)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {capabilities.timeOfDayPreset && (
              <Field label="Lighting Preset">
                <Select value={lightPreset} onValueChange={(v) => setLightPreset(v as any)}>
                  <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                    <SelectItem value="dusk">Dusk</SelectItem>
                    <SelectItem value="dawn">Dawn</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}

            <SliderField label="Terrain Exaggeration" value={terrainExaggeration} onChange={setTerrainExaggeration} min={1} max={3} step={0.1} />
          </InspectorSection>

          <InspectorSection value="atmos" title="Atmosphere">
            <SliderField label="Star Intensity" value={starIntensity} onChange={(v) => setAtmosphere({ starIntensity: v })} min={0} max={1} step={0.01} />
            <Field label="Fog Color">
              <div className="flex gap-2 items-center">
                <ColorPicker
                  value={fogColor || (
                    mapStyle === 'satellite' || mapStyle === 'satelliteStreets' ? '#DC9F71' :
                    mapStyle === 'dark' ? '#171717' :
                    '#BAD2EB'
                  )}
                  onChange={(v) => setAtmosphere({ fogColor: v })}
                />
                <Button
                  onClick={() => setAtmosphere({ fogColor: null })}
                  variant="outline"
                  size="sm"
                  className="px-3 h-8 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                  title="Reset to Style Default"
                >
                  Reset
                </Button>
              </div>
            </Field>
          </InspectorSection>

          {capabilities.labelGroups.length > 0 && (
            <InspectorSection value="labels" title="Labels">
              <div className="flex gap-2 mb-3">
                <Button
                  onClick={() => setAllLabelsVisibility(true)}
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-8"
                >
                  All On
                </Button>
                <Button
                  onClick={() => setAllLabelsVisibility(false)}
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-8"
                >
                  All Off
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {capabilities.labelGroups.map((group) => (
                  <SwitchField
                    key={group.id}
                    checked={labelVisibility[group.id] ?? true}
                    onChange={(v) => setLabelGroupVisibility(group.id, v)}
                    label={group.label}
                  />
                ))}
              </div>
            </InspectorSection>
          )}

          {(capabilities.landmarks3d || capabilities.trees3d || capabilities.facades3d) && (
            <InspectorSection value="3d" title="3D Details">
              {capabilities.landmarks3d && <SwitchField checked={show3dLandmarks} onChange={(v) => set3dDetails('landmarks', v)} label="Landmarks" />}
              {capabilities.trees3d && <SwitchField checked={show3dTrees} onChange={(v) => set3dDetails('trees', v)} label="Trees" />}
              {capabilities.facades3d && <SwitchField checked={show3dFacades} onChange={(v) => set3dDetails('facades', v)} label="Facades" />}
            </InspectorSection>
          )}
        </Accordion>
      )}
    </PanelWrapper>
  );
}
