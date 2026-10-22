import React from 'react';
import {
  Clapperboard, Video, EyeOff, Frame, Mountain, Building2,
  Layers2, Settings2, Loader2
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapStylePicker } from './MapStylePicker';
import { RouteAddDropdown } from './RouteAddDropdown';
import { AnnotationAddDropdown } from '@/annotations/toolbar/AnnotationAddDropdown';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { ToolbarButton, ToolbarToggle, Divider } from './ToolbarPrimitives';
import { IconButton } from '@/components/ui/icon-button';
import { AiToolbarButton } from '@/components/AI/AiToolbarButton';
import { HistoryButtons } from './HistoryButtons';
import { ModelImportButton } from './ModelImportButton';
import { useMapStyleCapabilities } from '@/hooks/useMapStyleCapabilities';
import { CAMERA_VIEW_TERMS } from '@/lib/terms';

interface DesktopToolbarLayoutProps {
  isTablet: boolean;
  activeDropdown: 'route' | 'callout' | 'boundary' | null;
  setActiveDropdown: (d: 'route' | 'callout' | 'boundary' | null) => void;
  isPlaying: boolean;
  onExport: () => void;
  onImportClick: () => void;
  onHideUI: () => void;
  isFitMode: boolean;
  onToggleFit: () => void;
  onProjectSettings: () => void;
  renderAvatarMenu: () => React.ReactNode;
  handleAddCameraKF: () => void;
  // Layer group props
  mapStyle: string;
  setMapStyle: (s: string) => void;
  terrainEnabled: boolean;
  setTerrainEnabled: (v: boolean) => void;
  buildingsEnabled: boolean;
  setBuildingsEnabled: (v: boolean) => void;
  terrainLoading: boolean;
  isScrubbing: boolean;
}

