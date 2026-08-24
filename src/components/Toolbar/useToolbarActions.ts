import { useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { nanoid } from 'nanoid';
import { importRouteFile } from '@/services/fileImport';
import type { RouteItem } from '@/store/types';
import { parseProjectDocument, toProjectDocument } from '@/store/projectDocument';
import { useMapRef } from '@/hooks/useMapRef';
import { projectLibraryCoordinator } from '@/services/projectLibraryCoordinator';
import { isFreeUser, hasByok } from '@/lib/cloudAccess';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

export function useToolbarActions() {
  const mapRef = useMapRef();
  const projectState = useProjectStore();
  const {
    playheadTime, addItem, addCameraKeyframe, selectItem,
    setTerrainEnabled, setBuildingsEnabled,
  } = projectState;

  const { data: subscription } = useSubscription();
  const { user, openAuthModal } = useAuthStore();
  const isLocked = !user && !hasByok();

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      openAuthModal();
      e.target.value = '';
      return;
    }
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
            animationType: 'draw' as const,
            cometTrailLength: 0.2,
          },
          easing: 'easeInOutCubic',
        };
        addItem(item);
        setTerrainEnabled(false);
        setBuildingsEnabled(false);
        selectItem(item.id);
        const pointCount = geojson.features.reduce((sum, f) => {
          if (f.geometry.type === 'LineString') return sum + f.geometry.coordinates.length;
          if (f.geometry.type === 'MultiLineString') {
            return sum + f.geometry.coordinates.reduce((count, line) => count + line.length, 0);
          }
          return sum;
        }, 0);
        toast.success(`Imported "${name}" (${pointCount} points)`);
      } catch {
        toast.error(`Failed to import ${file.name}`);
      }
    }
    e.target.value = '';
  }, [playheadTime, addItem, selectItem, setTerrainEnabled, setBuildingsEnabled, isLocked, openAuthModal]);

  const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      openAuthModal();
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const project = parseProjectDocument(JSON.parse(text));
      projectState.loadFullProject(project);
      toast.success('Project imported successfully');
    } catch {
      toast.error('Failed to parse project file');
    }
    e.target.value = '';
  };

  const handleExportProject = () => {
    if (isLocked) {
      openAuthModal();
      return;
    }
    const data = JSON.stringify(toProjectDocument(projectState), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const fileName = `${projectState.name.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'project'}.lilmap`;
    saveAs(blob, fileName);
  };

  const handleSaveToLibrary = async () => {
    if (isLocked) {
      openAuthModal();
      return;
    }
    const project = toProjectDocument(projectState);
    // Free users always save locally; Wanderer subscribers also push to cloud.
    const cloudEnabled = !isFreeUser(subscription);

    const result = await projectLibraryCoordinator.saveProject(project, cloudEnabled);
    switch (result.status) {
      case 'saved-locally':
        toast.success('Saved to library');
        break;
      case 'uploaded':
        toast.success('Saved');
        break;
      case 'cloud-failed':
        toast.success('Saved locally — cloud sync is pending');
        break;
      case 'metadata-repair-needed':
        toast.success('Saved to cloud — sync status will be repaired');
        break;
      case 'local-failed':
        toast.error('Failed to save');
        break;
    }
  };

  const handleNewProject = () => {
    projectState.setShowNewProjectModal(true);
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
