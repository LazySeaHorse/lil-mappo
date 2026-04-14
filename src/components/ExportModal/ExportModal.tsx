import React, { useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/react/shallow';
import { useMapRef } from '@/hooks/useMapRef';
import { useCredits } from '@/hooks/useCredits';
import { runExport } from '@/services/videoExport';
import { saveAs } from 'file-saver';
import { X, Download, Clapperboard, AlertTriangle, Cloud, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { AspectRatio, ExportResolution, RenderConfig } from '@/types/render';
import {
  RESOLUTION_LABELS,
  getExportDimensions,
  calculateRenderCredits,
} from '@/types/render';

interface ExportModalProps {
  onClose: () => void;
}

// ─── Aspect ratio mini-preview button ─────────────────────────────────────────

const SIZE_MAP: Record<AspectRatio, { w: number; h: number }> = {
  '1:1':  { w: 20, h: 20 },
  '16:9': { w: 32, h: 18 },
  '4:3':  { w: 27, h: 20 },
  '21:9': { w: 36, h: 15 },
};

function AspectRatioButton({ ratio, selected, onClick, disabled }: {
  ratio: AspectRatio;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const { w, h } = SIZE_MAP[ratio];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        selected
          ? 'bg-primary/10 border-primary/40 text-primary'
          : 'border-border text-muted-foreground hover:border-border/80'
      }`}
    >
      <div
        className={`rounded-[2px] border-2 ${selected ? 'border-primary' : 'border-current opacity-60'}`}
        style={{ width: w, height: h }}
      />
      {ratio}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  const { session, user, openAuthModal } = useAuthStore(
    useShallow((s) => ({ session: s.session, user: s.user, openAuthModal: s.openAuthModal }))
  );

  const { data: creditBalance } = useCredits();
  const mapRef = useMapRef();

  const [tab, setTab] = useState<'local' | 'cloud'>('local');
  const [exportFps, setExportFps] = useState<30 | 60>(fps);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(duration);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'prewarm' | 'capture'>('capture');
  const [error, setError] = useState<string | null>(null);
  const [cloudSubmitted, setCloudSubmitted] = useState(false);
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
    useProjectStore.getState().setIsExporting(true);
    setProgress(0);
    setError(null);
    abortRef.current = new AbortController();

    useProjectStore.getState().setIsPlaying(false);
    useProjectStore.getState().setHideUI(true);

    try {
      await runExport(mapRef, {
        renderConfig: buildRenderConfig(),
        startTime,
        endTime,
        onProgress: (pct, p) => { setProgress(pct); setPhase(p); },
        onComplete: (blob) => {
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
          const fileName = `${name.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'export'}.${ext}`;
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

  const ASPECT_RATIOS: AspectRatio[] = ['16:9', '4:3', '1:1', '21:9'];
  const RESOLUTIONS: ExportResolution[] = ['480p', '720p', '1080p', '1440p', '2160p'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[480px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Clapperboard size={18} className="text-primary" />
            <h2 className="text-sm font-semibold">Export</h2>
          </div>
          <IconButton onClick={onClose} variant="ghost" size="sm" disabled={isExporting}>
            <X size={16} />
          </IconButton>
        </div>

        {/* Tab switcher */}
        <div className="px-5 pt-4">
          <SegmentedControl
            options={[
              { value: 'local', label: 'Local' },
              { value: 'cloud', label: 'Cloud Render' },
            ]}
            value={tab}
            onValueChange={(v) => setTab(v as 'local' | 'cloud')}
          />
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* ── Shared: Format (aspect ratio + resolution) ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Format</p>

            {/* Aspect ratio buttons + vertical toggle */}
            <div className="flex items-center gap-2">
              {ASPECT_RATIOS.map((r) => (
                <AspectRatioButton
                  key={r}
                  ratio={r}
                  selected={aspectRatio === r}
                  onClick={() => setAspectRatio(r)}
                  disabled={isExporting}
                />
              ))}
              <button
                onClick={() => setIsVertical(!isVertical)}
                disabled={isExporting}
                title={isVertical ? 'Switch to Landscape' : 'Switch to Portrait'}
                className={`ml-auto p-2 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  isVertical
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-border text-muted-foreground hover:border-border/80'
                }`}
              >
                <RotateCw size={15} />
              </button>
            </div>

            {/* Resolution dropdown + computed dims */}
            <div className="flex items-center gap-3">
              <Select
                value={exportResolution}
                onValueChange={(v) => setExportResolution(v as ExportResolution)}
                disabled={isExporting}
              >
                <SelectTrigger className="h-9 text-sm flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOLUTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{RESOLUTION_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                {w} × {h} px
              </span>
            </div>
          </div>

          {/* ── Local tab ── */}
          {tab === 'local' && (
            <>
              <Field label="Frame Rate">
                <Select
                  value={exportFps.toString()}
                  onValueChange={(v) => setExportFps(Number(v) as 30 | 60)}
                  disabled={isExporting}
                >
                  <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 FPS</SelectItem>
                    <SelectItem value="60">60 FPS</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Time (s)">
                  <Input
                    type="number" min={0} max={endTime} step={0.1}
                    value={startTime}
                    onChange={(e) => setStartTime(Number(e.target.value))}
                    disabled={isExporting}
                    className="h-9 text-sm"
                  />
                </Field>
                <Field label="End Time (s)">
                  <Input
                    type="number" min={startTime} max={duration} step={0.1}
                    value={endTime}
                    onChange={(e) => setEndTime(Number(e.target.value))}
                    disabled={isExporting}
                    className="h-9 text-sm"
                  />
                </Field>
              </div>

              {/* Info row */}
              <div className="flex gap-4 text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
                <div>
                  <span className="block font-semibold text-foreground">{exportDuration.toFixed(1)}s</span>
                  Duration
                </div>
                <div>
                  <span className="block font-semibold text-foreground">{totalFrames}</span>
                  Frames
                </div>
                <div>
                  <span className="block font-semibold text-foreground">
                    {typeof VideoEncoder !== 'undefined' ? 'MP4' : 'WebM'}
                  </span>
                  Format
                </div>
              </div>

              {/* WebCodecs fallback warning */}
              {typeof VideoEncoder === 'undefined' && (
                <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>WebCodecs not available. Export will use WebM (MediaRecorder fallback). For MP4, use Chrome 94+.</span>
                </div>
              )}

              {/* Progress bar */}
              {isExporting && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      {phase === 'prewarm' ? 'Warming tile cache...' : 'Rendering frames...'}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">{progress}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-3">{error}</div>
              )}

              {/* Success */}
              {!isExporting && progress === 100 && !error && (
                <div className="text-xs text-primary bg-primary/10 rounded-lg p-3 flex items-center gap-2">
                  <Download size={14} />
                  Export complete! The file has been downloaded.
                </div>
              )}
            </>
          )}

          {/* ── Cloud tab ── */}
          {tab === 'cloud' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Time (s)">
                  <Input
                    type="number" min={0} max={endTime} step={0.1}
                    value={startTime}
                    onChange={(e) => setStartTime(Number(e.target.value))}
                    className="h-9 text-sm"
                  />
                </Field>
                <Field label="End Time (s)">
                  <Input
                    type="number" min={startTime} max={duration} step={0.1}
                    value={endTime}
                    onChange={(e) => setEndTime(Number(e.target.value))}
                    className="h-9 text-sm"
                  />
                </Field>
              </div>

              {/* Frame rate */}
              <Field label="Frame Rate">
                <Select
                  value={exportFps.toString()}
                  onValueChange={(v) => setExportFps(Number(v) as 30 | 60)}
                >
                  <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 FPS</SelectItem>
                    <SelectItem value="60">60 FPS</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {/* Credit cost summary */}
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Render cost</span>
                  <span className="font-bold">{credits} credit{credits !== 1 ? 's' : ''}</span>
                </div>
                {user && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Your balance</span>
                    <span className={`font-semibold ${canAfford ? 'text-foreground' : 'text-destructive'}`}>
                      {totalCredits} credit{totalCredits !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                {user && !canAfford && (
                  <p className="text-[11px] text-destructive mt-1">
                    Not enough credits. Top up to continue.
                  </p>
                )}
              </div>

              {/* Error / success */}
              {error && (
                <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-3">{error}</div>
              )}
              {cloudSubmitted && !error && (
                <div className="text-xs text-primary bg-primary/10 rounded-lg p-3 flex items-center gap-2">
                  <Cloud size={14} />
                  Render queued! Check My Renders for progress and download.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-5 border-t border-border bg-secondary/10">
          <Button variant="outline" className="flex-1 h-11 text-sm" onClick={onClose} disabled={isExporting}>
            Close
          </Button>

          {tab === 'local' ? (
            isExporting ? (
              <Button
                onClick={handleCancel}
                variant="outline"
                className="flex-1 h-11 text-sm font-semibold border-destructive/30 hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50 transition-all"
              >
                Cancel Rendering
              </Button>
            ) : (
              <Button
                onClick={handleExport}
                className="flex-1 h-11 text-sm font-bold flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:brightness-110 transition-all active:scale-[0.99] shadow-lg shadow-primary/10"
              >
                {progress === 100 ? (
                  <><Download size={16} /> Export Again</>
                ) : (
                  <><Clapperboard size={16} /> Start Export</>
                )}
              </Button>
            )
          ) : (
            !user ? (
              <Button
                onClick={() => { onClose(); openAuthModal(); }}
                className="flex-1 h-11 text-sm font-bold"
              >
                Sign In to Render
              </Button>
            ) : (
              <Button
                onClick={handleCloudRender}
                disabled={!canAfford || cloudSubmitted}
                className="flex-1 h-11 text-sm font-bold flex items-center justify-center gap-2"
              >
                <Cloud size={16} />
                {cloudSubmitted ? 'Render Queued' : `Cloud Render · ${credits} credit${credits !== 1 ? 's' : ''}`}
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
