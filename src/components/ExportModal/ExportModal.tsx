import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useMapRuntime } from '@/hooks/useMapRuntime';
import { useSubscription } from '@/hooks/useSubscription';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PinDropHero } from '@/components/ui/pin-drop';
import { pinDropContentClass, popupTextClass, popupTitleClass } from '@/components/ui/popup-variants';
import { cn } from '@/lib/utils';
import type { RenderConfig } from '@/types/render';
import { getExportLimits, brandingFor } from '@/lib/cloudAccess';
import { resolveExportPlan } from './exportPlan';
import { useLocalExportCapability } from './hooks/useLocalExportCapability';
import { useVideoExportExecution } from './hooks/useVideoExportExecution';
import { ExportSettingsForm } from './components/ExportSettingsForm';
import { ExportStatusAlerts } from './components/ExportStatusAlerts';
import { ExportModalFooter } from './components/ExportModalFooter';
import { exportHeadline, exportMood } from './exportStatus';

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

  const requestedRenderConfig: RenderConfig = {
    resolution,
    fps: exportFps,
    aspectRatio,
    exportResolution,
    isVertical,
  };

  const exportPlan = resolveExportPlan(
    requestedRenderConfig,
    { startTime, endTime },
    limits
  );

  const { renderConfig: effectiveRenderConfig } = exportPlan;
  const [effectiveWidth, effectiveHeight] = effectiveRenderConfig.resolution;
  const exportDuration = Math.max(0, exportPlan.endTime - exportPlan.startTime);
  const totalFrames = Math.ceil(exportDuration * effectiveRenderConfig.fps);

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
            {exportHeadline({ isExporting, done, error })}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-4 pb-2 space-y-4 max-h-[60vh] overflow-y-auto">
          <ExportSettingsForm
            aspectRatio={aspectRatio}
            isVertical={isVertical}
            exportPlan={exportPlan}
            limits={limits}
            startTime={startTime}
            duration={duration}
            disabled={isFormDisabled}
            onAspectRatioChange={setAspectRatio}
            onOrientationChange={setIsVertical}
            onResolutionChange={setExportResolution}
            onFpsChange={setExportFps}
            onStartTimeChange={setStartTime}
            onEndTimeChange={setEndTime}
          />

          <ExportStatusAlerts
            limits={limits}
            requiresSignIn={isLimitedGuest}
            exportDuration={exportDuration}
            effectiveWidth={effectiveWidth}
            effectiveHeight={effectiveHeight}
            totalFrames={totalFrames}
            onOpenUpgrade={() => openUpgradeModal('export_limits')}
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
          onExport={startExport}
          onCancel={cancelExport}
        />
      </DialogContent>
    </Dialog>
  );
}
