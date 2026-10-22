import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { agentEvents, getAgentMap, getAgentTools, type AgentEvent } from '@/agent';
import { boundsOfItems } from '@/agent/tools/camera';
import { canMoveCamera, frameBox, frameDuration, type FrameLayout } from '@/engine/mapFraming';
import { useResponsive } from '@/hooks/useResponsive';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { CameraItem } from '@/store/types';
import { useAiPanelStore } from './useAiPanelStore';
import { toViewZoom } from '@/engine/viewOffset';

/**
 * Deterministic "the AI just did something" feedback, driven only by agent
 * events: select what changed, pulse its timeline bar and the matching toolbar
 * button, and (optionally) ease the map to it. No AI involvement, no per-frame
 * work, and it never delays a tool result (everything runs on timers after the
 * event has been emitted).
 */

/** Minimum time each queued visual owns the screen so bursts stay legible. */
export const VISUAL_MIN_MS = 600;
/** When more than this many are waiting, drop everything but the latest. */
export const VISUAL_QUEUE_LIMIT = 5;
const PULSE_MS = 1400;
const ERROR_TOAST_GAP_MS = 4000;

/** Tool name -> data-walkthrough values of the toolbar button to pulse (first one present wins). */
const TOOLBAR_TARGETS: Record<string, string[]> = {
  add_route: ['add-route', 'add-menu'],
  add_boundary: ['add-boundary', 'add-menu'],
  add_callout: ['add-callout', 'add-menu'],
  add_camera_keyframe: ['camera-keyframe', 'add-menu'],
  update_camera_keyframe: ['camera-keyframe', 'add-menu'],
  remove_camera_keyframe: ['camera-keyframe', 'add-menu'],
  frame_items: ['camera-keyframe', 'add-menu'],
  update_project_settings: ['map-settings', 'map-tools'],
};

const CAMERA_TOOLS = new Set(['add_camera_keyframe', 'update_camera_keyframe', 'frame_items']);
/** Write tools with no visual of their own (render_frames drives the map itself). */
const NO_VISUAL_TOOLS = new Set(['render_frames', 'set_playhead']);

interface VisualJob {
  tool: string;
  itemIds: string[];
  keyframeIds: string[];
}

function attr(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/** Restarts the CSS pulse animation on an element. */
function pulse(el: Element | null, className: string): void {
  if (!el) return;
  el.classList.remove(className);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), PULSE_MS);
}

function selectAffected(job: VisualJob): void {
  const s = useProjectStore.getState();
  const wasOpen = s.isInspectorOpen;
  const { keyframeIds, itemIds } = job;
  const kfId = keyframeIds.find((id) =>
    (s.items[CAMERA_TRACK_ID] as CameraItem | undefined)?.keyframes.some((k) => k.id === id),
  );
  if (kfId) {
    s.selectItem(CAMERA_TRACK_ID);
    useProjectStore.getState().selectKeyframe(kfId);
  } else {
    const id = itemIds.find((i) => i !== CAMERA_TRACK_ID && s.items[i]) ?? itemIds.find((i) => s.items[i]);
    if (!id) return;
    s.selectItem(id);
  }
  // Selecting opens the inspector; respect a user who closed it (on mobile it is a full-screen drawer).
  if (!wasOpen) useProjectStore.getState().setIsInspectorOpen(false);
}

function pulseTargets(job: VisualJob): void {
  for (const id of job.itemIds.slice(0, 6)) {
    pulse(document.querySelector(`[data-agent-item="${attr(id)}"]`), 'agent-pulse');
  }
  for (const id of job.keyframeIds.slice(0, 6)) {
    pulse(document.querySelector(`[data-agent-keyframe="${attr(id)}"]`), 'agent-pulse');
  }
  for (const target of TOOLBAR_TARGETS[job.tool] ?? []) {
    const el = document.querySelector(`[data-walkthrough="${target}"]`);
    if (el) {
      pulse(el, 'agent-pulse-ring');
      break;
    }
  }
}

function followOnMap(job: VisualJob, layout: FrameLayout): void {
  if (!useAiPanelStore.getState().followAi) return;
  if (!canMoveCamera()) return;
  const s = useProjectStore.getState();
  const map = getAgentMap();
  if (!map) return;

  try {
    if (CAMERA_TOOLS.has(job.tool)) {
      const camera = s.items[CAMERA_TRACK_ID] as CameraItem | undefined;
      const kf = camera?.keyframes.find((k) => job.keyframeIds.includes(k.id));
      if (!kf) return;
      map.easeTo({
        center: kf.camera.center as [number, number],
        zoom: toViewZoom(kf.camera.zoom),
        pitch: kf.camera.pitch,
        bearing: kf.camera.bearing,
        duration: frameDuration(),
      });
      return;
    }
    const ids = job.itemIds.filter((id) => id !== CAMERA_TRACK_ID && s.items[id]);
    if (ids.length === 0) return;
    frameBox(map, boundsOfItems(ids), layout);
  } catch {
    // Items with no map extent (screen-pinned callouts, removed items): nothing to follow.
  }
}

export function useAgentActionVisuals(): void {
  const { isMobile, isTablet } = useResponsive();
  const layoutRef = useRef<FrameLayout>({ isMobile, isTablet });
  layoutRef.current = { isMobile, isTablet };

  useEffect(() => {
    let writeTools: Set<string> | null = null;
    const isWriteTool = (name: string) => {
      writeTools ??= new Set(getAgentTools().filter((t) => !t.annotations.readOnlyHint).map((t) => t.name));
      return writeTools.has(name);
    };

    const rendering = new Set<string>();
    let queue: VisualJob[] = [];
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastErrorToast = 0;
    let disposed = false;

    const pump = () => {
      if (busy || disposed) return;
      const job = queue.shift();
      if (!job) return;
      busy = true;
      if (rendering.size === 0) {
        selectAffected(job);
        pulseTargets(job);
        followOnMap(job, layoutRef.current);
      }
      timer = setTimeout(() => {
        busy = false;
        timer = null;
        pump();
      }, VISUAL_MIN_MS);
    };

    const enqueue = (job: VisualJob) => {
      if (rendering.size > 0) return;
      if (queue.length >= VISUAL_QUEUE_LIMIT) queue = [];
      queue.push(job);
      // Never inline: the tool result must not wait on DOM work.
      setTimeout(pump, 0);
    };

    const onEvent = (e: AgentEvent) => {
      if (e.tool === 'render_frames') {
        if (e.phase === 'started') rendering.add(e.id);
        else rendering.delete(e.id);
        if (e.phase === 'started') queue = [];
        return;
      }
      if (e.phase === 'failed') {
        if (!isWriteTool(e.tool)) return;
        const now = Date.now();
        if (now - lastErrorToast < ERROR_TOAST_GAP_MS) return;
        lastErrorToast = now;
        toast.error('AI change failed', { description: e.error });
        return;
      }
      if (e.phase !== 'succeeded' || NO_VISUAL_TOOLS.has(e.tool) || !isWriteTool(e.tool)) return;
      const itemIds = e.affectedItemIds ?? [];
      const keyframeIds = e.affectedKeyframeIds ?? [];
      if (itemIds.length === 0 && keyframeIds.length === 0 && !TOOLBAR_TARGETS[e.tool]) return;
      enqueue({ tool: e.tool, itemIds, keyframeIds });
    };

    const off = agentEvents.subscribe(onEvent);
    return () => {
      disposed = true;
      off();
      if (timer) clearTimeout(timer);
      queue = [];
    };
  }, []);
}
