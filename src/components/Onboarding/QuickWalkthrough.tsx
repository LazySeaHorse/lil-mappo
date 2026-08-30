import React, {
  useCallback,
  useEffect,
  useMemo,
} from 'react';
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
    next,
    setShowMobileWarning,
    setShowInvitation,
  } = useWalkthroughStore();

  const handleStart = useCallback(() => {
    start(isMobile, undefined, usesLayerMenu);
  }, [isMobile, start, usesLayerMenu]);

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
          onNext={next}
        />
      )}
    </>
  );
}
