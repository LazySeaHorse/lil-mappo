import React, { useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapRef } from '@/hooks/useMapRef';
import { runExport } from '@/services/videoExport';
import { saveAs } from 'file-saver';
import { X, Download, Clapperboard, AlertTriangle, Cloud } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { ProBadge } from '@/components/ui/pro-badge';

interface ExportModalProps {
  onClose: () => void;
}

export default function ExportModal({ onClose }: ExportModalProps) {
  const { fps, resolution, duration, name } = useProjectStore();
  const mapRef = useMapRef();

  const [exportRes, setExportRes] = useState<[number, number]>(resolution);
  const [exportFps, setExportFps] = useState<number>(fps);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(duration);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    useProjectStore.getState().setIsExporting(true);
    setProgress(0);
    setError(null);
    abortRef.current = new AbortController();

    // Pause playback if running
    useProjectStore.getState().setIsPlaying(false);
    // Hide UI to prevent blur effects from straining the GPU during capture
    useProjectStore.getState().setHideUI(true);

    try {
      await runExport(mapRef, {
        resolution: exportRes,
        fps: exportFps,
        startTime,
        endTime,
        onProgress: (pct) => setProgress(pct),
        onComplete: (blob) => {
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
          const fileName = `${name.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'export'}.${ext}`;
          saveAs(blob, fileName);
          setIsExporting(false);
          useProjectStore.getState().setIsExporting(false);
          setProgress(100);
          useProjectStore.getState().setHideUI(false);
        },
        onError: (err) => {
          setError(err);
          setIsExporting(false);
          useProjectStore.getState().setIsExporting(false);
          useProjectStore.getState().setHideUI(false);
        },
        abortSignal: abortRef.current.signal,
      });
    } catch (e: any) {
      setError(e.message || 'Export failed');
      setIsExporting(false);
      useProjectStore.getState().setIsExporting(false);
      useProjectStore.getState().setHideUI(false);
    }
  }, [mapRef, exportRes, exportFps, name, startTime, endTime]);

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsExporting(false);
    useProjectStore.getState().setIsExporting(false);
    setProgress(0);
    useProjectStore.getState().setHideUI(false);
  };

  const exportDuration = Math.max(0, endTime - startTime);
  const totalFrames = Math.ceil(exportDuration * exportFps);
  const estimatedTime = Math.ceil(totalFrames * 0.08); // rough ~80ms per frame

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[460px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Clapperboard size={18} className="text-primary" />
            <h2 className="text-sm font-semibold">Export Video</h2>
          </div>
          <IconButton
            onClick={onClose}
            variant="ghost"
            size="sm"
            disabled={isExporting}
          >
            <X size={16} />
          </IconButton>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          <Field label="Resolution">
            <Select
              value={exportRes.join('x')}
              onValueChange={(v) => {
                const [w, h] = v.split('x').map(Number);
                setExportRes([w, h]);
              }}
              disabled={isExporting}
            >
              <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="854x480">854 × 480 (480p)</SelectItem>
                <SelectItem value="1280x720">1280 × 720 (720p)</SelectItem>
                <SelectItem value="1920x1080">1920 × 1080 (1080p)</SelectItem>
                <SelectItem value="2560x1440">2560 × 1440 (1440p)</SelectItem>
                <SelectItem value="3840x2160">3840 × 2160 (4K)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Frame Rate">
            <Select
              value={exportFps.toString()}
              onValueChange={(v) => setExportFps(Number(v))}
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
                type="number"
                min={0}
                max={endTime}
                step={0.1}
                value={startTime}
                onChange={(e) => setStartTime(Number(e.target.value))}
                disabled={isExporting}
                className="h-9 text-sm"
              />
            </Field>
            <Field label="End Time (s)">
              <Input
                type="number"
                min={startTime}
                max={duration}
                step={0.1}
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
              Total frames
            </div>
            <div>
              <span className="block font-semibold text-foreground">~{estimatedTime}s</span>
              Est. time
            </div>
            <div>
              <span className="block font-semibold text-foreground">
                {typeof VideoEncoder !== 'undefined' ? 'MP4' : 'WebM'}
              </span>
              Format
            </div>
          </div>

          {/* Format note */}
          {typeof VideoEncoder === 'undefined' && (
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                WebCodecs not available in your browser. Export will use WebM format (MediaRecorder fallback).
                For MP4 output, use Chrome 94+.
              </span>
            </div>
          )}

          {/* Progress bar */}
          {isExporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Rendering frames...</span>
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
            <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-3">
              {error}
            </div>
          )}

          {/* Success */}
          {!isExporting && progress === 100 && !error && (
            <div className="text-xs text-primary bg-primary/10 rounded-lg p-3 flex items-center gap-2">
              <Download size={14} />
              Export complete! The file has been downloaded.
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-5 border-t border-border bg-secondary/10">
          <Button
            variant="outline"
            className="flex-1 h-11 px-0 text-sm font-semibold flex items-center justify-center gap-2 opacity-50 cursor-not-allowed border-dashed grayscale group transition-all"
            disabled={true}
          >
            <Cloud size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="shrink-0">Cloud Render</span>
            <ProBadge />
          </Button>

          {isExporting ? (
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
                <>
                  <Download size={16} />
                  Export Again
                </>
              ) : (
                <>
                  <Clapperboard size={16} />
                  Start Export
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
