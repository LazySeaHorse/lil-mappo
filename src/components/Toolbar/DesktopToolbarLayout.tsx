import React from 'react';
import {
  Clapperboard, Video, EyeOff, Mountain, Building2,
  Layers2, Plus, Settings2, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RouteAddDropdown } from './RouteAddDropdown';
import { CalloutAddDropdown } from './CalloutAddDropdown';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { ToolbarButton, ToolbarToggle, Divider, MapStyleSelectItems } from './ToolbarPrimitives';
import { IconButton } from '@/components/ui/icon-button';

interface DesktopToolbarLayoutProps {
  isTablet: boolean;
  activeDropdown: 'route' | 'callout' | 'boundary' | null;
  setActiveDropdown: (d: 'route' | 'callout' | 'boundary' | null) => void;
  isPlaying: boolean;
  onExport: () => void;
  onImportClick: () => void;
  onHideUI: () => void;
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
  buildingsLoading: boolean;
  isScrubbing: boolean;
}

function TabletLayerDropdown({
  mapStyle, setMapStyle,
  terrainEnabled, setTerrainEnabled,
  buildingsEnabled, setBuildingsEnabled,
  terrainLoading, buildingsLoading,
  isPlaying, isScrubbing,
  onProjectSettings,
}: Pick<DesktopToolbarLayoutProps, 'mapStyle' | 'setMapStyle' | 'terrainEnabled' | 'setTerrainEnabled' | 'buildingsEnabled' | 'setBuildingsEnabled' | 'terrainLoading' | 'buildingsLoading' | 'isScrubbing' | 'onProjectSettings'> & { isPlaying: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="toolbar" size="sm" title="Map Display">
          <Layers2 size={20} />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-background/95 p-3 space-y-4 rounded-2xl shadow-2xl border-border/50">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Map Style</label>
          <Select value={mapStyle} onValueChange={setMapStyle}>
            <SelectTrigger className="h-9 text-xs w-full focus:ring-1 focus:ring-ring focus:ring-offset-0 border-border bg-background/50 rounded-xl">
              <SelectValue placeholder="Map Style" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/50 shadow-2xl">
              <MapStyleSelectItems />
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DropdownToggle icon={<Mountain size={14} />} label="Terrain" active={terrainEnabled} onClick={() => setTerrainEnabled(!terrainEnabled)} loading={terrainLoading && !isPlaying && !isScrubbing} />
          <DropdownToggle icon={<Building2 size={14} />} label="Buildings" active={buildingsEnabled} onClick={() => setBuildingsEnabled(!buildingsEnabled)} loading={buildingsLoading && !isPlaying && !isScrubbing} disabled={mapStyle === 'satellite'} />
        </div>
        <div className="h-px bg-border/50 mx-1 border-dotted border-b" />
        <DropdownMenuItem onClick={onProjectSettings} className="gap-2 cursor-pointer h-9 text-xs rounded-xl">
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
  terrainLoading, buildingsLoading,
  isPlaying, isScrubbing, onProjectSettings,
}: Pick<DesktopToolbarLayoutProps, 'mapStyle' | 'setMapStyle' | 'terrainEnabled' | 'setTerrainEnabled' | 'buildingsEnabled' | 'setBuildingsEnabled' | 'terrainLoading' | 'buildingsLoading' | 'isScrubbing' | 'onProjectSettings'> & { isPlaying: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-1 px-1">
        <Select value={mapStyle} onValueChange={setMapStyle}>
          <SelectTrigger className="h-8 text-xs w-[130px] focus:ring-1 focus:ring-ring focus:ring-offset-0 border-border bg-background">
            <SelectValue placeholder="Map Style" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border/50 shadow-2xl">
            <MapStyleSelectItems />
          </SelectContent>
        </Select>
      </div>
      <ToolbarButton icon={<Settings2 size={16} />} label="Map Settings" hideLabel onClick={onProjectSettings} />
      <Divider />
      <div className="flex items-center gap-1">
        <ToolbarToggle icon={<Mountain size={16} />} label="Terrain" hideLabel active={terrainEnabled} onClick={() => setTerrainEnabled(!terrainEnabled)} loading={terrainLoading && !isPlaying && !isScrubbing} />
        <ToolbarToggle icon={<Building2 size={16} />} label="Buildings" hideLabel active={buildingsEnabled} onClick={() => setBuildingsEnabled(!buildingsEnabled)} loading={buildingsLoading && !isPlaying && !isScrubbing} disabled={mapStyle === 'satellite'} />
      </div>
    </div>
  );
}

function DropdownToggle({ icon, label, active, onClick, loading, disabled }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="sm"
      onClick={(e) => { if (!disabled) { e.preventDefault(); e.stopPropagation(); onClick(); } }}
      disabled={disabled}
      className={`h-9 flex flex-1 items-center justify-start gap-2 text-[11px] font-medium px-2 rounded-xl transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${active && !disabled ? 'bg-primary/10 text-primary hover:bg-primary/20' : disabled ? '' : 'text-muted-foreground'}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      <span>{label}</span>
    </Button>
  );
}

export function DesktopToolbarLayout({
  isTablet, activeDropdown, setActiveDropdown,
  isPlaying, onExport,
  onImportClick, onHideUI, onProjectSettings,
  renderAvatarMenu, handleAddCameraKF,
  mapStyle, setMapStyle,
  terrainEnabled, setTerrainEnabled,
  buildingsEnabled, setBuildingsEnabled,
  terrainLoading, buildingsLoading, isScrubbing,
}: DesktopToolbarLayoutProps) {
  const layerProps = {
    mapStyle, setMapStyle, terrainEnabled, setTerrainEnabled,
    buildingsEnabled, setBuildingsEnabled, terrainLoading, buildingsLoading,
    isPlaying, isScrubbing, onProjectSettings,
  };

  return (
    <>
      <div className="flex items-center gap-2 mr-2 pl-1 shrink-0">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} className="w-7 h-7 drop-shadow-sm" alt="li'l Mappo Logo" />
        {!isTablet && <span className="font-bold text-sm tracking-tight hidden xl:inline-block">li'l Mappo</span>}
      </div>

      {renderAvatarMenu()}
      <Divider />

      <div className="flex items-center gap-0.5">
        <RouteAddDropdown onImportClick={onImportClick} isOpen={activeDropdown === 'route'} onOpenChange={(open) => setActiveDropdown(open ? 'route' : null)} />
        <BoundaryAddDropdown isOpen={activeDropdown === 'boundary'} onOpenChange={(open) => setActiveDropdown(open ? 'boundary' : null)} />
        <CalloutAddDropdown isOpen={activeDropdown === 'callout'} onOpenChange={(open) => setActiveDropdown(open ? 'callout' : null)} />
        <ToolbarButton icon={<Video size={16} />} label="Camera KF" hideLabel onClick={handleAddCameraKF} />
      </div>

      <Divider />

      {isTablet
        ? <TabletLayerDropdown {...layerProps} />
        : <InlineLayerGroup {...layerProps} />
      }

      <div className="flex-1" />
      <Divider />

      <ToolbarButton icon={<Clapperboard size={16} />} label="Export" hideLabel onClick={onExport} />
      <Divider className="hidden sm:block" />
      <div className="hidden sm:block">
        <ToolbarButton icon={<EyeOff size={16} />} label="Hide UI" hideLabel onClick={onHideUI} />
      </div>
    </>
  );
}
