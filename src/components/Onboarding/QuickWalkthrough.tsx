import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { CAMERA_TRACK_ID, useProjectStore } from '@/store/useProjectStore';
import type { CameraItem } from '@/store/types';
import {
  useWalkthroughStore,
  readStoredStatus,
  readMobileWarningStatus,
  storeMobileWarningStatus,
} from './useWalkthroughStore';
import { MobileWarningModal } from './MobileWarningModal';
import { TourInvitationModal } from './TourInvitationModal';
import { CoachmarkOverlay } from './CoachmarkOverlay';
import {
  getWalkthroughStages,
  getWalkthroughStepConfig,
  type VisibleWalkthroughStage,
} from './walkthroughSteps';

interface QuickWalkthroughProps {
  isMapReady: boolean;
  isMobile: boolean;
  isTablet: boolean;
}

export default function QuickWalkthrough({ isMapReady, isMobile, isTablet }: QuickWalkthroughProps) {
  const usesLayerMenu = isMobile || isTablet;

  const {
    isRunning,
    walkthrough,
    isMapStyleOpen,
    isMapToolsOpen,
    showMobileWarning,
    showInvitation,
    start,
    dismiss,
    send,
    setShowMobileWarning,
    setShowInvitation,
  } = useWalkthroughStore();

  const cameraKeyframeCount = useProjectStore((state) => {
    const camera = state.items[CAMERA_TRACK_ID] as CameraItem | undefined;
    return camera?.keyframes.length ?? 0;
  });
  const playheadTime = useProjectStore((state) => state.playheadTime);
  const selectedKeyframeId = useProjectStore((state) => state.selectedKeyframeId);
  const mapStyle = useProjectStore((state) => state.mapStyle);
  const projectSettingsTab = useProjectStore((state) => state.projectSettingsTab);
  const clearedSelectionForPrompt = useRef(false);

  const handleStart = useCallback(() => {
    start(isMobile, cameraKeyframeCount, usesLayerMenu);
  }, [cameraKeyframeCount, isMobile, start, usesLayerMenu]);

    // Prompt invitation / experimental mobile warning on initial mount when map is ready
    useEffect(() => {
      if (!isMapReady) return;

      const isMobileSize = isMobile || (typeof window !== 'undefined' && window.innerWidth <= 768);

      if (isMobileSize && !readMobileWarningStatus()) {
        const warningDelay = window.setTimeout(() => setShowMobileWarning(true), 400);
        return () => window.clearTimeout(warningDelay);
      }

      if (!readStoredStatus()) {
        const invitationDelay = window.setTimeout(() => setShowInvitation(true), 600);
        return () => window.clearTimeout(invitationDelay);
      }
    }, [isMapReady, isMobile, setShowInvitation, setShowMobileWarning]);

    const handleDismissMobileWarning = useCallback(() => {
      setShowMobileWarning(false);
      storeMobileWarningStatus();

      if (!readStoredStatus()) {
        const timer = window.setTimeout(() => setShowInvitation(true), 400);
        return () => window.clearTimeout(timer);
      }
    }, [setShowInvitation, setShowMobileWarning]);

    const handleDismissInvitation = useCallback(() => {
      setShowInvitation(false);
      dismiss();
    }, [dismiss, setShowInvitation]);

    // Reactive transitions based on app state
    useEffect(() => {
      if (!isRunning) return;
      send({ type: 'keyframe-count-changed', count: cameraKeyframeCount, playheadTime });
    }, [cameraKeyframeCount, isRunning, playheadTime, send]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'move-playhead') return;
      useProjectStore.getState().setIsInspectorOpen(false);
      send({ type: 'playhead-time-changed', time: playheadTime });
    }, [isRunning, playheadTime, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'play-animation') return;
      useProjectStore.getState().setPlayheadTime(0);
    }, [isRunning, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'select-keyframe') {
        clearedSelectionForPrompt.current = false;
        return;
      }

      if (!clearedSelectionForPrompt.current) {
        clearedSelectionForPrompt.current = true;
        const store = useProjectStore.getState();
        store.selectKeyframe(null);
        store.setIsInspectorOpen(false);
        return;
      }

      if (selectedKeyframeId) send({ type: 'keyframe-selected' });
    }, [isRunning, selectedKeyframeId, send, walkthrough.stage]);

    useEffect(() => {
      if (
        !isRunning ||
        (walkthrough.stage !== 'change-map-style' &&
          walkthrough.stage !== 'return-standard-style')
      ) return;

      send({ type: 'map-style-changed', style: mapStyle });
    }, [isRunning, mapStyle, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'map-settings-tab') return;
      send({ type: 'project-settings-tab-changed', tab: projectSettingsTab });
    }, [isRunning, projectSettingsTab, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'prepare-render') return;
      useProjectStore.getState().setIsInspectorOpen(false);

      const layoutDelay = window.setTimeout(() => {
        send({ type: 'render-layout-ready' });
      }, 350);
      return () => window.clearTimeout(layoutDelay);
    }, [isRunning, send, walkthrough.stage]);

    useEffect(() => {
      if (!isRunning || walkthrough.stage !== 'complete') return;
      useWalkthroughStore.getState().complete();
    }, [isRunning, walkthrough.stage]);

    const stages = useMemo(
      () => getWalkthroughStages(isMobile, usesLayerMenu),
      [isMobile, usesLayerMenu],
    );

    const visibleStepIndex = stages.indexOf(walkthrough.stage as VisibleWalkthroughStage);
    const hasVisibleStep = visibleStepIndex >= 0;

    const isUsingAddTool = walkthrough.stage.endsWith('-editor');
    const isUsingStylePopup = isMapStyleOpen || (
      isTablet &&
      isMapToolsOpen &&
      (walkthrough.stage === 'change-map-style' ||
        walkthrough.stage === 'return-standard-style' ||
        walkthrough.stage === 'map-settings')
    );
    const isTooltipHidden = isUsingAddTool || isUsingStylePopup;

    const currentStepConfig = useMemo(() => {
      if (!hasVisibleStep) return null;
      return getWalkthroughStepConfig(
        walkthrough.stage as VisibleWalkthroughStage,
        isMobile,
        isTablet,
      );
    }, [hasVisibleStep, isMobile, isTablet, walkthrough.stage]);

    const handleNext = useCallback(() => {
      if (walkthrough.stage === 'play-animation') {
        useProjectStore.getState().setIsPlaying(false);
        send({ type: 'play-preview-acknowledged' });
      } else if (walkthrough.stage === 'inspect-keyframe') {
        send({ type: 'inspector-acknowledged' });
      } else if (walkthrough.stage === 'map-settings-overview') {
        send({ type: 'map-settings-overview-acknowledged' });
      } else if (walkthrough.stage === 'terrain-buildings') {
        send({ type: 'terrain-intro-acknowledged', currentStyle: mapStyle });
      }
    }, [mapStyle, send, walkthrough.stage]);

    return (
      <>
        <MobileWarningModal
          open={showMobileWarning}
          onDismiss={handleDismissMobileWarning}
        />

        <TourInvitationModal
          open={showInvitation}
          onStart={handleStart}
          onDismiss={handleDismissInvitation}
        />

        {isRunning && hasVisibleStep && !isTooltipHidden && currentStepConfig && (
          <CoachmarkOverlay
            step={currentStepConfig}
            stepIndex={visibleStepIndex}
            totalSteps={stages.length}
            isMobile={isMobile}
            gestures={walkthrough.gestures}
            onSkip={dismiss}
            onNext={handleNext}
          />
        )}
      </>
    );
}
