import React, { useRef, useCallback, useState } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { nanoid } from 'nanoid';
import { importRouteFile } from '@/services/fileImport';
import { MAP_STYLES } from '@/config/mapbox';
import type { RouteItem, BoundaryItem, CalloutItem } from '@/store/types';
import { useMapRef } from '@/hooks/useMapRef';
import {
  Upload, MapPin, MessageSquare, Video, Play, Pause, Square,
  Mountain, Building2, Crosshair, ChevronDown, FilePlus2,
  Save, Library, FileJson, Settings, Settings2, Loader2,
  EyeOff, Eye, Plus, Layers2, Compass, Map as MapIcon, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useResponsive } from '@/hooks/useResponsive';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { saveProjectToLibrary } from '@/services/projectLibrary';
import { saveAs } from 'file-saver';
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RouteAddDropdown } from './RouteAddDropdown';
import { CalloutAddDropdown } from './CalloutAddDropdown';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { 
  RIGHT_RESERVED_DESKTOP,
  RIGHT_RESERVED_TABLET,
  PANEL_MARGIN,
  PANEL_GAP
} from '@/constants/layout';

interface ToolbarProps {
  onExport: () => void;
  onLibrary: () => void;
}

export default function Toolbar({ onExport, onLibrary }: ToolbarProps) {
  const routeInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useMapRef();
  const projectState = useProjectStore();
  const [mobileMode, setMobileMode] = useState<'default' | 'add' | 'layers'>('default');
  const [activeDropdown, setActiveDropdown] = useState<'route' | 'callout' | 'boundary' | null>(null);

  const {
    isPlaying, setIsPlaying, mapStyle, setMapStyle,
    terrainEnabled, setTerrainEnabled, buildingsEnabled, setBuildingsEnabled,
    terrainLoading, buildingsLoading,
    addItem, playheadTime, addCameraKeyframe, selectItem,
    setHideUI, isInspectorOpen, isScrubbing,
  } = projectState;

  const { isMobile, isTablet } = useResponsive();

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const { name, geojson } = await importRouteFile(file);
        const item: RouteItem = {
          kind: 'route',
          id: nanoid(),
          name,
          geojson,
          startTime: playheadTime,
          endTime: playheadTime + 5,
          style: {
            color: '#22c55e',
            width: 4,
            glow: false,
            glowColor: '#22c55e',
            glowWidth: 12,
            trailFade: false,
            trailFadeLength: 0.3,
            dashPattern: null,
          },
          easing: 'easeInOutCubic',
        };
        addItem(item);
        setTerrainEnabled(false);
        setBuildingsEnabled(false);
        selectItem(item.id);
        const pointCount = geojson.features.reduce((sum, f) => {
          if (f.geometry.type === 'LineString') return sum + (f.geometry as any).coordinates.length;
          if (f.geometry.type === 'MultiLineString') return sum + (f.geometry as any).coordinates.flat().length;
          return sum;
        }, 0);
        toast.success(`Imported "${name}" (${pointCount} points)`);
      } catch {
        toast.error(`Failed to import ${file.name}`);
      }
    }
    e.target.value = '';
  }, [playheadTime, addItem, selectItem]);

  const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.id && parsed.items) {
        projectState.loadFullProject(parsed);
        toast.success('Project imported successfully');
      } else {
        throw new Error('Invalid project file');
      }
    } catch {
      toast.error('Failed to parse project file');
    }
    e.target.value = '';
  };

  const handleExportProject = () => {
    const data = JSON.stringify(projectState, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const fileName = `${projectState.name.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'project'}.lilmap`;
    saveAs(blob, fileName);
  };

  const handleSaveToLibrary = async () => {
    try {
      const plainData = JSON.parse(JSON.stringify(projectState));
      await saveProjectToLibrary(plainData);
      toast.success('Saved to library');
    } catch {
      toast.error('Failed to save to library');
    }
  };

  const handleNewProject = () => {
    if (window.confirm('Clear current project and start fresh? Unsaved changes will be lost.')) {
      window.location.reload();
    }
  };

  const handleAddCameraKF = () => {
    const map = mapRef.current?.getMap?.();
    let center: [number, number] = [0, 20];
    let zoom = 2;
    let pitch = 0;
    let bearing = 0;

    if (map) {
      const c = map.getCenter();
      center = [c.lng, c.lat];
      zoom = map.getZoom();
      pitch = map.getPitch();
      bearing = map.getBearing();
    }

    const kf = {
      id: nanoid(),
      time: playheadTime,
      camera: { center, zoom, pitch, bearing, altitude: null },
      easing: 'easeInOutCubic' as const,
      followRoute: null,
    };
    addCameraKeyframe(kf);
    toast.success(`Camera keyframe added at ${playheadTime.toFixed(1)}s`);
  };

  const rightMarginVal = !isInspectorOpen || isMobile ? PANEL_MARGIN : isTablet ? RIGHT_RESERVED_TABLET : RIGHT_RESERVED_DESKTOP;
  const finalRightMargin = isMobile ? '0px' : `${rightMarginVal}px`;
  const finalLeftMargin = isMobile ? '0px' : `${PANEL_MARGIN}px`;
  const finalTopMargin = isMobile ? '0px' : `${PANEL_MARGIN}px`;
  const finalRounded = isMobile ? 'rounded-none' : 'rounded-2xl';

  // --- Render Groups ---

  const renderProjectMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={`h-8 ${isMobile ? 'px-1' : 'px-2.5'} flex items-center gap-1.5 text-xs font-medium focus-visible:ring-0`} title="Project Settings">
          {!isMobile && <span>Project</span>}
          <ChevronDown size={14} className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 overflow-hidden bg-background/95 border-border/50 shadow-2xl rounded-2xl">
        <DropdownMenuItem onClick={handleNewProject} className="gap-2 cursor-pointer py-2.5">
          <FilePlus2 size={14} /> New Project
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSaveToLibrary} className="gap-2 cursor-pointer py-2.5">
          <Save size={14} /> Save to Library
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLibrary} className="gap-2 cursor-pointer py-2.5">
          <Library size={14} /> My Projects...
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuItem onClick={handleExportProject} className="gap-2 cursor-pointer py-2.5">
          <FileJson size={14} /> Export Project File
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => projectInputRef.current?.click()} className="gap-2 cursor-pointer py-2.5">
          <Upload size={14} /> Import Project File
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border/50" />
        <DropdownMenuItem onClick={() => selectItem(null)} className="gap-2 cursor-pointer py-2.5">
          <Settings size={14} /> Project Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderAddGroup = () => (
    <div className={`flex items-center ${isMobile ? 'gap-2 w-full justify-between px-2' : 'gap-0.5'}`}>
      <RouteAddDropdown 
        onImportClick={() => routeInputRef.current?.click()} 
        isOpen={activeDropdown === 'route'}
        onOpenChange={(open) => setActiveDropdown(open ? 'route' : null)}
      />
      <BoundaryAddDropdown 
        isOpen={activeDropdown === 'boundary'}
        onOpenChange={(open) => setActiveDropdown(open ? 'boundary' : null)}
      />
      <CalloutAddDropdown 
        isOpen={activeDropdown === 'callout'}
        onOpenChange={(open) => setActiveDropdown(open ? 'callout' : null)}
      />
      <ToolbarButton icon={<Crosshair size={18} />} label="Camera KF" hideLabel onClick={handleAddCameraKF} />
      {isMobile && (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => {
            setMobileMode('default');
            setActiveDropdown(null);
          }}
          className="h-8 w-8 rounded-full bg-secondary/50 hover:bg-secondary transition-all"
        >
          <X size={16} />
        </Button>
      )}
    </div>
  );

  const renderLayerGroup = () => (
    <div className={`flex items-center ${isMobile ? 'gap-2 w-full justify-between px-2' : 'gap-1'}`}>
      <div className="flex items-center gap-1 px-1 flex-1">
        <Select value={mapStyle} onValueChange={setMapStyle}>
          <SelectTrigger className={`h-8 text-xs ${isMobile ? 'flex-1' : 'w-[130px]'} focus:ring-1 focus:ring-ring focus:ring-offset-0 border-border bg-background`}>
            <SelectValue placeholder="Map Style" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border/50 shadow-2xl">
            {Object.entries(MAP_STYLES).map(([key, { label }]) => (
              <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {!isMobile && <ToolbarButton icon={<Settings2 size={16} />} label="Map Settings" hideLabel onClick={() => selectItem(null)} />}
      {!isMobile && <Divider />}
      
      <div className="flex items-center gap-1">
        <ToolbarToggle
          icon={<Mountain size={16} />}
          label="Terrain"
          hideLabel
          active={terrainEnabled}
          onClick={() => setTerrainEnabled(!terrainEnabled)}
          loading={terrainLoading && !isPlaying && !isScrubbing}
        />
        <ToolbarToggle
          icon={<Building2 size={16} />}
          label="Buildings"
          hideLabel
          active={buildingsEnabled}
          onClick={() => setBuildingsEnabled(!buildingsEnabled)}
          loading={buildingsLoading && !isPlaying && !isScrubbing}
        />
      </div>

      {isMobile && (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setMobileMode('default')}
          className="h-8 w-8 rounded-full bg-secondary/50 hover:bg-secondary transition-all"
        >
          <X size={16} />
        </Button>
      )}
    </div>
  );

  // --- Main Toolbar Layout ---

  return (
    <div 
      className={`h-14 ${finalRounded} absolute bg-background/85 backdrop-blur-xl border border-border/50 flex items-center px-4 shadow-2xl shadow-black/10 pointer-events-auto z-50 transition-all duration-300`}
      style={{
        top: finalTopMargin,
        left: finalLeftMargin,
        right: finalRightMargin
      }}
    >
      <input ref={routeInputRef} type="file" accept=".kml,.gpx" multiple className="hidden" onChange={handleImport} />
      <input ref={projectInputRef} type="file" accept=".lilmap,.json" className="hidden" onChange={handleImportProject} />

      {isMobile ? (
        // Mobile Modes
        <div className="w-full flex items-center h-full relative overflow-hidden">
          {mobileMode === 'default' && (
            <div className="flex items-center w-full animate-in slide-in-from-left-4 duration-300 fill-mode-both">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} className="w-6 h-6 mr-1" alt="Logo" />
              {renderProjectMenu()}
              <Divider />
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMobileMode('add')}
                title="Add New Track"
              >
                <Plus size={20} />
              </Button>
              <Divider />
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMobileMode('layers')}
              >
                <Layers2 size={20} />
              </Button>
              
              <div className="flex-1" />
              
              <ToolbarButton
                icon={isPlaying ? <Pause size={18} /> : <Play size={18} />}
                label={isPlaying ? 'Pause' : 'Play'}
                hideLabel
                onClick={() => setIsPlaying(!isPlaying)}
                accent
              />
              <div className="w-1" />
              <ToolbarButton icon={<Video size={18} />} label="Export" hideLabel onClick={onExport} />
            </div>
          )}

          {mobileMode === 'add' && (
            <div className="flex items-center w-full animate-in slide-in-from-right-4 duration-300 fill-mode-both">
              {renderAddGroup()}
            </div>
          )}

          {mobileMode === 'layers' && (
            <div className="flex items-center w-full animate-in slide-in-from-right-4 duration-300 fill-mode-both">
              {renderLayerGroup()}
            </div>
          )}
        </div>
      ) : (
        // Desktop / Tablet Mode
        <>
          <div className="flex items-center gap-2 mr-2 pl-1 shrink-0">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} className="w-7 h-7 drop-shadow-sm" alt="li'l Mappo Logo" />
            {!isTablet && <span className="font-bold text-sm tracking-tight hidden xl:inline-block">li'l Mappo</span>}
          </div>

          {renderProjectMenu()}
          <Divider />

          {/* Add Group */}
          <div className="flex items-center gap-0.5">
            <RouteAddDropdown 
              onImportClick={() => routeInputRef.current?.click()} 
              isOpen={activeDropdown === 'route'}
              onOpenChange={(open) => setActiveDropdown(open ? 'route' : null)}
            />
            {isTablet ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 px-0 flex items-center justify-center text-primary" title="Add More Items">
                    <Plus size={20} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 bg-background/95 rounded-2xl shadow-2xl p-1">
                  <BoundaryAddDropdown 
                    isOpen={activeDropdown === 'boundary'}
                    onOpenChange={(open) => setActiveDropdown(open ? 'boundary' : null)}
                  />
                  <div className="h-px bg-border/30 my-1" />
                  <CalloutAddDropdown 
                    isOpen={activeDropdown === 'callout'}
                    onOpenChange={(open) => setActiveDropdown(open ? 'callout' : null)}
                  />
                  <div className="h-px bg-border/30 my-1" />
                  <DropdownMenuItem onClick={handleAddCameraKF} className="gap-2 cursor-pointer h-9 text-xs rounded-xl">
                    <Crosshair size={14} /> Add Camera KF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <BoundaryAddDropdown 
                  isOpen={activeDropdown === 'boundary'}
                  onOpenChange={(open) => setActiveDropdown(open ? 'boundary' : null)}
                />
                <CalloutAddDropdown 
                  isOpen={activeDropdown === 'callout'}
                  onOpenChange={(open) => setActiveDropdown(open ? 'callout' : null)}
                />
                <ToolbarButton icon={<Crosshair size={16} />} label="Camera KF" hideLabel onClick={handleAddCameraKF} />
              </>
            )}
          </div>

          <Divider />

          {/* Map Layers */}
          {isTablet ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 px-0 flex items-center justify-center" title="Map Display">
                  <Layers2 size={20} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 bg-background/95 p-3 space-y-4 rounded-2xl shadow-2xl border-border/50">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Map Style</label>
                  <Select value={mapStyle} onValueChange={setMapStyle}>
                    <SelectTrigger className="h-9 text-xs w-full focus:ring-1 focus:ring-ring focus:ring-offset-0 border-border bg-background/50 rounded-xl">
                      <SelectValue placeholder="Map Style" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/50 shadow-2xl">
                      {Object.entries(MAP_STYLES).map(([key, { label }]) => (
                        <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <DropdownToggle 
                    icon={<Mountain size={14} />} 
                    label="Terrain" 
                    active={terrainEnabled} 
                    onClick={() => setTerrainEnabled(!terrainEnabled)} 
                    loading={terrainLoading && !isPlaying && !isScrubbing}
                  />
                  <DropdownToggle 
                    icon={<Building2 size={14} />} 
                    label="Buildings" 
                    active={buildingsEnabled} 
                    onClick={() => setBuildingsEnabled(!buildingsEnabled)} 
                    loading={buildingsLoading && !isPlaying && !isScrubbing}
                  />
                </div>
                
                <div className="h-px bg-border/50 mx-1 border-dotted border-b" />

                <DropdownMenuItem onClick={() => selectItem(null)} className="gap-2 cursor-pointer h-9 text-xs rounded-xl">
                  <Settings2 size={14} /> Full Map Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : renderLayerGroup()}

          <div className="flex-1" />
          <Divider />

          <ToolbarButton
            icon={isPlaying ? <Pause size={16} /> : <Play size={16} />}
            label={isPlaying ? 'Pause' : 'Play'}
            hideLabel
            onClick={() => setIsPlaying(!isPlaying)}
            accent
          />
          <ToolbarButton icon={<Video size={16} />} label="Export" hideLabel onClick={onExport} />
          
          <Divider className="hidden sm:block" />
          <div className="hidden sm:block">
            <ToolbarButton icon={<EyeOff size={16} />} label="Hide UI" hideLabel onClick={() => setHideUI(true)} />
          </div>
        </>
      )}
    </div>
  );
}

