import type { Map as MapboxMap } from 'mapbox-gl';
import type { MapRef } from 'react-map-gl/mapbox';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { CameraItem, RouteItem } from '@/store/types';
import { getCameraAtTime } from '@/engine/cameraInterpolation';
import { applyCamera, getRouteCoords, getRoutes } from '@/engine/cameraUtils';
import { compositeFrame, withMapResized } from './mapCapture';
import type { RenderConfig } from '@/types/render';
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';

/**
 * Non-realtime offline export engine.
 * Steps through each frame at 1/fps, renders the map, composites callouts via
 * canvas 2D, then encodes with WebCodecs (H.264) + Mediabunny.
 *
 * Requires WebCodecs (Chrome 94+). If H.264 init fails, onError is called with
 * a clear message instead of silently producing a broken WebM file.
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
  abortSignal: AbortSignal;
  showWatermark: boolean;
}

interface EncoderState {
  compCanvas: HTMLCanvasElement;
  compCtx: CanvasRenderingContext2D;
  output: Output<Mp4OutputFormat, BufferTarget>;
  videoSource: EncodedVideoPacketSource;
  videoEncoder: VideoEncoder;
  waitForMuxer: () => Promise<void>;
  getEncoderError: () => Error | null;
}

export type LocalExportCapability =
  | { status: 'ready'; codec: string }
  | { status: 'limited' }
  | { status: 'unsupported' };

// ─── Codec level probe ────────────────────────────────────────────────────────

// Probes H.264 profiles (High → Main → Baseline) in descending quality order.
// Covers all three profile tiers because hardware encoders frequently support
// Baseline/Main even when they reject High Profile. The previous probe used only
// High Profile (0x64) strings — hardware that only handles Baseline would cause
// all probes to return false, triggering the false-negative fallback with the
// worst possible codec (Level 5.2), which would then throw and silently fall
// back to MediaRecorder.
//
// False-negative fallback: if isConfigSupported() reports nothing as supported
// (known browser bug on some setups), try Baseline Level 3.0 — the most
// universally supported H.264 codec. initEncoder still wraps configure() in a
// try/catch and surfaces a clear error if it throws.
async function selectH264Codec(width: number, height: number, fps: number): Promise<string> {
  const candidates = [
    'avc1.640034', // High Profile Level 5.2 — 4K@60
    'avc1.640033', // High Profile Level 5.1 — 4K@30
    'avc1.64002A', // High Profile Level 4.2 — 1080@60
    'avc1.640028', // High Profile Level 4.0 — 1080@30
    'avc1.4D002A', // Main Profile Level 4.2
    'avc1.4D0028', // Main Profile Level 4.0
    'avc1.42E028', // Baseline Level 4.0
    'avc1.42E01F', // Baseline Level 3.1
    'avc1.42E01E', // Baseline Level 3.0 — most universally supported
  ];
  for (const codec of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 8_000_000, framerate: fps });
      if (supported) return codec;
    } catch {
      // isConfigSupported itself can throw on some browsers — skip this candidate
    }
  }
  return 'avc1.42E01E'; // false-negative fallback
}

/**
 * Checks whether the browser reports support for local H.264 export at a
 * particular output size and frame rate. A negative codec probe is reported
 * as "limited", rather than "unsupported", because some browsers are known
 * to return false negatives from isConfigSupported().
 */
export async function getLocalExportCapability(
  width: number,
  height: number,
  fps: number,
): Promise<LocalExportCapability> {
  if (typeof VideoEncoder === 'undefined') return { status: 'unsupported' };

  const candidates = [
    'avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.640028',
    'avc1.4D002A', 'avc1.4D0028', 'avc1.42E028', 'avc1.42E01F', 'avc1.42E01E',
  ];

  for (const codec of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec, width, height, bitrate: 8_000_000, framerate: fps,
      });
      if (supported) return { status: 'ready', codec };
    } catch {
      // Try the next H.264 profile; some implementations throw for profiles
      // they do not recognise.
    }
  }

  return { status: 'limited' };
}

// ─── Encoder init ─────────────────────────────────────────────────────────────

