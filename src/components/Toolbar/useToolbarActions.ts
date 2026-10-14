import { useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import { loadFileImport } from '@/lib/lazyModules';
import { createCameraKeyframe, createImportedRouteItem } from '@/store/itemFactories';
import { parseProjectDocument, toProjectDocument } from '@/store/projectDocument';
import { useMapRef } from '@/hooks/useMapRef';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { projectLibraryCoordinator } from '@/services/projectLibraryCoordinator';
import { CloudProjectSizeError } from '@/services/cloudProjectLibrary';
import { isFreeUser } from '@/lib/cloudAccess';
import { useGuestLock } from '@/hooks/useGuestLock';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { ITEM_TYPE_LABELS } from '@/lib/terms';
import { readMapCamera } from '@/engine/readMapCamera';
import { extractLineCoords } from '@/engine/geoUtils';
import { track } from '@/lib/analytics';
import { classifyImportError, importFormatOf, importSourceOf } from '@/lib/analytics/classify';
import { reportRouteAdded } from '@/lib/analytics/reporters';

const ROUTE_IMPORT_SIGN_IN = 'Sign in to import a route.';

export function useToolbarActions() {
  const mapRef = useMapRef();
  const frame = useFrameOnMap();
  const { addItem, addCameraKeyframe, selectKeyframe, selectItem, setTerrainEnabled, setBuildingsEnabled } = useProjectStore(
    useShallow(s => ({
      addItem: s.addItem,
      addCameraKeyframe: s.addCameraKeyframe,
      selectKeyframe: s.selectKeyframe,
      selectItem: s.selectItem,
      setTerrainEnabled: s.setTerrainEnabled,
      setBuildingsEnabled: s.setBuildingsEnabled,
    }))
  );

  const { data: subscription } = useSubscription();
  const requestSignIn = useAuthStore((s) => s.requestSignIn);
  const isLocked = useGuestLock();

  /** Opens the route file picker, or asks a guest to sign in first so they do not pick a file for nothing. */
  const pickRouteFile = (input: HTMLInputElement | null) => {
    if (isLocked) requestSignIn(ROUTE_IMPORT_SIGN_IN);
    else input?.click();
  };

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      requestSignIn(ROUTE_IMPORT_SIGN_IN);
      e.target.value = '';
      return;
    }
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const { importRouteFile } = await loadFileImport();
        const { name, geojson } = await importRouteFile(file);
        const playheadTime = useProjectStore.getState().playheadTime;
        const item = createImportedRouteItem({ name, geojson, startTime: playheadTime });
        addItem(item);
        setTerrainEnabled(false);
        setBuildingsEnabled(false);
        selectItem(item.id);
        frame.frameGeometry(geojson);
        const pointCount = extractLineCoords(geojson).length;
        reportRouteAdded(importSourceOf(file.name), pointCount);
        toast.success(`Imported "${name}" (${pointCount} points)`);
      } catch (err) {
        track('route_import_failed', { format: importFormatOf(file.name), error_class: classifyImportError(err) });
        toast.error(`Failed to import ${file.name}`);
      }
    }
    e.target.value = '';
  }, [addItem, selectItem, setTerrainEnabled, setBuildingsEnabled, isLocked, requestSignIn, frame]);

  const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      requestSignIn('Sign in to import a project file.');
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const project = parseProjectDocument(JSON.parse(text));
      useProjectStore.getState().loadFullProject(project);
      track('project_created', { source: 'import_file' });
      toast.success('Project imported successfully');
    } catch {
      toast.error('Failed to parse project file');
    }
    e.target.value = '';
  };

  const handleExportProject = () => {
    if (isLocked) {
      requestSignIn('Sign in to export a project file.');
      return;
    }
    const projectState = useProjectStore.getState();
    const data = JSON.stringify(toProjectDocument(projectState), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const fileName = `${projectState.name.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'project'}.lilmap`;
    saveAs(blob, fileName);
  };

  const handleSaveToLibrary = async () => {
    if (isLocked) {
      requestSignIn('Sign in to save to your library.');
      return;
    }
    const project = toProjectDocument(useProjectStore.getState());
    // Free users always save locally; Wanderer subscribers also push to cloud.
    const cloudEnabled = !isFreeUser(subscription);

    const result = await projectLibraryCoordinator.saveProject(project, cloudEnabled);
    switch (result.status) {
      case 'saved-locally':
        track('project_saved', { storage: 'local' });
        toast.success('Saved to library');
        break;
      case 'uploaded':
        track('project_saved', { storage: 'cloud' });
        toast.success('Saved');
        break;
      case 'cloud-failed':
        track('project_saved', { storage: 'local' });
        if (result.error instanceof CloudProjectSizeError) {
          toast.warning(`Saved locally — ${result.error.message}`);
        } else {
          toast.success('Saved locally — cloud sync is pending');
        }
        break;
      case 'metadata-repair-needed':
        track('project_saved', { storage: 'cloud' });
        toast.success('Saved to cloud — sync status will be repaired');
        break;
      case 'local-failed':
        toast.error('Failed to save');
        break;
    }
  };

  const handleNewProject = () => {
    useProjectStore.getState().setShowNewProjectModal(true);
  };

  const handleAddCameraKF = () => {
    const playheadTime = useProjectStore.getState().playheadTime;
    const view = readMapCamera(mapRef.current?.getMap?.());

    const keyframe = createCameraKeyframe({ time: playheadTime, ...view });
    addCameraKeyframe(keyframe);
    // Opens the inspector on the new view (a bottom drawer on a phone).
    selectKeyframe(keyframe.id);
    track('keyframe_added', { source: 'toolbar' });
    toast.success(`${ITEM_TYPE_LABELS['camera-kf']} added at ${playheadTime.toFixed(1)}s`);
  };

  return {
    pickRouteFile,
    handleImport,
    handleImportProject,
    handleExportProject,
    handleSaveToLibrary,
    handleNewProject,
    handleAddCameraKF,
  };
}
