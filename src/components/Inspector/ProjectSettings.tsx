import React, { useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { Field, InputText, InputNumber, SliderField } from './InspectorShared';
import { PanelWrapper, InspectorSection } from './InspectorLayout';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ColorPicker } from '@/components/ui/color-picker';
import { SwitchField } from '@/components/ui/field';

export function ProjectSettings() {
  const [activeTab, setActiveTab] = useState<'general' | 'map'>('general');
  const {
    name, duration, fps, resolution, terrainExaggeration, projection, lightPreset,
    showRoadLabels, showPlaceLabels, showPointOfInterestLabels, showTransitLabels,
    show3dLandmarks, show3dTrees, show3dFacades, starIntensity, fogColor,
    setProjectName, setDuration, setFps, setResolution, setTerrainExaggeration,
    setProjection, setLightPreset, setLabelVisibility, set3dDetails, setAtmosphere,
    mapStyle
  } = useProjectStore();

  return (
    <PanelWrapper title="Project Settings">
      <SegmentedControl
        options={[
          { value: 'general', label: 'General' },
          { value: 'map', label: 'Map' },
        ]}
        value={activeTab}
        onValueChange={setActiveTab}
        className="mb-4"
      />

      {activeTab === 'general' ? (
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
          <Field label="Resolution">
            <Select value={resolution.join('x')} onValueChange={(v) => { const [w, h] = v.split('x').map(Number); setResolution([w, h]); }}>
              <SelectTrigger className="h-8 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1920x1080">1920 × 1080</SelectItem>
                <SelectItem value="2560x1440">2560 × 1440</SelectItem>
                <SelectItem value="3840x2160">3840 × 2160</SelectItem>
              </SelectContent>
            </Select>
          </Field>
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

            {mapStyle === 'standard' && (
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

          <InspectorSection value="labels" title="Labels">
            <div className="grid grid-cols-2 gap-2">
              <SwitchField checked={showRoadLabels} onChange={(v) => setLabelVisibility('road', v)} label="Roads" />
              <SwitchField checked={showPlaceLabels} onChange={(v) => setLabelVisibility('place', v)} label="Places" />
              <SwitchField checked={showPointOfInterestLabels} onChange={(v) => setLabelVisibility('poi', v)} label="POIs" />
              <SwitchField checked={showTransitLabels} onChange={(v) => setLabelVisibility('transit', v)} label="Transit" />
            </div>
          </InspectorSection>

          <InspectorSection value="3d" title="3D Details">
            <SwitchField checked={show3dLandmarks} onChange={(v) => set3dDetails('landmarks', v)} label="Landmarks" />
            <SwitchField checked={show3dTrees} onChange={(v) => set3dDetails('trees', v)} label="Trees" />
            <SwitchField checked={show3dFacades} onChange={(v) => set3dDetails('facades', v)} label="Facades" />
          </InspectorSection>
        </Accordion>
      )}
    </PanelWrapper>
  );
}