// Throws if H.264 encoding is unavailable. Callers should surface the error
// directly rather than silently degrading to a broken fallback format.
async function initEncoder(
  width: number,
  height: number,
  fps: number,
): Promise<EncoderState> {
  const compCanvas = document.createElement('canvas');
  compCanvas.width = width;
  compCanvas.height = height;
  const compCtx = compCanvas.getContext('2d')!;

  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs (VideoEncoder) is not available in this browser. Use Chrome 94+ or Edge 94+ to export video.');
  }

  const codec = await selectH264Codec(width, height, fps);
  const output = new Output({
    target: new BufferTarget(),
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  });
  const videoSource = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource, { frameRate: fps });
  await output.start();

  let videoEncoder: VideoEncoder;
  let encoderError: Error | null = null;
  let packetWriteChain = Promise.resolve();
  try {
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        packetWriteChain = packetWriteChain.then(async () => {
          if (encoderError) return;

          try {
            await videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            encoderError = new Error(`MP4 muxer error: ${message}`);
          }
        });
      },
      error: (e: Error) => {
        encoderError = new Error(`VideoEncoder error: ${e.message}`);
      },
    });
    videoEncoder.configure({ codec, width, height, bitrate: 8_000_000, framerate: fps });
  } catch (e: unknown) {
    await output.cancel();
    console.error('[videoExport] VideoEncoder.configure() failed:', e);
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(
      `H.264 encoding failed on this device (codec: ${codec}). ` +
      `Your browser supports WebCodecs but rejected the encoder config. ` +
      `Try a lower resolution or use a different browser. Details: ${message}`
    );
  }

  return {
    compCanvas,
    compCtx,
    output,
    videoSource,
    videoEncoder,
    waitForMuxer: () => packetWriteChain,
    getEncoderError: () => encoderError,
  };
}

// ─── Tile cache pre-warm ───────────────────────────────────────────────────────

