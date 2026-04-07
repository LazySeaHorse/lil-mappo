import React from 'react';
import { Play, Pause, Video, Plus, Layers2, X, Mountain, Building2, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteAddDropdown } from './RouteAddDropdown';
import { CalloutAddDropdown } from './CalloutAddDropdown';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { ToolbarButton, ToolbarToggle, Divider } from './ToolbarPrimitives';
import { MAP_STYLES } from '@/config/mapbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MobileToolbarLayoutProps {
  mobileMode: 'default' | 'add' | 'layers';
  setMobileMode: (mode: 'default' | 'add' | 'layers') => void;
  activeDropdown: 'route' | 'callout' | 'boundary' | null;
  setActiveDropdown: (d: 'route' | 'callout' | 'boundary' | null) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onExport: () => void;
  onImportClick: () => void;
  onHideUI: () => void;
  renderProjectMenu: () => React.ReactNode;
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
  isPlaying, onTogglePlay, onExport,
  onImportClick, onHideUI, renderProjectMenu,
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
          {renderProjectMenu()}
          <Divider />
          <Button variant="ghost" size="sm" className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMode('add')} title="Add New Track">
            <Plus size={20} />
          </Button>
          <Divider />
          <Button variant="ghost" size="sm" className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMode('layers')}>
            <Layers2 size={20} />
          </Button>
          <div className="flex-1" />
          <ToolbarButton icon={isPlaying ? <Pause size={18} /> : <Play size={18} />} label={isPlaying ? 'Pause' : 'Play'} hideLabel onClick={onTogglePlay} accent />
          <div className="w-1" />
          <ToolbarButton icon={<Video size={18} />} label="Export" hideLabel onClick={onExport} />
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
            <Button variant="ghost" size="icon" onClick={() => { setMobileMode('default'); setActiveDropdown(null); }} className="h-8 w-8 rounded-full bg-secondary/50 hover:bg-secondary transition-all">
              <X size={16} />
            </Button>
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
                  {Object.entries(MAP_STYLES).map(([key, { label }]) => (
                    <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <ToolbarToggle icon={<Mountain size={16} />} label="Terrain" hideLabel active={terrainEnabled} onClick={() => setTerrainEnabled(!terrainEnabled)} loading={terrainLoading && !isPlaying2 && !isScrubbing} />
              <ToolbarToggle icon={<Building2 size={16} />} label="Buildings" hideLabel active={buildingsEnabled} onClick={() => setBuildingsEnabled(!buildingsEnabled)} loading={buildingsLoading && !isPlaying2 && !isScrubbing} />
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMobileMode('default')} className="h-8 w-8 rounded-full bg-secondary/50 hover:bg-secondary transition-all">
              <X size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
