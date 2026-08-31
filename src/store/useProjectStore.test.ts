import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore, CAMERA_TRACK_ID, createTransientState } from './useProjectStore';
import { isCameraItem, isRouteItem, isBoundaryItem, isCalloutItem, getItem } from './typeGuards';
import type { RouteItem, BoundaryItem, CalloutItem, CameraKeyframe, CameraItem } from './types';
import { createProject } from './projectDocument';

describe('useProjectStore modular slices', () => {
  beforeEach(() => {
    useProjectStore.setState({ ...createProject(), ...createTransientState() });
  });

  describe('itemsSlice & typeGuards', () => {
    it('adds, updates, duplicates, and removes timeline items', () => {
      const store = useProjectStore.getState();

      const routeItem: RouteItem = {
        kind: 'route',
        id: 'route-1',
        name: 'Alpine Pass',
        startTime: 0,
        endTime: 5,
        geojson: { type: 'FeatureCollection', features: [] },
        style: {
          color: '#3b82f6',
          width: 4,
          glow: true,
          glowColor: '#3b82f6',
          glowWidth: 12,
          trailFade: false,
          trailFadeLength: 0.2,
          dashPattern: null,
        },
        easing: 'linear',
      };

      store.addItem(routeItem);

      let items = useProjectStore.getState().items;
      expect(items['route-1']).toBeDefined();
      expect(isRouteItem(items['route-1'])).toBe(true);
      expect(isBoundaryItem(items['route-1'])).toBe(false);

      const typedRoute = getItem(items, 'route-1', isRouteItem);
      expect(typedRoute?.name).toBe('Alpine Pass');

      // Update item
      store.updateItem('route-1', { name: 'Coastal Drive' });
      items = useProjectStore.getState().items;
      expect(getItem(items, 'route-1', isRouteItem)?.name).toBe('Coastal Drive');

      // Duplicate item
      store.duplicateItem('route-1');
      items = useProjectStore.getState().items;
      const order = useProjectStore.getState().itemOrder;
      expect(order.length).toBe(3);
      const duplicateId = order[2];
      expect(getItem(items, duplicateId, isRouteItem)?.name).toBe('Coastal Drive Copy');

      // Remove item
      store.removeItem('route-1');
      items = useProjectStore.getState().items;
      expect(items['route-1']).toBeUndefined();
    });
  });

  describe('cameraSlice', () => {
    it('manages camera keyframes in chronological order', () => {
      const store = useProjectStore.getState();

      const kf1: CameraKeyframe = {
        id: 'kf-1',
        time: 5,
        camera: { center: [10, 20], zoom: 12, pitch: 30, bearing: 0, altitude: null },
        easing: 'easeInOutCubic',
        followRoute: null,
      };

      const kf2: CameraKeyframe = {
        id: 'kf-2',
        time: 1,
        camera: { center: [10, 20], zoom: 10, pitch: 0, bearing: 0, altitude: null },
        easing: 'linear',
        followRoute: null,
      };

      store.addCameraKeyframe(kf1);
      store.addCameraKeyframe(kf2);

      const cam = useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem;
      expect(cam.keyframes.length).toBe(2);
      expect(cam.keyframes[0].id).toBe('kf-2'); // Sorted at time 1
      expect(cam.keyframes[1].id).toBe('kf-1'); // Sorted at time 5

      // Update keyframe
      store.updateCameraKeyframe('kf-2', { time: 8 });
      const updatedCam = useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem;
      expect(updatedCam.keyframes[0].id).toBe('kf-1'); // Sorted at time 5
      expect(updatedCam.keyframes[1].id).toBe('kf-2'); // Sorted at time 8

      // Remove keyframe
      store.removeCameraKeyframe('kf-1');
      const finalCam = useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem;
      expect(finalCam.keyframes.length).toBe(1);
      expect(finalCam.keyframes[0].id).toBe('kf-2');
    });
  });

  describe('playbackSlice', () => {
    it('clamps playheadTime to [0, duration]', () => {
      const store = useProjectStore.getState();
      store.setDuration(10);

      store.setPlayheadTime(-5);
      expect(useProjectStore.getState().playheadTime).toBe(0);

      store.setPlayheadTime(15);
      expect(useProjectStore.getState().playheadTime).toBe(10);

      store.setPlayheadTime(4.5);
      expect(useProjectStore.getState().playheadTime).toBe(4.5);
    });

    it('toggles playing and scrubbing', () => {
      const store = useProjectStore.getState();
      store.setIsPlaying(true);
      expect(useProjectStore.getState().isPlaying).toBe(true);

      store.setIsScrubbing(true);
      expect(useProjectStore.getState().isScrubbing).toBe(true);
    });
  });

  describe('projectSettingsSlice', () => {
    it('updates resolution dynamically based on aspect ratio and vertical orientation', () => {
      const store = useProjectStore.getState();
      store.setExportResolution('1080p');
      store.setAspectRatio('16:9');
      store.setIsVertical(false);

      expect(useProjectStore.getState().resolution).toEqual([1920, 1080]);

      store.setIsVertical(true);
      expect(useProjectStore.getState().resolution).toEqual([1080, 1920]);

      store.setAspectRatio('1:1');
      expect(useProjectStore.getState().resolution).toEqual([1080, 1080]);
    });
  });

  describe('mapEnvironmentSlice', () => {
    it('switches map styles and resets dependent features', () => {
      const store = useProjectStore.getState();
      store.setTerrainEnabled(true);
      store.setBuildingsEnabled(true);

      expect(useProjectStore.getState().terrainEnabled).toBe(true);

      store.setMapStyle('satellite');
      const state = useProjectStore.getState();
      expect(state.mapStyle).toBe('satellite');
      expect(state.terrainEnabled).toBe(false);
      expect(state.buildingsEnabled).toBe(false);
    });
  });

  describe('editorUiSlice', () => {
    it('handles drafting boundaries and route selection', () => {
      const store = useProjectStore.getState();

      store.setPreviewBoundary({ type: 'Polygon', coordinates: [] }, 'France');
      expect(useProjectStore.getState().draftBoundaryName).toBe('France');
      expect(useProjectStore.getState().previewBoundary).toBeDefined();

      store.clearPreviewBoundary();
      expect(useProjectStore.getState().draftBoundaryName).toBe('');
      expect(useProjectStore.getState().previewBoundary).toBeNull();
    });

    it('manages active picker sessions without leaking state', () => {
      const store = useProjectStore.getState();
      expect(store.activePicker).toBeNull();

      const onPick = vi.fn();
      store.startPicking({
        id: 'test-picker',
        prompt: 'Pick a test point',
        onPick,
      });

      const active = useProjectStore.getState().activePicker;
      expect(active).toBeDefined();
      expect(active?.id).toBe('test-picker');
      expect(active?.prompt).toBe('Pick a test point');

      // Invoking callback works directly
      active?.onPick({ lngLat: [12.34, 56.78], name: 'Test Place' });
      expect(onPick).toHaveBeenCalledWith({ lngLat: [12.34, 56.78], name: 'Test Place' });

      // Stopping picker clears session cleanly
      store.stopPicking();
      expect(useProjectStore.getState().activePicker).toBeNull();
    });
  });
});
