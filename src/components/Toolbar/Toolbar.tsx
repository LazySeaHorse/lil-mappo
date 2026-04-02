import React, { useRef, useCallback } from 'react';
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
  EyeOff, Eye
} from 'lucide-react';
import { toast } from 'sonner';
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

interface ToolbarProps {
  onExport: () => void;
  onLibrary: () => void;
}

export default function Toolbar({ onExport, onLibrary }: ToolbarProps) {
  const routeInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useMapRef();
  const projectState = useProjectStore();
  const {
    isPlaying, setIsPlaying, mapStyle, setMapStyle,
    terrainEnabled, setTerrainEnabled, buildingsEnabled, setBuildingsEnabled,
    terrainLoading, buildingsLoading,
    addItem, playheadTime, addCameraKeyframe, selectItem,
    setHideUI,
  } = projectState;

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
      // Strip out all Zustand action functions before saving to IDB to avoid DataCloneError
      const plainData = JSON.parse(JSON.stringify(projectState));
      await saveProjectToLibrary(plainData);
      toast.success('Saved to library');
    } catch {
      toast.error('Failed to save to library');
    }
  };

  const handleNewProject = () => {
    if (window.confirm('Clear current project and start fresh? Unsaved changes will be lost.')) {
      // Very basic reset by reloading the page for a truly clean slate (or we could store initial state)
      window.location.reload();
    }
  };

  const handleAddBoundary = () => {
    const item: BoundaryItem = {
      kind: 'boundary',
      id: nanoid(),
      placeName: '',
      geojson: null,
      resolveStatus: 'idle',
      startTime: playheadTime,
      endTime: playheadTime + 5,
      style: {
        strokeColor: '#8b5cf6',
        strokeWidth: 5,
        glow: true,
        glowColor: '#8b5cf6',
        fillColor: '#8b5cf6',
        fillOpacity: 0.1,
        animateStroke: true,
        animationStyle: 'draw',
        traceLength: 0.1,
      },
      easing: 'easeInOutCubic',
    };
    addItem(item);
    selectItem(item.id);
  };

  const handleAddCallout = () => {
    const item: CalloutItem = {
      kind: 'callout',
      id: nanoid(),
      title: 'New Callout',
      subtitle: '',
      imageUrl: null,
      lngLat: [0, 0],
      anchor: 'bottom',
      startTime: playheadTime,
      endTime: playheadTime + 5,
      animation: {
        enter: 'scaleUp',
        exit: 'fadeOut',
        enterDuration: 0.5,
        exitDuration: 0.3,
      },
      style: {
        bgColor: '#ffffff',
        textColor: '#1e293b',
        borderRadius: 8,
        shadow: true,
        maxWidth: 240,
        fontFamily: 'Inter',
      },
      altitude: 50,
      poleVisible: true,
      poleColor: '#94a3b8',
    };
    addItem(item);
    selectItem(item.id);
    toast.info('Click on the map to place the callout');
  };

  const handleAddCameraKF = () => {
    // Capture the ACTUAL current viewport state from the map
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

  return (
    <div className="absolute top-4 left-4 right-[350px] h-14 bg-background/85 backdrop-blur-xl border border-border/50 rounded-2xl flex items-center px-4 gap-1 shadow-xl pointer-events-auto z-50">
      <input
        ref={routeInputRef}
        type="file"
        accept=".kml,.gpx"
        multiple
        className="hidden"
        onChange={handleImport}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".lilmap,.json"
        className="hidden"
        onChange={handleImportProject}
      />

      <div className="flex items-center gap-2 mr-3 pl-1">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} className="w-7 h-7 drop-shadow-sm" alt="li'l Mappo Logo" />
        <span className="font-bold text-sm tracking-tight hidden xl:inline-block">li'l Mappo</span>
      </div>

      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-medium focus-visible:ring-0">
            Project <ChevronDown size={14} className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={handleNewProject} className="gap-2 cursor-pointer">
            <FilePlus2 size={14} /> New Project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSaveToLibrary} className="gap-2 cursor-pointer">
            <Save size={14} /> Save to Library
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLibrary} className="gap-2 cursor-pointer">
            <Library size={14} /> My Projects...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleExportProject} className="gap-2 cursor-pointer">
            <FileJson size={14} /> Export Project File
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => projectInputRef.current?.click()} className="gap-2 cursor-pointer">
            <Upload size={14} /> Import Project File
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => selectItem(null)} className="gap-2 cursor-pointer">
            <Settings size={14} /> Project Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />

      <ToolbarButton icon={<Upload size={16} />} label="Import Route" onClick={() => routeInputRef.current?.click()} />
      <Divider />
      <ToolbarButton icon={<MapPin size={16} />} label="Boundary" hideLabel onClick={handleAddBoundary} />
      <ToolbarButton icon={<MessageSquare size={16} />} label="Callout" hideLabel onClick={handleAddCallout} />
      <ToolbarButton icon={<Crosshair size={16} />} label="Camera KF" hideLabel onClick={handleAddCameraKF} />
      <Divider />
      <ToolbarButton icon={<Settings2 size={16} />} label="Map Settings" onClick={() => selectItem(null)} />
      <Divider />
      <div className="flex items-center gap-1 px-1">
        <Select value={mapStyle} onValueChange={setMapStyle}>
          <SelectTrigger className="h-8 text-xs w-[130px] focus:ring-1 focus:ring-ring focus:ring-offset-0 border-border bg-background">
            <SelectValue placeholder="Map Style" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(MAP_STYLES).map(([key, { label }]) => (
              <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ToolbarToggle
        icon={<Mountain size={16} />}
        label="3D Terrain"
        hideLabel
        active={terrainEnabled}
        onClick={() => setTerrainEnabled(!terrainEnabled)}
        loading={terrainLoading}
      />
      <ToolbarToggle
        icon={<Building2 size={16} />}
        label="Buildings"
        hideLabel
        active={buildingsEnabled}
        onClick={() => setBuildingsEnabled(!buildingsEnabled)}
        loading={buildingsLoading}
      />
      
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
      <Divider />
      <ToolbarButton icon={<EyeOff size={16} />} label="Hide UI" hideLabel onClick={() => setHideUI(true)} />
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, accent, hideLabel }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean; hideLabel?: boolean }) {
  return (
    <Button
      variant={accent ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      className={`h-8 ${hideLabel ? 'w-8 px-0' : 'px-2.5'} flex flex-row items-center gap-1.5 text-xs focus-visible:ring-0`}
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
      className={`h-8 ${hideLabel ? 'w-8 px-0' : 'px-2.5'} flex items-center gap-1.5 text-xs focus-visible:ring-0 data-[state=on]:bg-item-route/20 data-[state=on]:text-primary`}
      title={label}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {!hideLabel && <span className="hidden sm:inline">{label}</span>}
    </Toggle>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-border mx-1" />;
}

function formatTime(s: number): string {
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms}`;
}
