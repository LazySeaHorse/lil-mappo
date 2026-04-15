import { useEffect, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { MapRefContext } from '@/hooks/useMapRef';
import { useProjectStore } from '@/store/useProjectStore';
import { runExport } from '@/services/videoExport';
import MapViewport from '@/components/MapViewport/MapViewport';
import type { RenderConfig } from '@/types/render';
import type { Project } from '@/store/types';

interface HeadlessRendererProps {
  jobId: string;
  secret: string;
}

/**
 * Headless render mode — loaded when the URL contains ?render_job=<id>&render_secret=<secret>.
 *
 * Lifecycle:
 *   1. Fetch project data + render config from /api/render-job-data
 *   2. Load project into Zustand store
 *   3. Apply transient map state from render config
 *   4. Render an invisible <MapViewport> full-screen
 *   5. Once map is ready, run the export pipeline
 *   6. Upload the blob to DO Spaces via presigned URL
 *   7. Signal Playwright via window.__renderResult
 */
export function HeadlessRenderer({ jobId, secret }: HeadlessRendererProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [jobData, setJobData] = useState<{
    projectData: Project;
    renderConfig: RenderConfig;
    startTime: number;
    endTime: number;
  } | null>(null);
  const [status, setStatus] = useState<string>('Fetching job data...');
  const hasStarted = useRef(false);

  // ── Step 1-3: Load job data and hydrate store ───────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch(`/api/render-job-data?jobId=${jobId}&secret=${encodeURIComponent(secret)}`);
        if (!res.ok) throw new Error(`Failed to fetch job data: ${res.status}`);
        const data = await res.json();

        if (cancelled) return;

        // Hydrate project into store
        useProjectStore.getState().loadFullProject(data.projectData as Project);

        // Apply transient map visual state (call setMapStyle first so it resets
        // terrain/buildings, then applyRenderConfig to restore them)
        const config = data.renderConfig as RenderConfig;
        useProjectStore.getState().setMapStyle(config.mapStyle);
        useProjectStore.getState().applyRenderConfig(config);
        useProjectStore.getState().setIsExporting(true);

        setJobData({
          projectData: data.projectData,
          renderConfig: config,
          startTime: data.startTime,
          endTime: data.endTime,
        });
        setStatus('Waiting for map...');

        // Log the WebGL renderer so Modal logs show whether the T4 is actually
        // being used or whether Chrome fell back to SwiftShader (CPU rendering).
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (gl) {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          const renderer = ext
            ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER);
          console.log(`[GPU] WebGL renderer: ${renderer}`);
        } else {
          console.log('[GPU] WebGL not available');
        }
      } catch (e: any) {
        setStatus(`Init error: ${e.message}`);
        await signalFailure(e.message);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [jobId, secret]);

  // ── Step 4-7: Run export once map is ready and job data is loaded ───────────
  useEffect(() => {
    if (!mapReady || !jobData || hasStarted.current) return;
    hasStarted.current = true;

    const abortController = new AbortController();

    async function render() {
      setStatus('Rendering...');
      try {
        await runExport(mapRef, {
          renderConfig: jobData!.renderConfig,
          startTime: jobData!.startTime,
          endTime: jobData!.endTime,
          onProgress: (pct, phase) => {
            setStatus(`${phase === 'prewarm' ? 'Warming cache' : 'Rendering'}: ${pct}%`);
          },
          onComplete: async (blob) => {
            setStatus('Uploading...');
            try {
              // Get presigned PUT URL
              const presignRes = await fetch('/api/render-presign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, secret }),
              });
              if (!presignRes.ok) throw new Error(`Presign failed: ${presignRes.status}`);
              const { presignedUrl, outputUrl } = await presignRes.json();

              // Upload directly to DO Spaces
              const uploadRes = await fetch(presignedUrl, {
                method: 'PUT',
                body: blob,
                headers: { 'Content-Type': 'video/mp4' },
              });
              if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

              // Mark job complete
              await fetch('/api/render-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, secret, outputUrl }),
              });

              setStatus('Done!');
              (window as any).__renderResult = { success: true, outputUrl };
            } catch (uploadErr: any) {
              await signalFailure(uploadErr.message);
            }
          },
          onError: async (err) => {
            setStatus(`Error: ${err}`);
            await signalFailure(err);
          },
          abortSignal: abortController.signal,
        });
      } catch (e: any) {
        await signalFailure(e.message);
      }
    }

    render();
    return () => abortController.abort();
  }, [mapReady, jobData, jobId, secret]);

  async function signalFailure(errorMessage: string) {
    try {
      await fetch('/api/render-fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, secret, errorMessage }),
      });
    } catch {
      // best-effort
    }
    (window as any).__renderResult = { success: false, error: errorMessage };
  }

  return (
    <MapRefContext.Provider value={mapRef}>
      {/* Invisible full-screen map — kept off-screen so it doesn't flash */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -9999,
          pointerEvents: 'none',
        }}
      >
        {jobData && (
          <MapViewport
            mapRef={mapRef}
            onMapReady={() => setMapReady(true)}
          />
        )}
      </div>

      {/* Minimal status overlay — visible to Playwright logs, not to users */}
      <div
        id="headless-status"
        style={{
          position: 'fixed',
          top: 8,
          left: 8,
          fontSize: 11,
          color: '#888',
          fontFamily: 'monospace',
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        [Headless] {status}
      </div>
    </MapRefContext.Provider>
  );
}
