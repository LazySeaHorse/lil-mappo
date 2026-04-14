import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { CameraItem, RouteItem } from '@/store/types';
import { getCameraAtTime } from '@/engine/cameraInterpolation';
import { compositeFrame, withMapResized } from './mapCapture';
import type { RenderConfig } from '@/types/render';

/**
 * Non-realtime offline export engine.
 * Steps through each frame at 1/fps, renders the map, composites callouts via
 * canvas 2D, then encodes with WebCodecs + mp4-muxer (or MediaRecorder fallback).
 *
 * Two phases are reported via onProgress:
 *   'prewarm'  — 24-frame cache warm-up pass (scrubs timeline to force tile loads)
 *   'capture'  — actual frame-by-frame encoding pass
 */

export interface ExportOptions {
  renderConfig: RenderConfig;
  startTime?: number;
  endTime?: number;
  onProgress: (pct: number, phase: 'prewarm' | 'capture') => void;
  onComplete: (blob: Blob) => void;
  onError: (err: string) => void;
  abortSignal: AbortSignal;
}

interface EncoderState {
  compCanvas: HTMLCanvasElement;
  compCtx: CanvasRenderingContext2D;
  muxer: any;
  videoEncoder: VideoEncoder | null;
  mediaRecorder: MediaRecorder | null;
  mediaStream: MediaStream | null;
  recordedChunks: Blob[];
}

// ─── Encoder init ─────────────────────────────────────────────────────────────

async function initEncoder(
  width: number,
  height: number,
  fps: number,
  onError: (err: string) => void,
): Promise<EncoderState> {
  const compCanvas = document.createElement('canvas');
  compCanvas.width = width;
  compCanvas.height = height;
  const compCtx = compCanvas.getContext('2d')!;

  let muxer: any = null;
  let videoEncoder: VideoEncoder | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  const recordedChunks: Blob[] = [];

  if (typeof VideoEncoder !== 'undefined') {
    try {
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
      const target = new ArrayBufferTarget();
      muxer = new Muxer({
        target,
        video: { codec: 'avc', width, height },
        fastStart: 'in-memory',
      });
      videoEncoder = new VideoEncoder({
        output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
        error: (e: Error) => onError(`VideoEncoder error: ${e.message}`),
      });
      videoEncoder.configure({
        codec: 'avc1.640028',
        width,
        height,
        bitrate: 8_000_000,
        framerate: fps,
      });
    } catch {
      videoEncoder = null;
      muxer = null;
    }
  }

  if (!videoEncoder) {
    mediaStream = compCanvas.captureStream(0);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType, videoBitsPerSecond: 8_000_000 });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.start();
  }

  return { compCanvas, compCtx, muxer, videoEncoder, mediaRecorder, mediaStream, recordedChunks };
}

// ─── Tile cache pre-warm ───────────────────────────────────────────────────────

async function prewarmTileCache(
  map: any,
  getRouteCoords: (id: string) => number[][] | null,
  totalDuration: number,
  startTime: number,
  onProgress: (pct: number, phase: 'prewarm' | 'capture') => void,
  abortSignal: AbortSignal,
) {
  const STEPS = 24;
  const freshStore = useProjectStore.getState();
  const camItem = freshStore.items[CAMERA_TRACK_ID] as CameraItem | undefined;

  for (let i = 0; i < STEPS; i++) {
    if (abortSignal.aborted) return;

    const t = startTime + (totalDuration / (STEPS - 1)) * i;
    const clampedT = Math.min(t, freshStore.duration);

    if (camItem && camItem.keyframes.length > 0) {
      const cam = getCameraAtTime(camItem.keyframes, clampedT, getRouteCoords);
      if (cam) {
        map.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing });
      }
    }

    // Wait for map to settle, max 2s
    await Promise.race([
      new Promise<void>((resolve) => map.once('idle', resolve)),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);

    onProgress(Math.round(((i + 1) / STEPS) * 100), 'prewarm');
  }

  // Reset to start position
  if (camItem && camItem.keyframes.length > 0) {
    const cam = getCameraAtTime(camItem.keyframes, startTime, getRouteCoords);
    if (cam) {
      map.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing });
    }
  }
}

// ─── Single frame capture ─────────────────────────────────────────────────────

