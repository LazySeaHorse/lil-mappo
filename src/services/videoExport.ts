import type { Map as MapboxMap } from 'mapbox-gl';
import type { MapSceneRuntime } from '@/components/MapViewport/runtime/MapSceneRuntime';
import type { MapSceneRuntimeRef } from '@/hooks/useMapRuntime';
import { useProjectStore } from '@/store/useProjectStore';
import { applyCamera, getProjectCameraAt, loadProjectTerrain } from '@/engine/cameraUtils';
import { mapContainerSize } from '@/engine/mapFraming';
import { stepToTime } from './frameCapture';
import { preloadOverlayAssets, resolveSystemOverlays, type Branding, type OverlayLayer } from '@/overlays';
import { compositeFrame, withTemporaryMapViewport } from './mapCapture';
import { loadAnnotationAssets } from '@/annotations/draw';
import type { RenderConfig } from '@/types/render';
import {
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  type Target,
} from 'mediabunny';
import { createVideoExportTarget, type VideoExportTarget } from './videoExportTarget';
import { waitForMapIdle } from '@/components/MapViewport/runtime/mapWait';
import { withTemporaryProjectPlayhead } from './captureSession';
import { errorMessage } from '@/lib/utils';
import { exportBitrate } from './videoBitrate';

/**
 * Non-realtime offline export engine.
 * Steps through each frame at 1/fps, renders the map, composites callouts via
 * canvas 2D, then encodes with WebCodecs (H.264) + Mediabunny.
 *
 * Requires WebCodecs (Chrome 94+). If H.264 init fails, the export rejects with
 * a clear message.
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
  branding: Branding;
}

interface EncoderState {
  compCanvas: HTMLCanvasElement;
  compCtx: CanvasRenderingContext2D;
  output: Output<Mp4OutputFormat, Target>;
  exportTarget: VideoExportTarget;
  videoSource: EncodedVideoPacketSource;
  videoEncoder: VideoEncoder;
  /** Each frame's quantizer when the encoder runs in quantizer mode. */
  quantizer?: number;
  waitForMuxer: () => Promise<void>;
  getEncoderError: () => Error | null;
}

function describeMuxerError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'Browser storage ran out of space while writing the video. Free some disk space and try again.';
  }
  return errorMessage(error);
}

// ─── Codec level probe ────────────────────────────────────────────────────────

// Probes H.264 profiles (High → Main → Baseline) in descending quality order.
// Covers all three profile tiers because hardware encoders frequently support
// Baseline/Main even when they reject High Profile.
//
// False-negative fallback: if isConfigSupported() reports nothing as supported
// (known browser bug on some setups), try Baseline Level 3.0 — the most
// universally supported H.264 codec. initEncoder still wraps configure() in a
// try/catch and surfaces a clear error if it throws.
async function selectH264Codec(width: number, height: number, fps: number): Promise<string> {
  const bitrate = exportBitrate(width, height, fps);
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
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
      if (supported) return codec;
    } catch {
      // isConfigSupported itself can throw on some browsers — skip this candidate
    }
  }
  return 'avc1.42E01E'; // false-negative fallback
}

// ─── Rate control ─────────────────────────────────────────────────────────────

/**
 * H.264 quantizer (0 best … 51 worst) for every frame in quantizer mode. 22 keeps
 * imagery and labels clean in pans without the file sizes of near-lossless.
 */
const EXPORT_QUANTIZER = 22;

interface RateControl {
  bitrateMode: VideoEncoderBitrateMode;
  /** Set in quantizer mode, where each frame is encoded at this quality. */
  quantizer?: number;
}

async function isEncoderConfigSupported(config: VideoEncoderConfig): Promise<boolean> {
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported === true;
  } catch {
    return false; // isConfigSupported itself can throw on some browsers
  }
}

