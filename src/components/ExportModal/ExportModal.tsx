import React, { useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapRef } from '@/hooks/useMapRef';
import { runExport } from '@/services/videoExport';
import { saveAs } from 'file-saver';
import { X, Download, Loader2, Film, AlertTriangle } from 'lucide-react';

interface ExportModalProps {
  onClose: () => void;
}

export default function ExportModal({ onClose }: ExportModalProps) {
  const { fps, resolution, duration, name } = useProjectStore();
  const mapRef = useMapRef();

  const [exportRes, setExportRes] = useState<[number, number]>(resolution);
  const [exportFps, setExportFps] = useState<number>(fps);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setProgress(0);
    setError(null);
    abortRef.current = new AbortController();

    // Pause playback if running
    useProjectStore.getState().setIsPlaying(false);

    try {
      await runExport(mapRef, {
        resolution: exportRes,
        fps: exportFps,
        onProgress: (pct) => setProgress(pct),
        onComplete: (blob) => {
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
          const fileName = `${name.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'export'}.${ext}`;
          saveAs(blob, fileName);
          setIsExporting(false);
          setProgress(100);
        },
        onError: (err) => {
          setError(err);
          setIsExporting(false);
        },
        abortSignal: abortRef.current.signal,
      });
    } catch (e: any) {
      setError(e.message || 'Export failed');
      setIsExporting(false);
    }
  }, [mapRef, exportRes, exportFps, name]);

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsExporting(false);
    setProgress(0);
  };

  const totalFrames = Math.ceil(duration * exportFps);
  const estimatedTime = Math.ceil(totalFrames * 0.08); // rough ~80ms per frame

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[460px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Film size={18} className="text-primary" />
            <h2 className="text-sm font-semibold">Export Video</h2>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground"
            disabled={isExporting}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Resolution */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Resolution</label>
            <select
              value={exportRes.join('x')}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                setExportRes([w, h]);
              }}
              disabled={isExporting}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="1920x1080">1920 × 1080 (1080p)</option>
              <option value="2560x1440">2560 × 1440 (1440p)</option>
              <option value="3840x2160">3840 × 2160 (4K)</option>
            </select>
          </div>

          {/* FPS */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Frame Rate</label>
            <select
              value={exportFps}
              onChange={(e) => setExportFps(Number(e.target.value))}
              disabled={isExporting}
              className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value={30}>30 FPS</option>
              <option value={60}>60 FPS</option>
            </select>
          </div>

          {/* Info row */}
          <div className="flex gap-4 text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
            <div>
              <span className="block font-semibold text-foreground">{duration.toFixed(1)}s</span>
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-secondary/30">
          {isExporting ? (
            <button
              onClick={handleCancel}
              className="h-9 px-4 text-sm font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="h-9 px-4 text-sm font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleExport}
                className="h-9 px-5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                {progress === 100 ? (
                  <>
                    <Download size={14} />
                    Export Again
                  </>
                ) : (
                  <>
                    <Film size={14} />
                    Start Export
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
