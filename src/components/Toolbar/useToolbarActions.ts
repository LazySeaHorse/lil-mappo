import { useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { nanoid } from 'nanoid';
import { importRouteFile } from '@/services/fileImport';
import type { RouteItem } from '@/store/types';
import { useMapRef } from '@/hooks/useMapRef';
import { saveProjectToLibrary } from '@/services/projectLibrary';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

export function useToolbarActions() {
  const mapRef = useMapRef();
  const projectState = useProjectStore();
  const {
    playheadTime, addItem, addCameraKeyframe, selectItem,
    setTerrainEnabled, setBuildingsEnabled,
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
  }, [playheadTime, addItem, selectItem, setTerrainEnabled, setBuildingsEnabled]);

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

    addCameraKeyframe({
      id: nanoid(),
      time: playheadTime,
      camera: { center, zoom, pitch, bearing, altitude: null },
      easing: 'easeInOutCubic' as const,
      followRoute: null,
    });
    toast.success(`Camera keyframe added at ${playheadTime.toFixed(1)}s`);
  };

  return {
    handleImport,
    handleImportProject,
    handleExportProject,
    handleSaveToLibrary,
    handleNewProject,
    handleAddCameraKF,
  };
}