// Best first. Hardware encoders treat a bitrate, variable or constant, as a
// ceiling and spend far less on map footage (a 4K60 export came out at 16 Mb/s
// of 75 either way), which shows as blocking in pans over imagery and labels.
// A fixed quantizer makes every frame meet one quality. Variable comes last
// whatever the probe says: it is what every encoder has always accepted.
async function rateControlCandidates(config: VideoEncoderConfig): Promise<RateControl[]> {
  const candidates: RateControl[] = [];
  if (await isEncoderConfigSupported({ ...config, bitrateMode: 'quantizer' })) {
    candidates.push({ bitrateMode: 'quantizer', quantizer: EXPORT_QUANTIZER });
  }
  if (await isEncoderConfigSupported({ ...config, bitrateMode: 'constant' })) candidates.push({ bitrateMode: 'constant' });
  candidates.push({ bitrateMode: 'variable' });
  return candidates;
}

/**
 * An encoder configured and confirmed working. Configuring is asynchronous: an
 * encoder that cannot start with the config (some report support and then fail)
 * says so through `error` and fails the flush, so that is awaited before use.
 * Errors after that go to `onError`.
 */
async function openEncoder(
  config: VideoEncoderConfig,
  output: EncodedVideoChunkOutputCallback,
  onError: (error: Error) => void,
): Promise<VideoEncoder> {
  const start: { ready: boolean; error: unknown } = { ready: false, error: null };
  const encoder = new VideoEncoder({
    output,
    error: (e: Error) => {
      if (start.ready) onError(e);
      else start.error ??= e;
    },
  });
  try {
    encoder.configure(config);
    await encoder.flush();
  } catch (e: unknown) {
    start.error ??= e;
  }
  if (start.error) {
    if (encoder.state !== 'closed') encoder.close();
    throw start.error;
  }
  start.ready = true;
  return encoder;
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

/**
 * Abandons an unfinished output: cancels it if it is still open and deletes whatever it
 * wrote. A failing cancel is logged rather than thrown so the error that ended the export
 * is the one the caller sees.
 */
async function cancelAndDiscard(output: Output, exportTarget: VideoExportTarget): Promise<void> {
  try {
    if (output.state === 'pending' || output.state === 'started') await output.cancel();
  } catch (error) {
    console.warn('[videoExport] cancelling the output failed:', error);
  } finally {
    await exportTarget.discard();
  }
}

// ─── Encoder init ─────────────────────────────────────────────────────────────

// Throws if H.264 encoding is unavailable. Callers should surface the error
// directly rather than silently degrading to a broken fallback format.
async function initEncoder(
  width: number,
  height: number,
  fps: number,
  maximumPacketCount: number,
): Promise<EncoderState> {
  const compCanvas = document.createElement('canvas');
  compCanvas.width = width;
  compCanvas.height = height;
  const compCtx = compCanvas.getContext('2d')!;

  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs (VideoEncoder) is not available in this browser. Use Chrome 94+ or Edge 94+ to export video.');
  }

  const codec = await selectH264Codec(width, height, fps);
  const encoderConfig: VideoEncoderConfig = {
    codec, width, height, bitrate: exportBitrate(width, height, fps), framerate: fps, latencyMode: 'quality',
  };
  const rateControls = await rateControlCandidates(encoderConfig);
  const exportTarget = await createVideoExportTarget();
  const output = new Output({
    target: exportTarget.target,
    // Reserve the MP4 metadata area up front. Unlike `in-memory`, this writes
    // encoded packets continuously and still produces a conventional fast-start
    // MP4. The exporter knows its exact maximum frame count in advance.
    format: new Mp4OutputFormat({ fastStart: 'reserve' }),
  });
  const videoSource = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource, { frameRate: fps, maximumPacketCount });
  try {
    await output.start();
  } catch (error) {
    await cancelAndDiscard(output, exportTarget);
    throw error;
  }

  let encoderError: Error | null = null;
  let packetWriteChain = Promise.resolve();
  const writePacket: EncodedVideoChunkOutputCallback = (chunk, meta) => {
    packetWriteChain = packetWriteChain.then(async () => {
      if (encoderError) return;

      try {
        await videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta);
      } catch (error: unknown) {
        encoderError = new Error(`MP4 muxer error: ${describeMuxerError(error)}`);
      }
    });
  };
  const failEncoder = (e: Error) => {
    encoderError = new Error(`VideoEncoder error: ${e.message}`);
  };

  // The best rate control that really starts, falling back on encoders that claim more than they do.
  let videoEncoder: VideoEncoder | null = null;
  let rateControl: RateControl = rateControls[rateControls.length - 1];
  let startError: unknown = null;
  for (const candidate of rateControls) {
    try {
      videoEncoder = await openEncoder({ ...encoderConfig, bitrateMode: candidate.bitrateMode }, writePacket, failEncoder);
      rateControl = candidate;
      break;
    } catch (e: unknown) {
      startError = e;
      console.warn(`[videoExport] the encoder did not start with bitrateMode ${candidate.bitrateMode}:`, e);
    }
  }
  if (!videoEncoder) {
    await cancelAndDiscard(output, exportTarget);
    console.error('[videoExport] VideoEncoder.configure() failed:', startError);
    const message = errorMessage(startError);
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
    exportTarget,
    videoSource,
    videoEncoder,
    quantizer: rateControl.quantizer,
    waitForMuxer: () => packetWriteChain,
    getEncoderError: () => encoderError,
  };
}

