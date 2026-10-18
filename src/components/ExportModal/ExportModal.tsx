import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useMapRuntime } from '@/hooks/useMapRuntime';
import { useSubscription } from '@/hooks/useSubscription';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PinDropHero } from '@/components/ui/pin-drop';
import { pinDropContentClass, popupTextClass, popupTitleClass } from '@/components/ui/popup-variants';
import { cn } from '@/lib/utils';
import { getExportDimensions, type ExportResolution, type RenderConfig } from '@/types/render';
import { getExportLimits, brandingFor } from '@/lib/cloudAccess';
import { clampResolution, resolveExportPlan, wandererNeeds } from './exportPlan';
import { useLocalExportCapability } from './hooks/useLocalExportCapability';
import { useVideoExportExecution } from './hooks/useVideoExportExecution';
import { ExportSettingsForm } from './components/ExportSettingsForm';
import { ExportStatusAlerts } from './components/ExportStatusAlerts';
import { ExportModalFooter } from './components/ExportModalFooter';
import { exportHeadline, exportMood, wandererReason } from './exportStatus';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ExportModal({ open, onClose }: ExportModalProps) {
  const {
    fps, duration, name, isExporting,
    aspectRatio, exportResolution, isVertical, resolution,
    setAspectRatio, setExportResolution, setIsVertical,
  } = useProjectStore(
    useShallow((s) => ({
      fps: s.fps,
      duration: s.duration,
      name: s.name,
      isExporting: s.isExporting,
      aspectRatio: s.aspectRatio,
      exportResolution: s.exportResolution,
      isVertical: s.isVertical,
      resolution: s.resolution,
      setAspectRatio: s.setAspectRatio,
      setExportResolution: s.setExportResolution,
      setIsVertical: s.setIsVertical,
    }))
  );

  const { session, requestSignIn, openUpgradeModal } = useAuthStore(
    useShallow((s) => ({
      session: s.session,
      requestSignIn: s.requestSignIn,
      openUpgradeModal: s.openUpgradeModal,
    }))
  );

  const { data: subscription } = useSubscription();
  const limits = getExportLimits(subscription);
  const runtimeRef = useMapRuntime();

  // Initialize editable draft from limits
  const [exportFps, setExportFps] = useState<30 | 60>(
    fps > limits.maxFps ? limits.maxFps : fps
  );
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(
    Math.min(duration, limits.maxDuration)
  );

  // A Pro resolution picked here stays in the popup; the project only keeps resolutions the plan allows.
  const [pickedResolution, setPickedResolution] = useState<ExportResolution | null>(null);
  const requestedResolution = pickedResolution ?? clampResolution(exportResolution, limits);
  const handleResolutionChange = (value: ExportResolution) => {
    setPickedResolution(value);
    if (clampResolution(value, limits) === value) setExportResolution(value);
  };

  // Each opening starts from settings the plan allows, so nobody opens the popup onto Get Wanderer.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setPickedResolution(null);
      setExportFps((value) => (value > limits.maxFps ? limits.maxFps : value));
      setEndTime((value) => Math.min(value, duration, limits.maxDuration));
    }
    wasOpen.current = open;
  }, [open, limits.maxFps, limits.maxDuration, duration]);

  const requestedRenderConfig: RenderConfig = {
    resolution,
    fps: exportFps,
    aspectRatio,
    exportResolution: requestedResolution,
    isVertical,
  };
  const wanderer = wandererReason(
    wandererNeeds(requestedRenderConfig, { startTime, endTime }, limits),
    requestedResolution,
    limits.maxDuration,
  );

  const exportPlan = resolveExportPlan(
    requestedRenderConfig,
    { startTime, endTime },
    limits
  );

  const { renderConfig: effectiveRenderConfig } = exportPlan;
  const [effectiveWidth, effectiveHeight] = effectiveRenderConfig.resolution;
  // The stats row shows what was picked, Pro or not.
  const [pickedWidth, pickedHeight] = getExportDimensions(requestedResolution, aspectRatio, isVertical);
  const pickedDuration = Math.max(0, endTime - startTime);
  const pickedFrames = Math.ceil(pickedDuration * exportFps);

  // Hook 1: Device / browser codec capability detection
  const localExportCapability = useLocalExportCapability(
    effectiveWidth,
    effectiveHeight,
    effectiveRenderConfig.fps,
    open
  );

  // Hook 2: Video export lifecycle
  const branding = brandingFor(subscription);
  const isLimitedGuest = !session && limits.limited;
  const {
    progress,
    phase,
    error,
    startExport,
    cancelExport,
  } = useVideoExportExecution(
    runtimeRef,
    exportPlan,
    branding,
    name,
    () => requestSignIn('Sign in to export your video.'),
    isLimitedGuest
  );

  const isFormDisabled = isExporting;
  const done = !isExporting && progress === 100 && !error;
  const mood = exportMood({
    isExporting,
    done,
    failed: !!error,
    unsupported: localExportCapability?.status === 'unsupported',
    needsWanderer: !!wanderer,
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={cn(pinDropContentClass, 'sm:max-w-[540px] flex flex-col')}>
        {/* Mappo holds the camera, spins a reel while exporting, cheers when it's saved, and gets tangled when it fails. */}
        <PinDropHero mood={mood} scene="export" size="compact" />
        <DialogHeader className="px-6 text-left">
          <DialogTitle className={popupTitleClass}>Export</DialogTitle>
          {/* Changes in place (keep this tab open, export complete), so the popup keeps its height. */}
          <DialogDescription className={cn(popupTextClass, error && !isExporting && 'text-destructive')} aria-live="polite">
            {exportHeadline({ isExporting, done, error, wanderer })}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-4 pb-2 space-y-4 max-h-[60vh] overflow-y-auto">
          <ExportSettingsForm
            aspectRatio={aspectRatio}
            isVertical={isVertical}
            resolution={requestedResolution}
            fps={exportFps}
            limits={limits}
            startTime={startTime}
            endTime={endTime}
            duration={duration}
            disabled={isFormDisabled}
            onAspectRatioChange={setAspectRatio}
            onOrientationChange={setIsVertical}
            onResolutionChange={handleResolutionChange}
            onFpsChange={setExportFps}
            onStartTimeChange={setStartTime}
            onEndTimeChange={setEndTime}
          />

          <ExportStatusAlerts
            requiresSignIn={isLimitedGuest}
            exportDuration={pickedDuration}
            effectiveWidth={pickedWidth}
            effectiveHeight={pickedHeight}
            totalFrames={pickedFrames}
          />
        </div>

        <ExportModalFooter
          isExporting={isExporting}
          progress={progress}
          phase={phase}
          localExportCapability={localExportCapability}
          width={effectiveWidth}
          height={effectiveHeight}
          fps={effectiveRenderConfig.fps}
          requiresSignIn={isLimitedGuest}
          wandererReason={wanderer}
          onExport={startExport}
          onCancel={cancelExport}
          onUpgrade={() => openUpgradeModal('export_limits')}
        />
      </DialogContent>
    </Dialog>
  );
}