async function captureFrame(
  map: any,
  compCanvas: HTMLCanvasElement,
  compCtx: CanvasRenderingContext2D,
  encoder: Pick<EncoderState, 'videoEncoder' | 'mediaRecorder'>,
  frameIndex: number,
  fps: number,
  clampedTime: number,
  getRouteCoords: (id: string) => number[][] | null,
) {
  const { videoEncoder, mediaRecorder } = encoder;
  const [width, height] = [compCanvas.width, compCanvas.height];

  // Set playhead
  useProjectStore.getState().setPlayheadTime(clampedTime);

  // Drive camera
  const freshStore = useProjectStore.getState();
  const camItem = freshStore.items[CAMERA_TRACK_ID] as CameraItem | undefined;
  if (camItem && camItem.keyframes.length > 0) {
    const cam = getCameraAtTime(camItem.keyframes, clampedTime, getRouteCoords);
    if (cam) {
      map.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing });
    }
  }

  // Sync map engine and trigger repaint
  const syncEngine = (map as any)._syncRef?.current;
  if (syncEngine) syncEngine();
  map.triggerRepaint();

  // Wait for map idle, then one animation frame to flush compositing
  await Promise.race([
    new Promise<void>((resolve) =>
      map.once('idle', () => requestAnimationFrame(() => resolve()))
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)), // safety timeout
  ]);

  // Back-pressure: don't let the encoder queue grow unbounded
  if (videoEncoder && (videoEncoder as any).encodeQueueSize > 8) {
    await new Promise<void>((resolve) => {
      const drain = () => {
        if ((videoEncoder as any).encodeQueueSize <= 4) {
          resolve();
        } else {
          requestAnimationFrame(drain);
        }
      };
      requestAnimationFrame(drain);
    });
  }

  // Composite: map canvas + callouts
  compositeFrame(map, compCtx, width, height, freshStore.items, freshStore.itemOrder, clampedTime);

  // Encode frame
  if (videoEncoder) {
    const videoFrame = new VideoFrame(compCanvas, {
      timestamp: frameIndex * (1_000_000 / fps),
      duration: 1_000_000 / fps,
    });
    videoEncoder.encode(videoFrame, { keyFrame: frameIndex % (fps * 2) === 0 });
    videoFrame.close();
  } else if (mediaRecorder) {
    const stream = compCanvas.captureStream(0) as MediaStream;
    const track = stream.getVideoTracks()[0] as any;
    if (track?.requestFrame) track.requestFrame();
  }
}

// ─── Finalize ─────────────────────────────────────────────────────────────────

async function finalizeExport(
  state: Pick<EncoderState, 'videoEncoder' | 'muxer' | 'mediaRecorder' | 'recordedChunks'>,
  onComplete: (blob: Blob) => void,
) {
  const { videoEncoder, muxer, mediaRecorder, recordedChunks } = state;
  if (videoEncoder) {
    await videoEncoder.flush();
    videoEncoder.close();
    muxer.finalize();
    onComplete(new Blob([muxer.target.buffer], { type: 'video/mp4' }));
  } else if (mediaRecorder) {
    mediaRecorder.stop();
    await new Promise<void>((resolve) => { mediaRecorder!.onstop = () => resolve(); });
    onComplete(new Blob(recordedChunks, { type: 'video/webm' }));
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runExport(
  mapRef: React.MutableRefObject<any>,
  options: ExportOptions,
) {
  const { renderConfig, startTime = 0, endTime: requestedEndTime, onProgress, onComplete, onError, abortSignal } = options;
  const [width, height] = renderConfig.resolution;
  const { fps } = renderConfig;

  const store = useProjectStore.getState();
  const { duration } = store;

  const endTime = requestedEndTime !== undefined ? Math.min(requestedEndTime, duration) : duration;
  const effectiveDuration = endTime - startTime;
  const startFrame = Math.floor(startTime * fps);
  const totalFrames = Math.ceil(effectiveDuration * fps);

  const encoderState = await initEncoder(width, height, fps, onError);
  const { compCanvas, compCtx } = encoderState;

  const map = mapRef.current?.getMap?.();
  if (!map) { onError('Map not available'); return; }

  const getRouteCoords = (routeId: string): number[][] | null => {
    const route = store.items[routeId] as RouteItem | undefined;
    if (!route) return null;
    const coords: number[][] = [];
    for (const f of route.geojson.features) {
      if (f.geometry.type === 'LineString') coords.push(...(f.geometry as any).coordinates);
      else if (f.geometry.type === 'MultiLineString') for (const l of (f.geometry as any).coordinates) coords.push(...l);
    }
    return coords.length >= 2 ? coords : null;
  };

  try {
    await withMapResized(map, width, height, async () => {
      // Wait for map ready
      await Promise.race([
        new Promise<void>((resolve) => map.once('idle', resolve)),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
      await document.fonts.ready;

      // Phase 1: pre-warm tile cache
      await prewarmTileCache(map, getRouteCoords, effectiveDuration, startTime, onProgress, abortSignal);

      // Phase 2: capture frames
      for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
        if (abortSignal.aborted) {
          encoderState.videoEncoder?.close();
          encoderState.mediaRecorder?.stop();
          return;
        }

        const currentTime = (startFrame + frameIndex) / fps;
        const clampedTime = Math.min(currentTime, duration);

        await captureFrame(map, compCanvas, compCtx, encoderState, frameIndex, fps, clampedTime, getRouteCoords);
        onProgress(Math.round((frameIndex / totalFrames) * 100), 'capture');
      }

      await finalizeExport(encoderState, onComplete);
    });
  } catch (e: any) {
    onError(e.message || 'Export failed');
  }
}
