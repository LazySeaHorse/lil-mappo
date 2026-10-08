import { z } from 'zod/v4';
import { applyCamera, getProjectCameraAt } from '@/engine/cameraUtils';
import { withTemporaryProjectPlayhead } from '@/services/captureSession';
import { canvasToBlob, withFrameCapturer } from '@/services/frameCapture';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { getAgentMap, getAgentRuntime } from '../mapRef';
import { getState, round } from './shared';

const MAX_FRAMES = 8;
const DEFAULT_WIDTH = 768;
const MAX_WIDTH = 1024;
const JPEG_QUALITY = 0.8;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image data'));
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.readAsDataURL(blob);
  });
}

/** Downscales a captured frame to `width` and encodes it as base64 JPEG. */
async function encodeFrame(source: HTMLCanvasElement, width: number): Promise<{ data: string; width: number; height: number }> {
  const outWidth = Math.min(width, source.width);
  const outHeight = Math.max(1, Math.round((source.height / source.width) * outWidth));
  const out = document.createElement('canvas');
  out.width = outWidth;
  out.height = outHeight;
  const ctx = out.getContext('2d');
  if (!ctx) throw new ToolError('render_failed', 'Could not create a drawing surface for the frame.');
  ctx.drawImage(source, 0, 0, outWidth, outHeight);
  const blob = await canvasToBlob(out, 'image/jpeg', JPEG_QUALITY);
  return { data: await blobToBase64(blob), width: outWidth, height: outHeight };
}

export const renderFrames = defineTool({
  name: 'render_frames',
  title: 'Render frames',
  description:
    `Renders the project at up to ${MAX_FRAMES} moments and returns the pictures so you can check the result. \`times\` are seconds on the project timeline (0 to duration). ` +
    'Each frame is what an export would show at that time (camera, routes, boundaries, callouts), rendered by the live map at the project\'s aspect ratio and downscaled to `width` pixels (default 768, max 1024). ' +
    'Returns one text item (JSON listing the frames: index, time, width, height) followed by one JPEG image per time, in the order requested. ' +
    'Takes a few seconds per frame (map tiles must load). The user\'s playhead is restored afterwards and no undo step is created. Refused while a video export or playback is running, or before the map is ready.',
  input: z.strictObject({
    times: z.array(z.number().min(0).finite()).min(1).max(MAX_FRAMES).describe(`Seconds on the project timeline, 1-${MAX_FRAMES} entries, each within 0..duration.`),
    width: z.number().int().min(160).max(MAX_WIDTH).optional().describe(`Output width in pixels (height follows the project's aspect ratio). Default ${DEFAULT_WIDTH}, max ${MAX_WIDTH}.`),
  }),
  readOnly: true,
  exclusive: true,
  handler: async ({ times, width }) => {
    const s = getState();
    if (s.isExporting) throw new ToolError('export_in_progress', 'A video export is running; frames cannot be rendered until it finishes. Retry later.');
    if (s.isPlaying) throw new ToolError('playback_running', 'Playback is running; pause it before rendering frames.');
    const map = getAgentMap();
    const runtime = getAgentRuntime();
    if (!map || !runtime) {
      throw new ToolError('map_not_ready', 'The map is not ready yet (the editor may still be loading). Retry shortly.');
    }
    const late = times.filter((t) => t > s.duration);
    if (late.length) {
      throw new ToolError('time_out_of_range', `times ${late.join(', ')} are beyond the project duration (${s.duration}s).`, { duration: s.duration });
    }

    const [captureWidth, captureHeight] = s.resolution;
    const outWidth = width ?? DEFAULT_WIDTH;
    const frames: { index: number; time: number; width: number; height: number }[] = [];
    const images: { data: string; mimeType: string }[] = [];

    await withTemporaryProjectPlayhead(() =>
      withFrameCapturer(map, { width: captureWidth, height: captureHeight, overlays: [] }, async ({ zoomOffset, captureNow }) => {
        for (const [index, time] of times.entries()) {
          getState().setPlayheadTime(time);
          // Same stepping as the video exporter: drive the camera, sync layers, wait for tiles.
          const cam = getProjectCameraAt(time);
          if (cam) applyCamera(map, cam, zoomOffset);
          runtime.sync();
          runtime.renderAt(time);
          map.triggerRepaint();
          await runtime.waitUntilRendered();

          const canvas = await captureNow();
          const encoded = await encodeFrame(canvas, outWidth);
          images.push({ data: encoded.data, mimeType: 'image/jpeg' });
          frames.push({ index, time: round(time, 3), width: encoded.width, height: encoded.height });
        }
      }),
    );

    return {
      data: {
        frames,
        note: 'One JPEG image per frame follows, in the same order as `frames`.',
        duration: getState().duration,
      },
      images,
      summary: `Rendered ${frames.length} frame${frames.length === 1 ? '' : 's'} (${times.map((t) => `${round(t, 2)}s`).join(', ')})`,
    };
  },
});
