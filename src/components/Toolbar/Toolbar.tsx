import React, { useRef, useCallback } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { nanoid } from 'nanoid';
import { importRouteFile } from '@/services/fileImport';
import { MAP_STYLES } from '@/config/mapbox';
import type { RouteItem, BoundaryItem, CalloutItem } from '@/store/types';
import {
  Upload, MapPin, MessageSquare, Video, Play, Pause, Square,
  Mountain, Building2, Crosshair
} from 'lucide-react';
import { toast } from 'sonner';

export default function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    isPlaying, setIsPlaying, mapStyle, setMapStyle,
    terrainEnabled, setTerrainEnabled, buildingsEnabled, setBuildingsEnabled,
    addItem, playheadTime, addCameraKeyframe, selectItem,
  } = useProjectStore();

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
    // Will be populated with actual map state from MapViewport
    const kf = {
      id: nanoid(),
      time: playheadTime,
      camera: { center: [0, 20] as [number, number], zoom: 2, pitch: 0, bearing: 0, altitude: null },
      easing: 'easeInOutCubic' as const,
      followRoute: null,
    };
    addCameraKeyframe(kf);
    toast.success(`Camera keyframe added at ${playheadTime.toFixed(1)}s`);
  };

  return (
    <div className="h-12 bg-background border-b border-border flex items-center px-2 gap-0.5 shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept=".kml,.gpx"
        multiple
        className="hidden"
        onChange={handleImport}
      />
      <ToolbarButton icon={<Upload size={16} />} label="Import" onClick={() => fileInputRef.current?.click()} />
      <Divider />
      <ToolbarButton icon={<MapPin size={16} />} label="Boundary" onClick={handleAddBoundary} />
      <ToolbarButton icon={<MessageSquare size={16} />} label="Callout" onClick={handleAddCallout} />
      <ToolbarButton icon={<Crosshair size={16} />} label="Camera KF" onClick={handleAddCameraKF} />
      <Divider />
      <div className="flex items-center gap-1 px-1">
        <select
          value={mapStyle}
          onChange={(e) => setMapStyle(e.target.value)}
          className="h-8 text-xs border border-border rounded bg-background px-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {Object.entries(MAP_STYLES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      <ToolbarToggle
        icon={<Mountain size={16} />}
        label="3D Terrain"
        active={terrainEnabled}
        onClick={() => setTerrainEnabled(!terrainEnabled)}
      />
      <ToolbarToggle
        icon={<Building2 size={16} />}
        label="Buildings"
        active={buildingsEnabled}
        onClick={() => setBuildingsEnabled(!buildingsEnabled)}
      />
      <Divider />
      <ToolbarButton
        icon={isPlaying ? <Pause size={16} /> : <Play size={16} />}
        label={isPlaying ? 'Pause' : 'Play'}
        onClick={() => setIsPlaying(!isPlaying)}
        accent
      />
      <ToolbarButton icon={<Video size={16} />} label="Export" onClick={() => toast.info('Export coming soon')} />
      <div className="flex-1" />
      <span className="font-mono-time text-xs text-muted-foreground px-2">
        {formatTime(useProjectStore.getState().playheadTime)} / {formatTime(useProjectStore.getState().duration)}
      </span>
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, accent }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-2.5 flex items-center gap-1.5 rounded text-xs font-medium transition-colors
        ${accent
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'hover:bg-secondary text-foreground'}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ToolbarToggle({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-2.5 flex items-center gap-1.5 rounded text-xs font-medium transition-colors
        ${active ? 'bg-selection-bg text-primary' : 'hover:bg-secondary text-muted-foreground'}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
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
