import React, { useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useMapRuntime } from '@/hooks/useMapRuntime';
import { useSubscription } from '@/hooks/useSubscription';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { AspectRatio, ExportResolution, RenderConfig } from '@/types/render';
import { getExportLimits, shouldShowWatermark } from '@/lib/cloudAccess';
import { resolveExportPlan } from './exportPlan';
import { useLocalExportCapability } from './hooks/useLocalExportCapability';
import { useVideoExportExecution } from './hooks/useVideoExportExecution';
import { ExportSettingsForm } from './components/ExportSettingsForm';
import { ExportStatusAlerts } from './components/ExportStatusAlerts';
import { ExportModalFooter } from './components/ExportModalFooter';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ExportModal({ open, onClose }: ExportModalProps) {
  const {
    fps, duration, name, isExporting,
    aspectRatio, exportResolution, isVertical, resolution,
    mapStyle, terrainEnabled, buildingsEnabled, labelVisibility,
    show3dLandmarks, show3dTrees, show3dFacades,
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
      mapStyle: s.mapStyle,
      terrainEnabled: s.terrainEnabled,
      buildingsEnabled: s.buildingsEnabled,
      labelVisibility: s.labelVisibility,
      show3dLandmarks: s.show3dLandmarks,
      show3dTrees: s.show3dTrees,
      show3dFacades: s.show3dFacades,
      setAspectRatio: s.setAspectRatio,
      setExportResolution: s.setExportResolution,
      setIsVertical: s.setIsVertical,
    }))
  );

  const { session, openAuthModal, openUpgradeModal } = useAuthStore(
    useShallow((s) => ({
      session: s.session,
      openAuthModal: s.openAuthModal,
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
    mapStyle,
    terrainEnabled,
    buildingsEnabled,
    labelVisibility,
    show3dLandmarks,
    show3dTrees,
    show3dFacades,
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
  const showWatermark = shouldShowWatermark(subscription);
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
    showWatermark,
    name,
    openAuthModal,
    isLimitedGuest
  );

  const isFormDisabled = isExporting;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[540px] rounded-2xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent">
          <DialogHeader>
            <DialogTitle className="text-2xl font-medium tracking-tight flex items-center gap-2">
              <Clapperboard className="text-primary h-6 w-6" /> Export
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Set the video format and export range.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
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
            isExporting={isExporting}
            exportDuration={exportDuration}
            effectiveWidth={effectiveWidth}
            effectiveHeight={effectiveHeight}
            effectiveFps={effectiveRenderConfig.fps}
            totalFrames={totalFrames}
            localExportCapability={localExportCapability}
            phase={phase}
            progress={progress}
            error={error}
            cloudSubmitted={false}
            onOpenUpgrade={openUpgradeModal}
          />
        </div>

        {/* Footer */}
        <ExportModalFooter
          isExporting={isExporting}
          cloudSubmitted={false}
          progress={progress}
          localExportCapability={localExportCapability}
          onExport={startExport}
          onCancel={cancelExport}
        />
      </DialogContent>
    </Dialog>
  );
}
