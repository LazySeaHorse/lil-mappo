import React, { useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/react/shallow';
import { useMapRef } from '@/hooks/useMapRef';
import { useCredits } from '@/hooks/useCredits';
import { useSubscription } from '@/hooks/useSubscription';
import { runExport } from '@/services/videoExport';
import { saveAs } from 'file-saver';
import { X, Download, Clapperboard, AlertTriangle, Cloud, Lock, Monitor, Smartphone, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ProBadge } from '@/components/ui/pro-badge';
import type { AspectRatio, ExportResolution, RenderConfig } from '@/types/render';
import {
  RESOLUTION_LABELS,
  getExportDimensions,
  calculateRenderCredits,
} from '@/types/render';
import { getExportLimits, shouldShowWatermark } from '@/lib/cloudAccess';

interface ExportModalProps {
  onClose: () => void;
}

export default function ExportModal({ onClose }: ExportModalProps) {
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

  const { session, user, openAuthModal, openCreditsModal } = useAuthStore(
    useShallow((s) => ({ session: s.session, user: s.user, openAuthModal: s.openAuthModal, openCreditsModal: s.openCreditsModal }))
  );

  const { data: subscription } = useSubscription();
  const limits = getExportLimits(subscription);

  const { data: creditBalance } = useCredits();
  const mapRef = useMapRef();

  // Clamp initial values to limits so state is always valid on open
  const [exportFps, setExportFps] = useState<30 | 60>(
    fps > limits.maxFps ? limits.maxFps : fps
  );
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(
    Math.min(duration, limits.maxDuration)
  );
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'prewarm' | 'capture'>('capture');
  const [error, setError] = useState<string | null>(null);
  const [cloudSubmitted, setCloudSubmitted] = useState(false);

  const webCodecsSupported = typeof VideoEncoder !== 'undefined';
  const abortRef = useRef<AbortController | null>(null);

  const [w, h] = resolution;
  const exportDuration = Math.max(0, endTime - startTime);
  const totalFrames = Math.ceil(exportDuration * exportFps);
  const credits = calculateRenderCredits(exportResolution, exportDuration, exportFps);
  const totalCredits = (creditBalance?.monthly_credits ?? 0) + (creditBalance?.purchased_credits ?? 0);
  const canAfford = totalCredits >= credits;

  const buildRenderConfig = useCallback((): RenderConfig => ({
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
  }), [resolution, exportFps, aspectRatio, exportResolution, isVertical, mapStyle, terrainEnabled, buildingsEnabled, labelVisibility, show3dLandmarks, show3dTrees, show3dFacades]);

  const handleExport = useCallback(async () => {
    // Guests without BYOK must sign in before exporting
    if (!session && limits.limited) {
      openAuthModal();
      return;
    }
    useProjectStore.getState().setIsExporting(true);
    setProgress(0);
    setError(null);
    abortRef.current = new AbortController();

    const showWatermark = shouldShowWatermark(subscription);
    useProjectStore.getState().setIsPlaying(false);
    useProjectStore.getState().setHideUI(true);

    try {
      await runExport(mapRef, {
        renderConfig: buildRenderConfig(),
        startTime,
        endTime,
        showWatermark,
        onProgress: (pct, p) => { setProgress(pct); setPhase(p); },
        onComplete: (blob) => {
          const fileName = `${name.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'export'}.mp4`;
          saveAs(blob, fileName);
          useProjectStore.getState().setIsExporting(false);
          setProgress(100);
          useProjectStore.getState().setHideUI(false);
        },
        onError: (err) => {
          setError(err);
          useProjectStore.getState().setIsExporting(false);
          useProjectStore.getState().setHideUI(false);
        },
        abortSignal: abortRef.current.signal,
      });
    } catch (e: any) {
      setError(e.message || 'Export failed');
      useProjectStore.getState().setIsExporting(false);
      useProjectStore.getState().setHideUI(false);
    }
  }, [mapRef, buildRenderConfig, name, startTime, endTime]);

  const handleCancel = () => {
    abortRef.current?.abort();
    useProjectStore.getState().setIsExporting(false);
    setProgress(0);
    useProjectStore.getState().setHideUI(false);
  };

  const handleCloudRender = async () => {
    if (!session) { openAuthModal(); return; }
    if (!canAfford) { openCreditsModal(); return; }
    setError(null);
    setCloudSubmitted(false);

    const store = useProjectStore.getState();
    const renderConfig = buildRenderConfig();

    // Snapshot persisted project fields only
    const projectData = {
      id: store.id, name: store.name, duration: store.duration, fps: store.fps,
      resolution: store.resolution, aspectRatio: store.aspectRatio,
      exportResolution: store.exportResolution, isVertical: store.isVertical,
      projection: store.projection, lightPreset: store.lightPreset,
      starIntensity: store.starIntensity, fogColor: store.fogColor,
      terrainExaggeration: store.terrainExaggeration,
      items: store.items, itemOrder: store.itemOrder, mapCenter: store.mapCenter,
    };

    try {
      const res = await fetch('/api/render-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ projectData, renderConfig, startTime, endTime }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      setCloudSubmitted(true);
    } catch (e: any) {
      setError(e.message || 'Failed to submit cloud render');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[460px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Clapperboard size={18} className="text-primary" />
            <h2 className="text-sm font-semibold">Export Video</h2>
          </div>
          <IconButton onClick={onClose} variant="ghost" size="sm" disabled={isExporting}>
            <X size={16} />
          </IconButton>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aspect Ratio">
              <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)} disabled={isExporting || cloudSubmitted}>
                <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="21:9">21:9</SelectItem>
                  <SelectItem value="4:3">4:3</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Orientation">
              <SegmentedControl
                options={[
                  { value: 'landscape', label: <Monitor size={14} /> },
                  { value: 'portrait', label: <Smartphone size={14} /> },
                ]}
                value={isVertical ? 'portrait' : 'landscape'}
                onValueChange={(v) => setIsVertical(v === 'portrait')}
                className="h-9 w-full"
                disabled={isExporting || cloudSubmitted}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={
              <span className="flex items-center gap-1">
                Resolution
                {limits.limited && <Lock size={10} className="text-muted-foreground/60" />}
              </span>
            }>
              <Select
                value={exportResolution}
                onValueChange={(v) => setExportResolution(v as ExportResolution)}
                disabled={isExporting || cloudSubmitted}
              >
                <SelectTrigger className="h-9 text-sm flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['480p', '720p', '1080p', '1440p', '2160p'] as ExportResolution[]).map((r) => {
                    const resOrder = ['480p', '720p', '1080p', '1440p', '2160p'];
                    const isLocked = limits.limited && resOrder.indexOf(r) > resOrder.indexOf(limits.maxResolution);
                    return (
                      <SelectItem key={r} value={r} disabled={isLocked}>
                        <div className="flex items-center gap-1.5">
                          {RESOLUTION_LABELS[r]}
                          {isLocked && <ProBadge />}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>

            <Field label={
              <span className="flex items-center gap-1">
                Frame Rate
                {limits.limited && <Lock size={10} className="text-muted-foreground/60" />}
              </span>
            }>
              <Select
                value={exportFps.toString()}
                onValueChange={(v) => setExportFps(Number(v) as 30 | 60)}
                disabled={isExporting || cloudSubmitted}
              >
                <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 FPS</SelectItem>
                  <SelectItem value="60" disabled={limits.maxFps < 60}>
                    <div className="flex items-center gap-1.5">
                      60 FPS
                      {limits.maxFps < 60 && <ProBadge />}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Time (s)">
              <Input
                type="number"
                min={0}
                max={endTime}
                step={0.1}
                value={startTime}
                onChange={(e) => setStartTime(Number(e.target.value))}
                disabled={isExporting || cloudSubmitted}
                className="h-9 text-sm"
              />
            </Field>
            <Field label={
              <span className="flex items-center gap-1">
                End Time (s)
                {limits.limited && <Lock size={10} className="text-muted-foreground/60" />}
              </span>
            }>
              <Input
                type="number"
                min={startTime}
                max={Math.min(duration, limits.maxDuration)}
                step={0.1}
                value={endTime}
                onChange={(e) => setEndTime(Math.min(Number(e.target.value), limits.maxDuration))}
                disabled={isExporting || cloudSubmitted}
                className="h-9 text-sm"
              />
            </Field>
          </div>

          {(limits.limited || isExporting) && (
            <div className={`p-3 rounded-xl border space-y-2 ${
              isExporting 
                ? 'bg-destructive/10 border-destructive/20' 
                : 'bg-primary/5 border-primary/10'
            }`}>
              {isExporting ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold text-destructive flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    IMPORTANT: KEEP TAB OPEN
                  </p>
                  <p className="text-[11px] leading-relaxed text-destructive/80">
                    Stay on this browser tab and don't minimize the browser or else the render will fail. 
                  </p>
                  <p className="text-[10px] text-destructive/50 italic leading-none">
                    Cloud renders don't have this issue.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-bold text-primary">Free plan:</span> Limited to 720p, 30fps and 30s.
                  </p>
                  <button
                    onClick={openCreditsModal}
                    className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                  >
                    Upgrade to a paid plan (or BYOK) to unlock <ArrowRight size={10} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Info row */}
          <div className="flex gap-4 text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
            <div><span className="block font-semibold text-foreground">{exportDuration.toFixed(1)}s</span>Duration</div>
            <div><span className="block font-semibold text-foreground whitespace-nowrap">{w} × {h}</span>Dimensions</div>
            <div><span className="block font-semibold text-foreground">{totalFrames}</span>Total frames</div>
            <div><span className="block font-semibold text-foreground">MP4</span>Format</div>
          </div>

          {/* Unsupported browser warning */}
          {!webCodecsSupported && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Local export requires WebCodecs (Chrome 94+ or Edge 94+). This browser cannot export video.</span>
            </div>
          )}

          {/* Progress bar */}
          {isExporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{phase === 'prewarm' ? 'Warming tile cache...' : 'Rendering frames...'}</span>
                <span className="text-xs font-mono text-muted-foreground">{progress}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-3">{error}</div>}

          {/* Success Local */}
          {!isExporting && progress === 100 && !error && (
            <div className="text-xs text-primary bg-primary/10 rounded-lg p-3 flex items-center gap-2">
              <Download size={14} /> Export complete! The file has been downloaded.
            </div>
          )}

          {/* Success Cloud */}
          {cloudSubmitted && !error && (
            <div className="text-xs text-primary bg-primary/10 rounded-lg p-3 flex items-center gap-2">
              <Cloud size={14} /> Render queued! Check My Renders for progress and download.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-5 border-t border-border bg-secondary/10">
          {/* CLOUD RENDERING TEMPORARILY DISABLED — not dead code.
              Re-enable once GPU acceleration is working in the Modal render worker.
          <Button
            variant="outline"
            onClick={handleCloudRender}
            className={`flex-1 h-11 text-sm font-semibold flex items-center justify-center gap-2 transition-all outline-offset-[-1px] border-dashed ${isExporting || cloudSubmitted ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:border-primary/50'}`}
            disabled={isExporting || cloudSubmitted}
          >
            <Cloud size={16} className={isExporting || cloudSubmitted ? 'text-muted-foreground' : 'text-primary'} />
            <span className="shrink-0 font-medium whitespace-nowrap">Cloud Render &middot; {credits} cr</span>
            <ProBadge />
          </Button>
          */}
          <Button
            variant="outline"
            disabled
            className="flex-1 h-11 text-sm font-semibold flex items-center justify-center gap-2 opacity-40 border-dashed cursor-not-allowed"
          >
            <Cloud size={16} className="text-muted-foreground" />
            <span className="font-medium whitespace-nowrap">Cloud Render</span>
            <span className="text-[10px] text-muted-foreground font-normal">soon™</span>
          </Button>

          {isExporting ? (
            <Button onClick={handleCancel} variant="outline" className="flex-1 h-11 text-sm font-semibold border-destructive/30 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50 transition-all">
              Cancel
            </Button>
          ) : (
            <Button
              onClick={handleExport}
              disabled={cloudSubmitted || !webCodecsSupported}
              className="flex-1 h-11 text-sm font-bold flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:brightness-110 transition-all active:scale-[0.99] shadow-lg shadow-primary/10"
            >
              {progress === 100 ? <><Download size={16} /> Again</> : <><Clapperboard size={16} /> Local Export</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
