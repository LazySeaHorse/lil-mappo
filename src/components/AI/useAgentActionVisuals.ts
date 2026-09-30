import { useEffect } from 'react';
import { toast } from 'sonner';
import { agentEvents, getAgentMap, getAgentTools, type AgentEvent } from '@/agent';
import { boundsOfItems, withMinimumSpan } from '@/agent/tools/camera';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { isGestureActive } from '@/store/history';
import type { CameraItem } from '@/store/types';
import { useAiPanelStore } from './useAiPanelStore';

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
export const MAP_EASE_MS = 800;
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

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
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

function followOnMap(job: VisualJob): void {
  if (!useAiPanelStore.getState().followAi) return;
  const s = useProjectStore.getState();
  if (s.isPlaying || s.isExporting || s.isScrubbing || isGestureActive()) return;
  const map = getAgentMap();
  if (!map) return;
  const duration = prefersReducedMotion() ? 0 : MAP_EASE_MS;

  try {
    if (CAMERA_TOOLS.has(job.tool)) {
      const camera = s.items[CAMERA_TRACK_ID] as CameraItem | undefined;
      const kf = camera?.keyframes.find((k) => job.keyframeIds.includes(k.id));
      if (!kf) return;
      map.easeTo({
        center: kf.camera.center as [number, number],
        zoom: kf.camera.zoom,
        pitch: kf.camera.pitch,
        bearing: kf.camera.bearing,
        duration,
      });
      return;
    }
    const ids = job.itemIds.filter((id) => id !== CAMERA_TRACK_ID && s.items[id]);
    if (ids.length === 0) return;
    const [w, so, e, n] = withMinimumSpan(boundsOfItems(ids));
    const rect = map.getContainer().getBoundingClientRect();
    const roomy = rect.height > 560 && rect.width > 480;
    map.fitBounds(
      [[w, so], [e, n]],
      { padding: roomy ? { top: 100, bottom: 220, left: 80, right: 80 } : 48, maxZoom: 16, duration },
    );
  } catch {
    // Items with no map extent (screen-pinned callouts, removed items): nothing to follow.
  }
}

export function useAgentActionVisuals(): void {
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
        followOnMap(job);
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
