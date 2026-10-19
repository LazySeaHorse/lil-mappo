import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/react/shallow';
import { useMapStyleCapabilities } from '@/hooks/useMapStyleCapabilities';
import { useProjectDuration } from '@/hooks/useProjectDuration';
import { useSubscription } from '@/hooks/useSubscription';
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ColorRow, Field, InputText, InputNumber, SliderRow, SwitchRow } from './InspectorShared';
import { formatMultiplier, formatPercent } from './inspectorValues';
import { MAP_SETTING_HINTS } from '@/lib/terms';
import { PanelWrapper } from './InspectorLayout';
import { InspectorSection } from './InspectorSection';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SwitchField } from '@/components/ui/field';
import { Monitor, Smartphone, ArrowRight, Settings2 } from 'lucide-react';
import { FreeLimitNotice } from './FreeLimitNotice';
import { ResolutionSelectItems } from '@/components/ui/render-select-items';
import type { AspectRatio, ExportResolution } from '@/types/render';
import { getExportLimits } from '@/lib/cloudAccess';
import { parseLightPreset, parseProjection } from '@/store/domainValues';
import { projectionShowsStars, resolveFog } from '@/config/mapbox';



export function ProjectSettings() {
  const {
    name, fps, resolution, terrainExaggeration, projection, lightPreset,
    show3dLandmarks, show3dTrees, show3dFacades, starIntensity, fogColor,
    labelVisibility, setLabelGroupVisibility, setAllLabelsVisibility,
    setProjectName, setFps, setTerrainExaggeration,
    setProjection, setLightPreset, set3dDetails, setAtmosphere,
    mapStyle,
    aspectRatio, exportResolution, isVertical,
    setAspectRatio, setExportResolution, setIsVertical,
  } = useProjectStore(
    useShallow(s => ({
      name: s.name, fps: s.fps, resolution: s.resolution,
      terrainExaggeration: s.terrainExaggeration, projection: s.projection, lightPreset: s.lightPreset,
      show3dLandmarks: s.show3dLandmarks, show3dTrees: s.show3dTrees, show3dFacades: s.show3dFacades,
      starIntensity: s.starIntensity, fogColor: s.fogColor,
      labelVisibility: s.labelVisibility,
      setLabelGroupVisibility: s.setLabelGroupVisibility, setAllLabelsVisibility: s.setAllLabelsVisibility,
      setProjectName: s.setProjectName, setFps: s.setFps,
      setTerrainExaggeration: s.setTerrainExaggeration,
      setProjection: s.setProjection, setLightPreset: s.setLightPreset,
      set3dDetails: s.set3dDetails, setAtmosphere: s.setAtmosphere,
      mapStyle: s.mapStyle,
      aspectRatio: s.aspectRatio, exportResolution: s.exportResolution, isVertical: s.isVertical,
      setAspectRatio: s.setAspectRatio, setExportResolution: s.setExportResolution, setIsVertical: s.setIsVertical,
    }))
  );
  const { duration, setDuration, maxDuration } = useProjectDuration();
  const capabilities = useMapStyleCapabilities();
  const { data: subscription } = useSubscription();
  const limits = getExportLimits(subscription);
  const openUpgradeModal = useAuthStore((s) => s.openUpgradeModal);

  return (
    <PanelWrapper title="Project settings" icon={<Settings2 size={15} />}>
      <InspectorSection kind="project" id="video">
        <Field label="Name"><InputText value={name} onChange={setProjectName} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (s)">
            <InputNumber
              value={duration}
              aria-label="Duration (s)"
              onChange={(v) => setDuration(v)}
              min={1}
              max={maxDuration}
            />
          </Field>
          <Field label="Frame rate">
            <SegmentedControl
              options={[
                { value: '30', label: '30' },
                { value: '60', label: '60', disabled: limits.maxFps < 60, title: limits.maxFps < 60 ? '60 FPS requires a paid plan' : '60' },
              ]}
              value={fps.toString()}
              onValueChange={(v) => setFps(Number(v) as 30 | 60)}
              className="h-8 w-full"
            />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="Aspect ratio">
            <SegmentedControl
              options={(['16:9', '21:9', '4:3', '1:1'] as AspectRatio[]).map((v) => ({ value: v, label: v }))}
              value={aspectRatio}
              onValueChange={(v) => setAspectRatio(v)}
              className="h-8 w-full"
            />
          </Field>

          <Field label="Orientation">
            <SegmentedControl
              options={[
                { value: 'landscape', icon: <Monitor size={14} />, title: 'Landscape', 'aria-label': 'Landscape' },
                { value: 'portrait', icon: <Smartphone size={14} />, title: 'Portrait', 'aria-label': 'Portrait' },
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
                <ResolutionSelectItems limits={limits} />
              </SelectContent>
            </Select>
            <span className="text-2xs text-muted-foreground font-mono whitespace-nowrap min-w-[70px] text-right">
              {resolution[0]} × {resolution[1]}
            </span>
          </div>
        </Field>

        {limits.limited && (
          <FreeLimitNotice limits={limits} onUpgrade={() => openUpgradeModal('project_settings')} />
        )}
      </InspectorSection>

      <InspectorSection kind="project" id="env">
        <Field label="Projection" hint={MAP_SETTING_HINTS.projection}>
          <SegmentedControl
            options={[{ value: 'globe', label: 'Globe' }, { value: 'mercator', label: 'Mercator' }]}
            value={projection}
            onValueChange={(v) => setProjection(parseProjection(v))}
            className="h-8 w-full"
          />
        </Field>

        {capabilities.timeOfDayPreset && (
          <Field label="Lighting" hint={MAP_SETTING_HINTS.lighting}>
            <SegmentedControl
              options={[
                { value: 'day', label: 'Day' },
                { value: 'dusk', label: 'Dusk' },
                { value: 'night', label: 'Night' },
                { value: 'dawn', label: 'Dawn' },
              ]}
              value={lightPreset}
              onValueChange={(v) => setLightPreset(parseLightPreset(v))}
              className="h-8 w-full"
            />
          </Field>
        )}

        <SliderRow
          label="Terrain height"
          value={terrainExaggeration}
          onChange={setTerrainExaggeration}
          min={1}
          max={3}
          step={0.1}
          formatValue={formatMultiplier}
          endLabels={['Natural', 'Dramatic']}
          hint={MAP_SETTING_HINTS.terrainHeight}
        />
      </InspectorSection>

      <InspectorSection kind="project" id="atmos">
        {/* Mercator draws no stars; the fog color still tints its horizon haze */}
        {projectionShowsStars(projection) && (
          <SliderRow
            label="Star intensity"
            value={starIntensity}
            onChange={(v) => setAtmosphere({ starIntensity: v })}
            min={0}
            max={1}
            step={0.01}
            formatValue={formatPercent}
            endLabels={['None', 'Many']}
            hint={MAP_SETTING_HINTS.stars}
          />
        )}
        <ColorRow
          label="Fog color"
          hint={MAP_SETTING_HINTS.fogColor}
          value={resolveFog({ mapStyle, projection, lightPreset, starIntensity, fogColor }).color}
          onChange={(v) => setAtmosphere({ fogColor: v })}
          action={
            <Button
              onClick={() => setAtmosphere({ fogColor: null })}
              variant="outline"
              size="sm"
              title="Reset to map style"
            >
              Reset
            </Button>
          }
        />
      </InspectorSection>

      {capabilities.labelGroups.length > 0 && (
        <InspectorSection kind="project" id="labels">
          <div className="flex gap-2 mb-3">
            <Button
              onClick={() => setAllLabelsVisibility(true)}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              Enable all
            </Button>
            <Button
              onClick={() => setAllLabelsVisibility(false)}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              Disable all
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
        <InspectorSection kind="project" id="3d" info={MAP_SETTING_HINTS.features3d}>
          {capabilities.landmarks3d && <SwitchRow checked={show3dLandmarks} onChange={(v) => set3dDetails('landmarks', v)} label="Landmarks" sublabel={MAP_SETTING_HINTS.landmarks} />}
          {capabilities.trees3d && <SwitchRow checked={show3dTrees} onChange={(v) => set3dDetails('trees', v)} label="Trees" sublabel={MAP_SETTING_HINTS.trees} />}
          {capabilities.facades3d && <SwitchRow checked={show3dFacades} onChange={(v) => set3dDetails('facades', v)} label="Facades" sublabel={MAP_SETTING_HINTS.facades} />}
        </InspectorSection>
      )}
    </PanelWrapper>
  );
}