async function prewarmTileCache(
  map: MapboxMap,
  getRouteCoords: (id: string) => number[][] | null,
  getRoutes: () => RouteItem[],
  totalDuration: number,
  startTime: number,
  onProgress: (pct: number, phase: 'prewarm' | 'capture') => void,
  abortSignal: AbortSignal,
  zoomOffset: number,
) {
  const STEPS = 24;
  const freshStore = useProjectStore.getState();
  const camItem = freshStore.items[CAMERA_TRACK_ID] as CameraItem | undefined;

  for (let i = 0; i < STEPS; i++) {
    if (abortSignal.aborted) return;

    const t = startTime + (totalDuration / (STEPS - 1)) * i;
    const clampedT = Math.min(t, freshStore.duration);

    if (camItem) {
      const cam = getCameraAtTime(camItem.keyframes, clampedT, getRouteCoords, getRoutes());
      if (cam) applyCamera(map, cam, zoomOffset);
    }

    // Wait for map to settle, max 2s
    await Promise.race([
      new Promise<void>((resolve) => map.once('idle', () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);

    onProgress(Math.round(((i + 1) / STEPS) * 100), 'prewarm');
  }

  // Reset to start position
  if (camItem) {
    const cam = getCameraAtTime(camItem.keyframes, startTime, getRouteCoords, getRoutes());
    if (cam) applyCamera(map, cam, zoomOffset);
  }
}

// ─── Single frame capture ─────────────────────────────────────────────────────

async function captureFrame(
  map: MapboxMap,
  compCanvas: HTMLCanvasElement,
  compCtx: CanvasRenderingContext2D,
  encoder: Pick<EncoderState, 'videoEncoder' | 'waitForMuxer'>,
  frameIndex: number,
  fps: number,
  clampedTime: number,
  getRouteCoords: (id: string) => number[][] | null,
  getRoutes: () => RouteItem[],
  showWatermark: boolean,
  zoomOffset: number,
) {
  const { videoEncoder } = encoder;
  const [width, height] = [compCanvas.width, compCanvas.height];

  // Set playhead
  useProjectStore.getState().setPlayheadTime(clampedTime);

  // Drive camera
  const freshStore = useProjectStore.getState();
  const camItem = freshStore.items[CAMERA_TRACK_ID] as CameraItem | undefined;
  if (camItem) {
    const cam = getCameraAtTime(camItem.keyframes, clampedTime, getRouteCoords, getRoutes());
    if (cam) applyCamera(map, cam, zoomOffset);
  }

  // Sync map engine and trigger repaint
  const syncEngine = (map as unknown as { _syncRef?: { current?: () => void } })._syncRef?.current;
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
  if (videoEncoder.encodeQueueSize > 8) {
    await new Promise<void>((resolve) => {
      const drain = () => {
        if (videoEncoder.encodeQueueSize <= 4) {
          resolve();
        } else {
          requestAnimationFrame(drain);
        }
      };
      requestAnimationFrame(drain);
    });
  }

  // Mediabunny's packet source is asynchronous. Waiting for the previous
  // packet here preserves packet order and propagates muxer back-pressure
  // before another frame is submitted to WebCodecs.
  await encoder.waitForMuxer();

  // Composite: map canvas + callouts
  compositeFrame(map, compCtx, width, height, freshStore.items, freshStore.itemOrder, clampedTime, showWatermark);

  const frameDuration = Math.round(1_000_000 / fps);
  const videoFrame = new VideoFrame(compCanvas, {
    timestamp: frameIndex * frameDuration,
    duration: frameDuration,
  });
  videoEncoder.encode(videoFrame, { keyFrame: frameIndex % (fps * 2) === 0 });
  videoFrame.close();
}

// ─── Finalize ─────────────────────────────────────────────────────────────────

async function finalizeExport(
  state: Pick<EncoderState, 'videoEncoder' | 'output' | 'videoSource' | 'waitForMuxer' | 'getEncoderError'>,
): Promise<Blob> {
  const { videoEncoder, output, videoSource } = state;
  await videoEncoder.flush();
  await state.waitForMuxer();
  const encoderError = state.getEncoderError();
  if (encoderError) throw encoderError;

  videoSource.close();
  videoEncoder.close();
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('MP4 muxer finalized without producing output');
  return new Blob([buffer], { type: 'video/mp4' });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runExport(
  mapRef: React.MutableRefObject<MapRef | null>,
  options: ExportOptions,
): Promise<Blob> {
  const { renderConfig, startTime = 0, endTime: requestedEndTime, onProgress, abortSignal } = options;
  const [width, height] = renderConfig.resolution;
  const { fps } = renderConfig;

  const store = useProjectStore.getState();
  const { duration } = store;

  const endTime = requestedEndTime !== undefined ? Math.min(requestedEndTime, duration) : duration;
  const effectiveDuration = endTime - startTime;
  const startFrame = Math.floor(startTime * fps);
  const totalFrames = Math.ceil(effectiveDuration * fps);

  const encoderState = await initEncoder(width, height, fps);
  const { compCanvas, compCtx } = encoderState;

  const map = mapRef.current?.getMap?.();
  if (!map) {
    encoderState.videoEncoder.close();
    await encoderState.output.cancel();
    throw new Error('Map not available');
  }

  // Zoom offset: compensates for the viewport size change during export so the
  // rendered framing matches what was designed at preview resolution.
  // log2(renderWidth / previewWidth) — positive when rendering larger than preview.
  const previewWidth = map.getContainer().getBoundingClientRect().width;
  const zoomOffset = Math.log2(width / previewWidth);

  try {
    return await withMapResized(map, width, height, async () => {
      // Wait for map ready
      await Promise.race([
        new Promise<void>((resolve) => map.once('idle', () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
      await document.fonts.ready;

      // Phase 1: pre-warm tile cache
      await prewarmTileCache(map, getRouteCoords, getRoutes, effectiveDuration, startTime, onProgress, abortSignal, zoomOffset);
      if (abortSignal.aborted) throw new DOMException('Export cancelled', 'AbortError');

      // Phase 2: capture frames
      for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
        if (abortSignal.aborted) {
          throw new DOMException('Export cancelled', 'AbortError');
        }

        const currentTime = (startFrame + frameIndex) / fps;
        const clampedTime = Math.min(currentTime, duration);

        await captureFrame(map, compCanvas, compCtx, encoderState, frameIndex, fps, clampedTime, getRouteCoords, getRoutes, options.showWatermark, zoomOffset);
        const encoderError = encoderState.getEncoderError();
        if (encoderError) throw encoderError;
        onProgress(Math.round((frameIndex / totalFrames) * 100), 'capture');
      }

      return finalizeExport(encoderState);
    });
  } finally {
    if (encoderState.videoEncoder.state !== 'closed') {
      encoderState.videoEncoder.close();
    }
    if (encoderState.output.state === 'pending' || encoderState.output.state === 'started') {
      await encoderState.output.cancel();
    }
  }
}