function DropdownToggle({ icon, label, active, onClick, loading }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; loading?: boolean }) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="sm"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      className={`h-9 flex flex-1 items-center justify-start gap-2 text-[11px] font-medium px-2 rounded-xl transition-all ${active ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'text-muted-foreground'}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      <span>{label}</span>
    </Button>
  );
}

function ToolbarButton({ icon, label, onClick, accent, hideLabel }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean; hideLabel?: boolean }) {
  return (
    <Button
      variant={accent ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      className={`h-8 ${hideLabel ? 'w-8 px-0' : 'px-2.5'} flex flex-row items-center gap-1.5 text-xs focus-visible:ring-0 rounded-lg transition-all ${accent ? 'shadow-lg shadow-primary/20' : ''}`}
      title={label}
    >
      {icon}
      {!hideLabel && <span className="hidden sm:inline">{label}</span>}
    </Button>
  );
}

function ToolbarToggle({ icon, label, active, onClick, loading, hideLabel }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; loading?: boolean; hideLabel?: boolean }) {
  return (
    <Toggle
      pressed={active}
      onPressedChange={onClick}
      size="sm"
      className={`h-8 ${hideLabel ? 'w-8 px-0' : 'px-2.5'} flex items-center gap-1.5 text-xs focus-visible:ring-0 rounded-lg data-[state=on]:bg-primary/10 data-[state=on]:text-primary transition-all`}
      title={label}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {!hideLabel && <span className="hidden sm:inline">{label}</span>}
    </Toggle>
  );
}

function Divider({ className }: { className?: string }) {
  return <div className={`w-px h-6 bg-border mx-1 ${className || ''}`} />;
}

function formatTime(s: number): string {
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms}`;
}
