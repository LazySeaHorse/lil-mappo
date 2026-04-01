import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { CameraItem, RouteItem, CalloutItem, BoundaryItem } from '@/store/types';
import { getCameraAtTime } from '@/engine/cameraInterpolation';
import { getAnimatedLine } from '@/engine/lineAnimation';
import { applyEasing } from '@/engine/easings';
import { useMapRef } from '@/hooks/useMapRef';

/**
 * Non-realtime offline export engine.
 * Steps through each frame at 1/fps, renders the map, composites callout DOM
 * via html2canvas, then encodes with WebCodecs + mp4-muxer (or MediaRecorder fallback).
 */

interface ExportOptions {
  resolution: [number, number];
  fps: number;
  onProgress: (pct: number) => void;
  onComplete: (blob: Blob) => void;
  onError: (err: string) => void;
  abortSignal: AbortSignal;
}

export async function runExport(
  mapRef: React.MutableRefObject<any>,
  options: ExportOptions,
) {
  const { resolution, fps, onProgress, onComplete, onError, abortSignal } = options;
  const [width, height] = resolution;
  const store = useProjectStore.getState();
  const { duration } = store;
  const totalFrames = Math.ceil(duration * fps);

  // We'll use MediaRecorder on a canvas captureStream — reliable cross-browser
  const compCanvas = document.createElement('canvas');
  compCanvas.width = width;
  compCanvas.height = height;
  const compCtx = compCanvas.getContext('2d')!;

  // Try WebCodecs + mp4-muxer first for true MP4 output
  const useWebCodecs = typeof VideoEncoder !== 'undefined';

  let muxer: any = null;
  let videoEncoder: VideoEncoder | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];

  if (useWebCodecs) {
    try {
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
      const target = new ArrayBufferTarget();
      muxer = new Muxer({
        target,
        video: {
          codec: 'avc',
          width,
          height,
        },
        fastStart: 'in-memory',
      });

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (e) => {
          onError(`VideoEncoder error: ${e.message}`);
        },
      });

      videoEncoder.configure({
        codec: 'avc1.640028',
        width,
        height,
        bitrate: 8_000_000,
        framerate: fps,
      });
    } catch (e) {
      // Fallback to MediaRecorder
      videoEncoder = null;
      muxer = null;
    }
  }

  if (!videoEncoder) {
    // MediaRecorder fallback
    const stream = compCanvas.captureStream(0);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.start();
  }

  const map = mapRef.current?.getMap?.();
  if (!map) {
    onError('Map not available');
    return;
  }

  // Helper: get route coords for camera follow-route
  const getRouteCoords = (routeId: string) => {
    const route = store.items[routeId] as RouteItem | undefined;
    if (!route) return null;
    const coords: number[][] = [];
    for (const f of route.geojson.features) {
      if (f.geometry.type === 'LineString') coords.push(...(f.geometry as any).coordinates);
      else if (f.geometry.type === 'MultiLineString') for (const l of (f.geometry as any).coordinates) coords.push(...l);
    }
    return coords.length >= 2 ? coords : null;
  };

  // Frame-by-frame rendering
  for (let frame = 0; frame <= totalFrames; frame++) {
    if (abortSignal.aborted) {
      videoEncoder?.close();
      mediaRecorder?.stop();
      return;
    }

    const currentTime = (frame / fps);
    const clampedTime = Math.min(currentTime, duration);

    // Set playhead (this triggers state updates in the store for route/boundary rendering)
    useProjectStore.getState().setPlayheadTime(clampedTime);

    // Drive camera
    const freshStore = useProjectStore.getState();
    const camItem = freshStore.items[CAMERA_TRACK_ID] as CameraItem | undefined;
    if (camItem && camItem.keyframes.length > 0) {
      const cam = getCameraAtTime(camItem.keyframes, clampedTime, getRouteCoords);
      if (cam) {
        map.jumpTo({
          center: cam.center,
          zoom: cam.zoom,
          pitch: cam.pitch,
          bearing: cam.bearing,
        });
      }
    }

    // Wait for map to render
    map.triggerRepaint();
    await new Promise<void>((resolve) => {
      map.once('render', () => resolve());
    });
    // Small additional delay for tiles
    await new Promise(r => setTimeout(r, 50));

    // Draw map canvas onto comp canvas
    const mapCanvas = map.getCanvas() as HTMLCanvasElement;
    compCtx.clearRect(0, 0, width, height);
    compCtx.drawImage(mapCanvas, 0, 0, width, height);

    // Try to capture callout DOM overlay via html2canvas
    try {
      const calloutContainer = document.querySelector('.mapboxgl-map .mapboxgl-marker');
      if (calloutContainer) {
        // We'll use html2canvas to render all markers
        const markersContainer = document.querySelector('.mapboxgl-canvas-container');
        if (markersContainer?.parentElement) {
          const html2canvas = (await import('html2canvas')).default;
          const overlayCanvas = await html2canvas(markersContainer.parentElement as HTMLElement, {
            backgroundColor: null,
            width: mapCanvas.width,
            height: mapCanvas.height,
            scale: 1,
            logging: false,
            useCORS: true,
          });
          compCtx.drawImage(overlayCanvas, 0, 0, width, height);
        }
      }
    } catch {
      // Callout overlay failed, just export map canvas
    }

    // Encode frame
    if (videoEncoder) {
      const videoFrame = new VideoFrame(compCanvas, {
        timestamp: frame * (1_000_000 / fps), // microseconds
        duration: 1_000_000 / fps,
      });
      videoEncoder.encode(videoFrame, { keyFrame: frame % (fps * 2) === 0 });
      videoFrame.close();
    } else if (mediaRecorder) {
      // For MediaRecorder, we need to manually request a frame from captureStream
      const stream = compCanvas.captureStream(0) as MediaStream;
      const track = stream.getVideoTracks()[0] as any;
      if (track?.requestFrame) {
        track.requestFrame();
      }
    }

    onProgress(Math.round((frame / totalFrames) * 100));
  }

  // Finalize
  if (videoEncoder) {
    await videoEncoder.flush();
    videoEncoder.close();
    muxer.finalize();
    const buffer = muxer.target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    onComplete(blob);
  } else if (mediaRecorder) {
    mediaRecorder.stop();
    await new Promise<void>((resolve) => {
      mediaRecorder!.onstop = () => resolve();
    });
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    onComplete(blob);
  }
}
