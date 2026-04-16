import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/react/shallow';
import { useMapStyleCapabilities } from '@/hooks/useMapStyleCapabilities';
import { useSubscription } from '@/hooks/useSubscription';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { Field, InputText, InputNumber, SliderField } from './InspectorShared';
import { PanelWrapper, InspectorSection } from './InspectorLayout';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ColorPicker } from '@/components/ui/color-picker';
import { SwitchField } from '@/components/ui/field';
import { RotateCw, Monitor, Smartphone, Lock, ArrowRight } from 'lucide-react';
import { ProBadge } from '@/components/ui/pro-badge';
import type { AspectRatio, ExportResolution } from '@/types/render';
import { RESOLUTION_LABELS } from '@/types/render';
import { getExportLimits } from '@/lib/cloudAccess';



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
  const { data: subscription } = useSubscription();
  const limits = getExportLimits(subscription);
  const { openCreditsModal } = useAuthStore();

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
            <Field label="Duration (s)">
              <InputNumber
                value={duration}
                onChange={(v) => setDuration(Math.min(v, limits.maxDuration))}
                min={1}
                max={limits.maxDuration}
              />
            </Field>
            <Field label="FPS">
              <Select value={fps.toString()} onValueChange={(v) => setFps(Number(v) as 30 | 60)}>
                <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="60" disabled={limits.maxFps < 60}>
                    <div className="flex items-center gap-1.5">
                      60 {limits.maxFps < 60 && <ProBadge />}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aspect Ratio">
              <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
                <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="21:9">21:9</SelectItem>
                  <SelectItem value="4:3">4:3</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Orientation">
              <SegmentedControl
                options={[
                  { value: 'landscape', label: <Monitor size={14} /> },
                  { value: 'portrait', label: <Smartphone size={14} /> },
                ]}
                value={isVertical ? 'portrait' : 'landscape'}
                onValueChange={(v) => setIsVertical(v === 'portrait')}
                className="h-8 w-full"
              />
            </Field>
          </div>

          <Field label="Resolution">
            <div className="flex items-center gap-2">
              <Select
                value={exportResolution}
                onValueChange={(v) => setExportResolution(v as ExportResolution)}
              >
                <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['480p', '720p', '1080p', '1440p', '2160p'] as ExportResolution[]).map((r) => {
                    const resOrder = ['480p', '720p', '1080p', '1440p', '2160p'];
                    const isLocked = limits.limited && resOrder.indexOf(r) > resOrder.indexOf(limits.maxResolution);
                    return (
                      <SelectItem key={r} value={r} disabled={isLocked}>
                        <div className="flex items-center gap-1.5">
                          {RESOLUTION_LABELS[r]}
                          {isLocked && <ProBadge />}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap min-w-[70px] text-right">
                {resolution[0]} × {resolution[1]}
              </span>
            </div>
          </Field>

          {limits.limited && (
            <div className="mt-4 p-3 bg-primary/5 rounded-xl border border-primary/10 space-y-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-bold text-primary">Free plan:</span> Limited to 720p, 30fps and 30s.
              </p>
              <button
                onClick={openCreditsModal}
                className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
              >
                Upgrade to a paid plan (or BYOK) to unlock <ArrowRight size={10} />
              </button>
            </div>
          )}
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