// ─── Tile cache pre-warm ───────────────────────────────────────────────────────

async function prewarmTileCache(
  map: MapboxMap,
  totalDuration: number,
  startTime: number,
  onProgress: (pct: number, phase: 'prewarm' | 'capture') => void,
  abortSignal: AbortSignal,
  zoomOffset: number,
) {
  const STEPS = 24;
  const freshStore = useProjectStore.getState();

  for (let i = 0; i < STEPS; i++) {
    if (abortSignal.aborted) return;

    const t = startTime + (totalDuration / (STEPS - 1)) * i;
    const clampedT = Math.min(t, freshStore.duration);

    const cam = getProjectCameraAt(clampedT);
    if (cam) applyCamera(map, cam, zoomOffset);

    // Wait for map to settle, max 2s.
    await waitForMapIdle(map, {
      timeoutMs: 2_000,
      signal: abortSignal,
      waitForAnimationFrame: false,
    });

    onProgress(Math.round(((i + 1) / STEPS) * 100), 'prewarm');
  }

  // Reset to start position
  const start = getProjectCameraAt(startTime);
  if (start) applyCamera(map, start, zoomOffset);
}

// ─── Single frame capture ─────────────────────────────────────────────────────

interface CaptureFrameOptions {
  runtime: MapSceneRuntime;
  map: MapboxMap;
  encoder: Pick<EncoderState, 'compCanvas' | 'compCtx' | 'videoEncoder' | 'quantizer' | 'waitForMuxer'>;
  frameIndex: number;
  fps: number;
  time: number;
  overlays: OverlayLayer[];
  zoomOffset: number;
}

async function captureFrame({ runtime, map, encoder, frameIndex, fps, time, overlays, zoomOffset }: CaptureFrameOptions) {
  const { videoEncoder, compCanvas, compCtx } = encoder;
  const [width, height] = [compCanvas.width, compCanvas.height];

  // runExport syncs the runtime once before the loop; each frame only redraws the scene.
  await stepToTime(runtime, map, time, zoomOffset, { sync: false });

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
  const { items, itemOrder } = useProjectStore.getState();
  compositeFrame(map, compCtx, width, height, items, itemOrder, time, overlays, zoomOffset);

  const frameDuration = Math.round(1_000_000 / fps);
  const videoFrame = new VideoFrame(compCanvas, {
    timestamp: frameIndex * frameDuration,
    duration: frameDuration,
  });
  videoEncoder.encode(videoFrame, {
    keyFrame: frameIndex % (fps * 2) === 0,
    ...(encoder.quantizer !== undefined ? { avc: { quantizer: encoder.quantizer } } : {}),
  });
  videoFrame.close();
}

