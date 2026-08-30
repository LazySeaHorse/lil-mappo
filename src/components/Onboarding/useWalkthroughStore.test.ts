import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useWalkthroughStore, WALKTHROUGH_STORAGE_KEY } from './useWalkthroughStore';
import { CAMERA_TRACK_ID, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createTransientState } from '@/store/slices/mapEnvironmentSlice';
import type { CameraItem, CameraKeyframe } from '@/store/types';

describe('useWalkthroughStore store-level synchronization and entry effects', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({
      ...createProject(),
      ...createTransientState(),
      isInspectorOpen: true,
      playheadTime: 0,
    });
    useWalkthroughStore.getState().dismiss();
  });

  afterEach(() => {
    useWalkthroughStore.getState().dismiss();
    vi.clearAllTimers();
  });

  it('initializes walkthrough state, closes inspector, and starts subscriptions', () => {
    useProjectStore.setState({ isInspectorOpen: true });
    expect(useProjectStore.getState().isInspectorOpen).toBe(true);

    useWalkthroughStore.getState().start(false, 0, false);

    expect(useWalkthroughStore.getState().isRunning).toBe(true);
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('map-controls');
    expect(useProjectStore.getState().isInspectorOpen).toBe(false);
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe('started');
  });

  it('transitions from map-controls to first-keyframe on desktop after gestures', () => {
    const store = useWalkthroughStore.getState();
    store.start(false, 0, false);

    store.recordMapGesture('pan');
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('map-controls');

    store.recordMapGesture('orbit');
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('map-controls');

    store.recordMapGesture('zoom');
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('first-keyframe');
  });

  it('transitions to move-playhead upon camera keyframe addition and closes inspector', () => {
    const walkthrough = useWalkthroughStore.getState();
    walkthrough.start(false, 0, false);

    walkthrough.recordMapGesture('pan');
    walkthrough.recordMapGesture('orbit');
    walkthrough.recordMapGesture('zoom');
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('first-keyframe');

    useProjectStore.setState({ isInspectorOpen: true });

    // Add first keyframe to useProjectStore
    const kf1: CameraKeyframe = {
      id: 'kf-1',
      time: 0,
      camera: { center: [0, 0], zoom: 10, pitch: 0, bearing: 0 },
      easing: 'linear',
    };
    useProjectStore.getState().addCameraKeyframe(kf1);

    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('move-playhead');
    expect(useProjectStore.getState().isInspectorOpen).toBe(false);
  });

  it('advances through playhead movement and second keyframe to play-animation', () => {
    const walkthrough = useWalkthroughStore.getState();
    walkthrough.start(false, 0, false);

    walkthrough.recordMapGesture('pan');
    walkthrough.recordMapGesture('orbit');
    walkthrough.recordMapGesture('zoom');

    // First keyframe at time 0
    useProjectStore.getState().addCameraKeyframe({
      id: 'kf-1',
      time: 0,
      camera: { center: [0, 0], zoom: 10, pitch: 0, bearing: 0 },
      easing: 'linear',
    });
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('move-playhead');

    // Minor playhead movement (< 0.1) should not advance
    useProjectStore.getState().setPlayheadTime(0.05);
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('move-playhead');

    // Sufficient playhead movement (>= 0.1) advances to second-keyframe
    useProjectStore.getState().setPlayheadTime(3);
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('second-keyframe');

    // Add second keyframe at time 3
    useProjectStore.getState().addCameraKeyframe({
      id: 'kf-2',
      time: 3,
      camera: { center: [10, 10], zoom: 12, pitch: 30, bearing: 45 },
      easing: 'easeInOutCubic',
    });

    // Entering play-animation resets playheadTime to 0
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('play-animation');
    expect(useProjectStore.getState().playheadTime).toBe(0);
  });

  it('transitions to select-keyframe, clears selection, and detects keyframe selection', () => {
    const walkthrough = useWalkthroughStore.getState();
    walkthrough.start(false, 0, false);

    // Skip to play-animation
    walkthrough.send({ type: 'map-gesture', gesture: 'pan' });
    walkthrough.send({ type: 'map-gesture', gesture: 'orbit' });
    walkthrough.send({ type: 'map-gesture', gesture: 'zoom' });
    useProjectStore.getState().addCameraKeyframe({
      id: 'kf-1',
      time: 0,
      camera: { center: [0, 0], zoom: 10, pitch: 0, bearing: 0 },
      easing: 'linear',
    });
    useProjectStore.getState().setPlayheadTime(3);
    useProjectStore.getState().addCameraKeyframe({
      id: 'kf-2',
      time: 3,
      camera: { center: [10, 10], zoom: 12, pitch: 30, bearing: 45 },
      easing: 'easeInOutCubic',
    });

    // Currently in play-animation
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('play-animation');

    // Select a keyframe prior to moving to select-keyframe stage
    useProjectStore.getState().selectKeyframe('kf-1');
    useProjectStore.setState({ isInspectorOpen: true });
    expect(useProjectStore.getState().selectedKeyframeId).toBe('kf-1');

    // Advance to select-keyframe stage via next()
    walkthrough.next();
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('select-keyframe');
    // Entry effect should have cleared selection and closed inspector
    expect(useProjectStore.getState().selectedKeyframeId).toBeNull();
    expect(useProjectStore.getState().isInspectorOpen).toBe(false);

    // Now selecting a keyframe in useProjectStore advances to inspect-keyframe
    useProjectStore.getState().selectKeyframe('kf-2');
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('inspect-keyframe');
  });

  it('handles map style and settings changes directly via subscriptions', () => {
    const walkthrough = useWalkthroughStore.getState();
    walkthrough.start(false, 0, false);

    // Set stage to terrain-buildings
    useWalkthroughStore.setState({
      walkthrough: {
        ...useWalkthroughStore.getState().walkthrough,
        stage: 'terrain-buildings',
      },
    });

    // Advance to change-map-style
    useProjectStore.setState({ mapStyle: 'standard' });
    walkthrough.next();
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('change-map-style');

    // Change style in project store
    useProjectStore.getState().setMapStyle('satellite-streets');
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('return-standard-style');

    // Return to standard style
    useProjectStore.getState().setMapStyle('standard');
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('map-settings');

    // Open map settings
    walkthrough.send({ type: 'map-settings-opened' });
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('map-settings-tab');

    // Switch tab to map in project store
    useProjectStore.getState().setProjectSettingsTab('map');
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('map-settings-overview');
  });

  it('handles layout delay for prepare-render and completes walkthrough on export', () => {
    vi.useFakeTimers();
    const walkthrough = useWalkthroughStore.getState();
    walkthrough.start(false, 0, false);

    useWalkthroughStore.setState({
      walkthrough: {
        ...useWalkthroughStore.getState().walkthrough,
        stage: 'map-settings-overview',
      },
    });

    useProjectStore.setState({ isInspectorOpen: true });

    walkthrough.next(); // advances to prepare-render
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('prepare-render');
    expect(useProjectStore.getState().isInspectorOpen).toBe(false);

    // Fast-forward layout delay
    vi.advanceTimersByTime(350);
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('render');

    // Open export
    walkthrough.recordExportOpened();
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('complete');
    expect(useWalkthroughStore.getState().isRunning).toBe(false);
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe('completed');

    vi.useRealTimers();
  });

  it('unsubscribes and prevents state leaks when dismissed', () => {
    const walkthrough = useWalkthroughStore.getState();
    walkthrough.start(false, 0, false);

    walkthrough.dismiss();
    expect(useWalkthroughStore.getState().isRunning).toBe(false);
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe('dismissed');

    // Project changes should no longer affect walkthrough
    useProjectStore.getState().addCameraKeyframe({
      id: 'kf-test',
      time: 0,
      camera: { center: [0, 0], zoom: 10, pitch: 0, bearing: 0 },
      easing: 'linear',
    });

    expect(useWalkthroughStore.getState().isRunning).toBe(false);
    expect(useWalkthroughStore.getState().walkthrough.stage).toBe('map-controls');
  });
});
