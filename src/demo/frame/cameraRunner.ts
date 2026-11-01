import { formatTimelineTime } from '@/components/Timeline/timelineTime';
import { EASING_OPTIONS, normalizeEasing } from '@/components/Inspector/inspectorValues';
import { getAgentMap } from '@/agent/mapRef';
import { MAP_FRAME_MS, moveToCamera } from '@/engine/mapFraming';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import { withoutHistory } from '@/store/history';
import { useProjectStore } from '@/store/useProjectStore';
import type { CameraKeyframe, EasingName, Project } from '@/store/types';
import { TIMING_LABELS } from '@/lib/terms';
import { click, pause, warn, type DemoContext } from './actions';
import { showEdit } from './edits';
import type { FieldTable } from './fields';
import { currentLocators } from './locators';
import { diffLeaves, orderEdits, type DemoStep, type FieldEdit } from './plan';
import { commitStep } from './runners';
import { clickRulerAt, fitSpan } from './timelineActions';

/**
 * The camera step: for each camera view in the file, in time order, the
 * playhead goes to its time on the real timeline, the map eases to the view,
 * the toolbar's Add camera view button takes it, and what the button could not
 * know (the motion, an exact value the map did not land on) is edited in the
 * view's inspector. The final write puts the file's camera track.
 */

const easingLabel = (value: unknown) =>
  EASING_OPTIONS.find((o) => o.value === normalizeEasing(value as EasingName))?.label ?? String(value);

/** The camera view inspector's controls: the exact sliders, then the timing section. */
export const CAMERA_FIELDS: FieldTable<CameraKeyframe> = {
  kind: 'camera-kf',
  fields: {
    'camera.zoom': { section: 'exact', label: 'Zoom', control: 'slider' },
    'camera.pitch': { section: 'exact', label: 'Pitch', control: 'slider' },
    'camera.bearing': { section: 'exact', label: 'Bearing', control: 'slider' },
    time: { section: 'timing', label: TIMING_LABELS.start, control: 'time' },
    easing: {
      section: 'timing',
      label: TIMING_LABELS.motion,
      control: 'select',
      option: easingLabel,
      same: (live, value) => normalizeEasing(live as EasingName) === normalizeEasing(value as EasingName),
    },
  },
};

const CAMERA_FIELD_ORDER = ['camera.zoom', 'camera.pitch', 'camera.bearing', 'time', 'easing'] as const;
/** A slider cannot show less than this; the map lands on a view within it. */
const VIEW_TOLERANCE = 0.05;
/** How long to wait for the map to finish easing, in real ms. */
const EASE_WAIT_MS = MAP_FRAME_MS + 2500;

/** Whether two bearings point the same way (the map reports 270 as -90). */
const sameBearing = (a: number, b: number) => {
  const turn = Math.abs(a - b) % 360;
  return Math.min(turn, 360 - turn) < VIEW_TOLERANCE;
};

/**
 * The edits that turn the view the button made (`live`) into the file's, as far
 * as the inspector can show them: the map lands on the view's centre, zoom,
 * pitch and bearing, so these are mostly the motion, and a time the click on
 * the ruler missed by a pixel.
 */
export function keyframeEdits(live: CameraKeyframe, target: CameraKeyframe): FieldEdit[] {
  const edits = diffLeaves(live, target, ['id', 'camera.center', 'camera.altitude', 'followRoute']).filter((edit) => {
    switch (edit.path) {
      case 'time': return formatTimelineTime(live.time) !== formatTimelineTime(target.time);
      case 'camera.bearing': return !sameBearing(live.camera.bearing, target.camera.bearing);
      case 'camera.zoom': return Math.abs(live.camera.zoom - target.camera.zoom) >= VIEW_TOLERANCE;
      case 'camera.pitch': return Math.abs(live.camera.pitch - target.camera.pitch) >= VIEW_TOLERANCE;
      default: return true;
    }
  });
  return orderEdits(edits, CAMERA_FIELD_ORDER);
}

const cameraTrack = (project: { items: Project['items'] }) => {
  const track = project.items[CAMERA_TRACK_ID];
  return track?.kind === 'camera' ? track : null;
};

/** The file's camera views, earliest first. */
function fileViews(file: Project): CameraKeyframe[] {
  return [...(cameraTrack(file)?.keyframes ?? [])].sort((a, b) => a.time - b.time);
}

/** Eases the map to the view, as the inspector's Go to view does, and waits until it has arrived. */
async function easeMapTo(ctx: DemoContext, view: CameraKeyframe['camera']): Promise<void> {
  const map = getAgentMap();
  if (!map || !moveToCamera(map, view)) return;
  // Easing runs on real time, whatever the speed of the run.
  for (let waited = 0; waited < EASE_WAIT_MS && map.isMoving(); waited += 50) await ctx.clock.realDelay(50);
}

const viewById = (id: string) => cameraTrack(useProjectStore.getState())?.keyframes.find((k) => k.id === id) ?? null;

/** The view the toolbar button just made: the one it selected. */
function selectedView(): CameraKeyframe | null {
  const id = useProjectStore.getState().selectedKeyframeId;
  return id ? viewById(id) : null;
}

/** Adds one camera view the way a person does: playhead, map, button, inspector. Returns the new view's id. */
async function addViewOnScreen(ctx: DemoContext, view: CameraKeyframe): Promise<string | null> {
  const L = currentLocators();
  if (Math.abs(useProjectStore.getState().playheadTime - view.time) > 0.005) {
    await fitSpan(ctx, L, view.time);
    if (!(await clickRulerAt(ctx, L, view.time))) return null;
  }
  await easeMapTo(ctx, view.camera);
  const before = new Set(cameraTrack(useProjectStore.getState())?.keyframes.map((k) => k.id));
  if (!(await click(ctx, L.addCameraViewButton))) return null;
  const made = selectedView();
  if (!made || before.has(made.id)) {
    warn(`camera view at ${view.time}s: the button did not add it`);
    return null;
  }
  await pause(ctx, ctx.timing.betweenSteps * 0.4);
  for (const edit of keyframeEdits(made, view)) {
    ctx.clock.check();
    await showEdit(ctx, CAMERA_FIELDS, edit, () => viewById(made.id), view);
  }
  return made.id;
}

export async function runCamera(ctx: DemoContext, step: Extract<DemoStep, { kind: 'camera' }>, file: Project): Promise<void> {
  const views = fileViews(file);
  const made: (string | null)[] = [];
  for (const view of views) {
    ctx.clock.check();
    made.push(await addViewOnScreen(ctx, view));
  }
  const selected = useProjectStore.getState().selectedKeyframeId;
  commitStep(step, file);
  // The file's views have the file's ids; keep the selection on the same view.
  const index = made.indexOf(selected);
  if (index >= 0) withoutHistory(() => useProjectStore.getState().selectKeyframe(views[index].id));
}
