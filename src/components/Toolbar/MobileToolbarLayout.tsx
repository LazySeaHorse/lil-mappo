import React from 'react';
import { Clapperboard, Video, Plus, Layers2, X, Mountain, Building2, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteAddDropdown } from './RouteAddDropdown';
import { CalloutAddDropdown } from './CalloutAddDropdown';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { ToolbarButton, ToolbarToggle, Divider, MapStyleSelectItems } from './ToolbarPrimitives';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ui/icon-button';

interface MobileToolbarLayoutProps {
  mobileMode: 'default' | 'add' | 'layers';
  setMobileMode: (mode: 'default' | 'add' | 'layers') => void;
  activeDropdown: 'route' | 'callout' | 'boundary' | null;
  setActiveDropdown: (d: 'route' | 'callout' | 'boundary' | null) => void;
  onExport: () => void;
  onImportClick: () => void;
  onHideUI: () => void;
  renderAvatarMenu: () => React.ReactNode;
  // Layer group props
  mapStyle: string;
  setMapStyle: (s: string) => void;
  terrainEnabled: boolean;
  setTerrainEnabled: (v: boolean) => void;
  buildingsEnabled: boolean;
  setBuildingsEnabled: (v: boolean) => void;
  terrainLoading: boolean;
  buildingsLoading: boolean;
  isPlaying2: boolean;
  isScrubbing: boolean;
  handleAddCameraKF: () => void;
}

export function MobileToolbarLayout({
  mobileMode, setMobileMode,
  activeDropdown, setActiveDropdown,
  onExport,
  onImportClick, onHideUI, renderAvatarMenu,
  mapStyle, setMapStyle,
  terrainEnabled, setTerrainEnabled,
  buildingsEnabled, setBuildingsEnabled,
  terrainLoading, buildingsLoading,
  isPlaying2, isScrubbing,
  handleAddCameraKF,
}: MobileToolbarLayoutProps) {
  return (
    <div className="w-full flex items-center h-full relative overflow-hidden">
      {mobileMode === 'default' && (
        <div className="flex items-center w-full animate-in slide-in-from-left-4 duration-300 fill-mode-both">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} className="w-6 h-6 mr-1" alt="Logo" />
          {renderAvatarMenu()}
          <Divider />
          <IconButton variant="toolbar" size="sm" onClick={() => setMobileMode('add')} title="Add New Track">
            <Plus size={20} />
          </IconButton>
          <Divider />
          <IconButton variant="toolbar" size="sm" onClick={() => setMobileMode('layers')}>
            <Layers2 size={20} />
          </IconButton>
          <div className="flex-1" />
          <ToolbarButton icon={<Clapperboard size={18} />} label="Export" hideLabel onClick={onExport} />
          <div className="w-1" />
          <ToolbarButton icon={<EyeOff size={18} />} label="Hide UI" hideLabel onClick={onHideUI} />
        </div>
      )}

      {mobileMode === 'add' && (
        <div className="flex items-center w-full animate-in slide-in-from-right-4 duration-300 fill-mode-both">
          <div className="flex items-center gap-2 w-full justify-between px-2">
            <RouteAddDropdown onImportClick={onImportClick} isOpen={activeDropdown === 'route'} onOpenChange={(open) => setActiveDropdown(open ? 'route' : null)} />
            <BoundaryAddDropdown isOpen={activeDropdown === 'boundary'} onOpenChange={(open) => setActiveDropdown(open ? 'boundary' : null)} />
            <CalloutAddDropdown isOpen={activeDropdown === 'callout'} onOpenChange={(open) => setActiveDropdown(open ? 'callout' : null)} />
            <ToolbarButton icon={<Video size={18} />} label="Camera KF" hideLabel onClick={handleAddCameraKF} />
            <IconButton variant="toolbar" size="sm" onClick={() => { setMobileMode('default'); setActiveDropdown(null); }} className="bg-secondary/50 hover:bg-secondary">
              <X size={16} />
            </IconButton>
          </div>
        </div>
      )}

      {mobileMode === 'layers' && (
        <div className="flex items-center w-full animate-in slide-in-from-right-4 duration-300 fill-mode-both">
          <div className="flex items-center gap-2 w-full justify-between px-2">
            <div className="flex items-center gap-1 px-1 flex-1">
              <Select value={mapStyle} onValueChange={setMapStyle}>
                <SelectTrigger className="h-8 text-xs flex-1 focus:ring-1 focus:ring-ring focus:ring-offset-0 border-border bg-background">
                  <SelectValue placeholder="Map Style" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50 shadow-2xl">
                  <MapStyleSelectItems />
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <ToolbarToggle icon={<Mountain size={16} />} label="Terrain" hideLabel active={terrainEnabled} onClick={() => setTerrainEnabled(!terrainEnabled)} loading={terrainLoading && !isPlaying2 && !isScrubbing} />
              <ToolbarToggle icon={<Building2 size={16} />} label="Buildings" hideLabel active={buildingsEnabled} onClick={() => setBuildingsEnabled(!buildingsEnabled)} loading={buildingsLoading && !isPlaying2 && !isScrubbing} disabled={mapStyle === 'satellite'} />
            </div>
            <IconButton variant="toolbar" size="sm" onClick={() => setMobileMode('default')} className="bg-secondary/50 hover:bg-secondary">
              <X size={16} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