// ─── Finalize ─────────────────────────────────────────────────────────────────

async function finalizeExport(
  state: Pick<EncoderState, 'videoEncoder' | 'output' | 'exportTarget' | 'videoSource' | 'waitForMuxer' | 'getEncoderError'>,
): Promise<Blob> {
  const { videoEncoder, output, videoSource } = state;
  await videoEncoder.flush();
  await state.waitForMuxer();
  const encoderError = state.getEncoderError();
  if (encoderError) throw encoderError;

  videoSource.close();
  videoEncoder.close();
  await output.finalize();
  return state.exportTarget.getBlob();
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runExport(
  runtimeRef: MapSceneRuntimeRef,
  options: ExportOptions,
): Promise<Blob> {
  const { renderConfig, startTime = 0, endTime: requestedEndTime, onProgress, abortSignal } = options;
  const overlays = resolveSystemOverlays({ mode: 'export', branding: options.branding });
  await preloadOverlayAssets();
  const [width, height] = renderConfig.resolution;
  const { fps } = renderConfig;

  const store = useProjectStore.getState();
  const { duration } = store;

  const endTime = requestedEndTime !== undefined ? Math.min(requestedEndTime, duration) : duration;
  const effectiveDuration = endTime - startTime;
  const startFrame = Math.floor(startTime * fps);
  const totalFrames = Math.ceil(effectiveDuration * fps);

  // The inclusive loop below submits totalFrames + 1 frames. WebCodecs emits
  // one encoded video packet per submitted frame, which gives the MP4 muxer an
  // exact upper bound for its reserved metadata area.
  const maximumPacketCount = totalFrames + 1;

  const runtime = runtimeRef.current;
  if (!runtime) throw new Error('Map runtime not available');
  const map = runtime.getMap();

  // Zoom offset: compensates for the viewport size change during export so the
  // rendered framing matches what was designed at preview resolution.
  // log2(renderWidth / previewWidth) — positive when rendering larger than preview.
  const previewWidth = mapContainerSize(map).width;
  const zoomOffset = Math.log2(width / previewWidth);

  const encoderState = await initEncoder(width, height, fps, maximumPacketCount);
  let completed = false;

  try {
    return await withTemporaryMapViewport(map, width, height, () => (
      withTemporaryProjectPlayhead(async () => {
        // Wait for map ready
        await waitForMapIdle(map, { timeoutMs: 3_000, signal: abortSignal });
        await document.fonts.ready;
        const { items: annotationItems, itemOrder: annotationOrder } = useProjectStore.getState();
        await loadAnnotationAssets(annotationItems, annotationOrder);

        // The auto-camera plans its heights over downloaded terrain; every frame must see the same plan.
        await loadProjectTerrain();

        // Phase 1: pre-warm tile cache
        await prewarmTileCache(map, effectiveDuration, startTime, onProgress, abortSignal, zoomOffset);
        if (abortSignal.aborted) throw new DOMException('Export cancelled', 'AbortError');

        // Reconcile basemap and renderers once; frames below only redraw the scene.
        runtime.sync();

        // Phase 2: capture frames
        for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
          if (abortSignal.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }

          const currentTime = (startFrame + frameIndex) / fps;
          const clampedTime = Math.min(currentTime, duration);

          await captureFrame({ runtime, map, encoder: encoderState, frameIndex, fps, time: clampedTime, overlays, zoomOffset });
          const encoderError = encoderState.getEncoderError();
          if (encoderError) throw encoderError;
          onProgress(Math.round((frameIndex / totalFrames) * 100), 'capture');
        }

        const result = await finalizeExport(encoderState);
        completed = true;
        return result;
      })
    ));
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error(describeMuxerError(error));
    }
    throw error;
  } finally {
    if (!completed) {
      if (encoderState.videoEncoder.state !== 'closed') encoderState.videoEncoder.close();
      await cancelAndDiscard(encoderState.output, encoderState.exportTarget);
    }
  }
}