function TabletLayerDropdown({
  mapStyle, setMapStyle,
  terrainEnabled, setTerrainEnabled,
  buildingsEnabled, setBuildingsEnabled,
  terrainLoading,
  isPlaying, isScrubbing,
  onProjectSettings,
  buildingsAvailable,
}: Pick<DesktopToolbarLayoutProps, 'mapStyle' | 'setMapStyle' | 'terrainEnabled' | 'setTerrainEnabled' | 'buildingsEnabled' | 'setBuildingsEnabled' | 'terrainLoading' | 'isScrubbing' | 'onProjectSettings'> & { isPlaying: boolean; buildingsAvailable: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="toolbar" size="sm" title="Map Display" data-walkthrough="map-tools">
          <Layers2 size={20} />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-background/95 p-3 space-y-4 rounded-2xl shadow-2xl border-border/50">
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground/80 px-1">Map Style</label>
          <MapStylePicker variant="inline" value={mapStyle} onChange={setMapStyle} />
        </div>
        <div data-walkthrough="map-3d" className="grid grid-cols-2 gap-2">
          <DropdownToggle icon={<Mountain size={14} />} label="Terrain" active={terrainEnabled} onClick={() => setTerrainEnabled(!terrainEnabled)} loading={terrainLoading && !isPlaying && !isScrubbing} />
          <DropdownToggle icon={<Building2 size={14} />} label="Buildings" active={buildingsEnabled} onClick={() => setBuildingsEnabled(!buildingsEnabled)} disabled={!buildingsAvailable} />
        </div>
        <div className="h-px bg-border/50 mx-1 border-dotted border-b" />
        <DropdownMenuItem data-walkthrough="map-settings" onClick={onProjectSettings} className="gap-2 cursor-pointer h-9 text-xs rounded-lg">
          <Settings2 size={14} /> Full Map Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InlineLayerGroup({
  mapStyle, setMapStyle,
  terrainEnabled, setTerrainEnabled,
  buildingsEnabled, setBuildingsEnabled,
  terrainLoading,
  isPlaying, isScrubbing, onProjectSettings,
  buildingsAvailable,
}: Pick<DesktopToolbarLayoutProps, 'mapStyle' | 'setMapStyle' | 'terrainEnabled' | 'setTerrainEnabled' | 'buildingsEnabled' | 'setBuildingsEnabled' | 'terrainLoading' | 'isScrubbing' | 'onProjectSettings'> & { isPlaying: boolean; buildingsAvailable: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-1 px-1">
        <MapStylePicker value={mapStyle} onChange={setMapStyle} />
      </div>
      <ToolbarButton icon={<Settings2 size={16} />} label="Map Settings" hideLabel onClick={onProjectSettings} walkthroughTarget="map-settings" />
      <Divider />
      <div data-walkthrough="map-3d" className="flex items-center gap-1">
        <ToolbarToggle icon={<Mountain size={16} />} label="Terrain" hideLabel active={terrainEnabled} onClick={() => setTerrainEnabled(!terrainEnabled)} loading={terrainLoading && !isPlaying && !isScrubbing} />
        <ToolbarToggle icon={<Building2 size={16} />} label="Buildings" hideLabel active={buildingsEnabled} onClick={() => setBuildingsEnabled(!buildingsEnabled)} disabled={!buildingsAvailable} />
      </div>
    </div>
  );
}

function DropdownToggle({ icon, label, active, onClick, loading, disabled }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <Toggle
      pressed={active}
      onClick={(e) => e.stopPropagation()}
      onPressedChange={() => !disabled && onClick()}
      disabled={disabled}
      className="flex-1 justify-start"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      <span>{label}</span>
    </Toggle>
  );
}

export function DesktopToolbarLayout({
  isTablet, activeDropdown, setActiveDropdown,
  isPlaying, onExport,
  onImportClick, onHideUI, isFitMode, onToggleFit, onProjectSettings,
  renderAvatarMenu, handleAddCameraKF,
  mapStyle, setMapStyle,
  terrainEnabled, setTerrainEnabled,
  buildingsEnabled, setBuildingsEnabled,
  terrainLoading, isScrubbing,
}: DesktopToolbarLayoutProps) {
  const buildingsAvailable = useMapStyleCapabilities().buildings3d === true;

  const layerProps = {
    mapStyle, setMapStyle, terrainEnabled, setTerrainEnabled,
    buildingsEnabled, setBuildingsEnabled, buildingsAvailable, terrainLoading,
    isPlaying, isScrubbing, onProjectSettings,
  };

  return (
    <>
      {renderAvatarMenu()}
      <Divider />

      <HistoryButtons />
      <Divider />

      <div className="flex items-center gap-0.5">
        <RouteAddDropdown onImportClick={onImportClick} isOpen={activeDropdown === 'route'} onOpenChange={(open) => setActiveDropdown(open ? 'route' : null)} />
        <BoundaryAddDropdown isOpen={activeDropdown === 'boundary'} onOpenChange={(open) => setActiveDropdown(open ? 'boundary' : null)} />
        <AnnotationAddDropdown isOpen={activeDropdown === 'callout'} onOpenChange={(open) => setActiveDropdown(open ? 'callout' : null)} />
        <ToolbarButton icon={<Video size={16} />} label={CAMERA_VIEW_TERMS.add} hideLabel onClick={handleAddCameraKF} walkthroughTarget="camera-keyframe" />
        <ModelImportButton />
      </div>

      <Divider />

      {isTablet
        ? <TabletLayerDropdown {...layerProps} />
        : <InlineLayerGroup {...layerProps} />
      }

      <div className="flex-1" />
      <Divider />

      <AiToolbarButton />
      <ToolbarButton icon={<Clapperboard size={16} />} label="Export" hideLabel onClick={onExport} walkthroughTarget="render" />
      <Divider className="hidden sm:block" />
      <div className="hidden sm:block">
        <ToolbarToggle icon={<Frame size={16} />} label="Fit to video frame" hideLabel active={isFitMode} onClick={onToggleFit} />
      </div>
      <div className="hidden sm:block">
        <ToolbarButton icon={<EyeOff size={16} />} label="Hide UI" hideLabel onClick={onHideUI} />
      </div>
    </>
  );
}
