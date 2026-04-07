import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { CameraItem, CalloutItem, RouteItem } from '@/store/types';
import { getCameraAtTime } from '@/engine/cameraInterpolation';
import { getAnimatedLine } from '@/engine/lineAnimation';
import { useMapRef } from '@/hooks/useMapRef';
import { computeCalloutAnimation, renderCalloutToCanvas } from './renderCallout';

/**
 * Non-realtime offline export engine.
 * Steps through each frame at 1/fps, renders the map, composites callout DOM
 * via html2canvas, then encodes with WebCodecs + mp4-muxer (or MediaRecorder fallback).
 */

interface ExportOptions {
  resolution: [number, number];
  fps: number;
  startTime?: number;
  endTime?: number;
  disableFading?: boolean;
  onProgress: (pct: number) => void;
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
  recordedChunks: Blob[];
}

async function initEncoder(width: number, height: number, fps: number, onError: (err: string) => void): Promise<EncoderState> {
  const compCanvas = document.createElement('canvas');
  compCanvas.width = width;
  compCanvas.height = height;
  const compCtx = compCanvas.getContext('2d')!;

  let muxer: any = null;
  let videoEncoder: VideoEncoder | null = null;
  let mediaRecorder: MediaRecorder | null = null;
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
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => onError(`VideoEncoder error: ${e.message}`),
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
    const stream = compCanvas.captureStream(0);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.start();
  }

  return { compCanvas, compCtx, muxer, videoEncoder, mediaRecorder, recordedChunks };
}

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

  // Wait for render
  map.triggerRepaint();
  const syncEngine = (map as any)._syncRef?.current;
  if (syncEngine) syncEngine();

  await new Promise<void>((resolve) => {
    if (map.loaded()) resolve();
    else map.once('idle', () => resolve());
  });
  await new Promise(r => setTimeout(r, 16));

  // Composite: map canvas
  const mapCanvas = map.getCanvas() as HTMLCanvasElement;
  compCtx.clearRect(0, 0, width, height);
  compCtx.drawImage(mapCanvas, 0, 0, width, height);

  // Draw callouts via canvas (DOM-free, replaces html2canvas)
  const zoom = map.getZoom();
  for (const id of freshStore.itemOrder) {
    const item = freshStore.items[id];
    if (item?.kind !== 'callout') continue;
    const callout = item as CalloutItem;
    if (callout.lngLat[0] === 0 && callout.lngLat[1] === 0) continue;

    const anim = computeCalloutAnimation(callout, clampedTime);
    if (!anim || anim.opacity <= 0) continue;

    const projected = map.project(callout.lngLat);
    let altitudeOffset = 0;
    if (callout.altitude > 0) {
      const metersPerPixel = 156543.03392 * Math.cos(callout.lngLat[1] * Math.PI / 180) / Math.pow(2, zoom);
      altitudeOffset = Math.min(callout.altitude / metersPerPixel, 300);
    }

    renderCalloutToCanvas(compCtx, callout, anim, { x: projected.x, y: projected.y }, altitudeOffset);
  }

  // Encode
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

export async function runExport(
  mapRef: React.MutableRefObject<any>,
  options: ExportOptions,
) {
  const { resolution, fps, startTime = 0, endTime: requestedEndTime, onProgress, onComplete, onError, abortSignal } = options;
  const [width, height] = resolution;
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

  const mapContainer = map.getContainer();
  const orig = {
    width: mapContainer.style.width, height: mapContainer.style.height,
    position: mapContainer.style.position, left: mapContainer.style.left,
    top: mapContainer.style.top, zIndex: mapContainer.style.zIndex,
  };

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
    mapContainer.style.position = 'fixed';
    mapContainer.style.width = `${width}px`;
    mapContainer.style.height = `${height}px`;
    mapContainer.style.left = '0';
    mapContainer.style.top = '0';
    mapContainer.style.zIndex = '-100';
    map.resize();

    await new Promise(r => setTimeout(r, 500));
    await document.fonts.ready;

    for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
      if (abortSignal.aborted) {
        encoderState.videoEncoder?.close();
        encoderState.mediaRecorder?.stop();
        return;
      }

      const currentTime = (startFrame + frameIndex) / fps;
      const clampedTime = Math.min(currentTime, duration);

      await captureFrame(map, compCanvas, compCtx, encoderState, frameIndex, fps, clampedTime, getRouteCoords);
      onProgress(Math.round((frameIndex / totalFrames) * 100));
    }

    await finalizeExport(encoderState, onComplete);
  } catch (e: any) {
    onError(e.message || 'Export failed');
  } finally {
    mapContainer.style.width = orig.width;
    mapContainer.style.height = orig.height;
    mapContainer.style.position = orig.position;
    mapContainer.style.left = orig.left;
    mapContainer.style.top = orig.top;
    mapContainer.style.zIndex = orig.zIndex;
    map.resize();
  }
}
