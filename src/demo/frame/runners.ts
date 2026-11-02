import { pickProject } from '@/store/projectDocument';
import { useProjectStore } from '@/store/useProjectStore';
import { withoutHistory } from '@/store/history';
import type { BoundaryItem, Project } from '@/store/types';
import { getMapStyleDef } from '@/config/mapbox';
import { click, find, key, pause, query, type, warn, type DemoContext } from './actions';
import { BOUNDARY_FIELDS, PROJECT_FIELDS } from './fields';
import { openSection, showEdit } from './edits';
import { runCallout } from './calloutRunner';
import { runModel } from './modelRunner';
import { currentLocators, type Locators } from './locators';
import { mockBoundarySearch } from './mocks';
import { closeInspectorDrawer, showAddBar, showMainBar } from './phone';
import { runRoute } from './routeRunner';
import { runCamera } from './cameraRunner';
import { runExport } from './exportRunner';
import { runPlay } from './playRunner';
import { runTimeline } from './timelineRunner';
import { applyStep, boundaryEdits, deepEqual, hasTiming, isTimingEdit, type DemoStep, type FieldEdit } from './plan';

/**
 * What each step does on screen, then its final write. A step whose UI flow is
 * not built yet only writes (routes, callouts, models, timeline, camera, play,
 * export in this pass), so a run always ends on the whole project.
 */

type StepOf<K extends DemoStep['kind']> = Extract<DemoStep, { kind: K }>;

/** Removes an item (one the UI made) from a project, without the store's side effects. */
function withoutItem(project: Project, id: string): Project {
  if (!project.items[id]) return project;
  const { [id]: _, ...items } = project.items;
  return { ...project, items, itemOrder: project.itemOrder.filter((i) => i !== id) };
}

/**
 * Writes the step's final result to the store in one step, the way a user's
 * edit lands in undo history. `replace` is an item the UI flow made for this
 * step: the file's item takes its place (the file's id, its timeline spot),
 * and stays selected when it was.
 */
export function commitStep(step: DemoStep, file: Project, { replace }: { replace?: string } = {}): void {
  const state = useProjectStore.getState();
  const before = pickProject(state);
  const base = replace && step.kind === 'item' && replace !== step.itemId ? withoutItem(before, replace) : before;
  let after = applyStep(base, step, file);
  // The clip keeps the timing the UI gave the item it made; the timeline step drags it to the file's.
  if (step.kind === 'item' && replace) {
    const made = before.items[replace];
    const placed = after.items[step.itemId];
    if (made && placed && hasTiming(made) && hasTiming(placed)) {
      after = { ...after, items: { ...after.items, [placed.id]: { ...placed, startTime: made.startTime, endTime: made.endTime } } };
    }
  }
  const patch: Partial<Project> = {};
  for (const key of Object.keys({ ...before, ...after }) as (keyof Project)[]) {
    if (!deepEqual(before[key], after[key])) (patch as Record<string, unknown>)[key] = after[key];
  }
  if (Object.keys(patch).length) useProjectStore.setState(patch);
  if (step.kind === 'item' && replace && state.selectedItemId === replace) {
    withoutHistory(() => useProjectStore.setState({ selectedItemId: step.itemId }));
  }
}

// --- map style and settings -------------------------------------------------------

/**
 * The map controls live in the toolbar on desktop, in the Map Display menu on
 * tablets, and on the Map Display bar of the phone's toolbar (behind the
 * inspector drawer, which closes first).
 */
async function reachMapControl(ctx: DemoContext, L: Locators, control: keyof Pick<Locators, 'mapStyleTrigger' | 'mapSettingsButton' | 'terrainToggle' | 'buildingsToggle'>): Promise<Element | null> {
  await closeInspectorDrawer(ctx, L);
  const direct = query(L[control]);
  if (direct) return direct;
  await showMainBar(ctx, L);
  if (query(L.mapToolsMenu)) await click(ctx, L.mapToolsMenu);
  return find(ctx, L[control], { timeout: 1500 });
}

async function runMapStyle(ctx: DemoContext, step: StepOf<'map-style'>, file: Project): Promise<void> {
  const L = currentLocators();
  const trigger = await reachMapControl(ctx, L, 'mapStyleTrigger');
  if (trigger && (await click(ctx, trigger))) {
    const label = getMapStyleDef(step.mapStyle)?.label ?? step.mapStyle;
    const picked = step.customStyle
      ? (await click(ctx, L.savedMapStyle(step.customStyle.name), { timeout: 800 })) || (await click(ctx, L.mapStyleOption(label)))
      : await click(ctx, L.mapStyleOption(label));
    if (!picked) warn(`map style ${label}: written directly`);
  }
  commitStep(step, file);
}

/** Opens the project settings panel (nothing selected) from the toolbar. */
async function openProjectSettings(ctx: DemoContext, L: Locators): Promise<boolean> {
  if (query(L.inspectorSection('project', 'video'))) return true;
  const button = await reachMapControl(ctx, L, 'mapSettingsButton');
  if (!button || !(await click(ctx, button))) return false;
  return !!(await find(ctx, L.inspectorSection('project', 'video'), { timeout: 2000 }));
}

/** A label switch is named by its group's label, which the loaded style reports. */
async function showLabelEdit(ctx: DemoContext, edit: FieldEdit): Promise<void> {
  const groupId = edit.path.slice('labelVisibility.'.length);
  const state = useProjectStore.getState();
  const group = state.detectedCapabilities?.labelGroups.find((g) => g.id === groupId);
  if (!group || (state.labelVisibility[groupId] ?? true) === edit.value) return;
  const section = await openSection(ctx, 'project', 'labels');
  if (section) await click(ctx, { label: group.label, role: 'switch', within: section });
}

async function runSettings(ctx: DemoContext, step: StepOf<'settings'>, file: Project): Promise<void> {
  const L = currentLocators();
  const project = () => pickProject(useProjectStore.getState());
  for (const edit of step.edits) {
    ctx.clock.check();
    if (edit.path === 'terrainEnabled' || edit.path === 'buildingsEnabled') {
      if (project()[edit.path] === edit.value) continue;
      const toggle = await reachMapControl(ctx, L, edit.path === 'terrainEnabled' ? 'terrainToggle' : 'buildingsToggle');
      if (toggle) await click(ctx, toggle);
      continue;
    }
    if (!(await openProjectSettings(ctx, L))) break;
    if (edit.path.startsWith('labelVisibility.')) await showLabelEdit(ctx, edit);
    else await showEdit(ctx, PROJECT_FIELDS, edit, project, file);
  }
  commitStep(step, file);
}

// --- boundaries -------------------------------------------------------------------

const isArea = (g: GeoJSON.Geometry | null): g is GeoJSON.Polygon | GeoJSON.MultiPolygon =>
  g?.type === 'Polygon' || g?.type === 'MultiPolygon';

const boundaryIds = () =>
  new Set(Object.values(useProjectStore.getState().items).filter((i) => i.kind === 'boundary').map((i) => i.id));

/**
 * Adds the boundary through the Add Boundary panel: search its name (the
 * search answers with the file's outline), pick the result, the detail level,
 * the panel's Flag and Dim switches, then Add. Returns the new item's id.
 */
async function addBoundaryOnScreen(ctx: DemoContext, item: BoundaryItem): Promise<string | null> {
  const L = currentLocators();
  if (!isArea(item.geojson)) {
    warn(`boundary ${item.placeName} has no area outline: written directly`);
    return null;
  }
  mockBoundarySearch(item.placeName, [{ displayName: item.placeName, geometry: item.geojson, countryCode: item.style.flagCode }]);
  const before = boundaryIds();

  if (!query(L.boundarySearchInput)) {
    await showAddBar(ctx, L);
    if (!(await click(ctx, L.addBoundaryButton))) return null;
  }
  if (!(await type(ctx, L.boundarySearchInput, item.placeName))) return null;
  if (!(await click(ctx, L.boundaryResult(item.placeName)))) return null;
  // The outline in the file was simplified already; the finest level keeps it as it is.
  const detailed = await find(ctx, L.boundaryDetail('Detailed'), { timeout: 1500 });
  if (detailed && detailed.getAttribute('aria-checked') !== 'true') await click(ctx, detailed);
  if (item.style.fillMode === 'flag' && item.style.flagCode) await click(ctx, L.addPanelSwitch('Flag'));
  if (item.style.maskOutside) await click(ctx, L.addPanelSwitch('Dim surroundings'));
  if (!(await click(ctx, L.addBoundaryConfirm))) return null;

  const added = [...boundaryIds()].find((id) => !before.has(id)) ?? null;
  if (!added) warn(`boundary ${item.placeName}: the Add panel did not add it`);
  return added;
}

/** Closes the Add Boundary panel if a flow left it open (Escape, as a user would). */
function closeAddPanel(L: Locators): void {
  const panel = query(L.addBoundaryPanel);
  if (panel) key(panel, 'Escape');
}

async function runBoundary(ctx: DemoContext, step: StepOf<'item'>, file: Project): Promise<void> {
  const target = file.items[step.itemId];
  if (target?.kind !== 'boundary') {
    commitStep(step, file);
    return;
  }
  const created = await addBoundaryOnScreen(ctx, target);
  if (!created) closeAddPanel(currentLocators());
  if (created) {
    await pause(ctx, ctx.timing.betweenSteps * 0.4);
    const live = () => {
      const item = useProjectStore.getState().items[created];
      return item?.kind === 'boundary' ? item : null;
    };
    // What the panel made, against the file: the edits left to show in the inspector.
    for (const edit of boundaryEdits(live() ?? target, target)) {
      ctx.clock.check();
      if (step.timing && isTimingEdit(edit)) continue;
      await showEdit(ctx, BOUNDARY_FIELDS, edit, live, target);
    }
  }
  commitStep(step, file, { replace: created ?? undefined });
  if (created) withoutHistory(() => useProjectStore.getState().selectItem(step.itemId));
}

// --- dispatch -------------------------------------------------------------------

/** Runs one step: its UI flow where built, then its final write. */
export async function runStep(ctx: DemoContext, step: DemoStep, file: Project): Promise<void> {
  switch (step.kind) {
    case 'map-style':
      return runMapStyle(ctx, step, file);
    case 'settings':
      return runSettings(ctx, step, file);
    case 'item':
      if (step.itemKind === 'boundary') return runBoundary(ctx, step, file);
      if (step.itemKind === 'callout') return runCallout(ctx, step, file);
      if (step.itemKind === 'model') return runModel(ctx, step, file);
      if (step.itemKind === 'route') return runRoute(ctx, step, file);
      commitStep(step, file);
      return;
    case 'timeline':
      return runTimeline(ctx, step, file);
    case 'camera':
      return runCamera(ctx, step, file);
    case 'play':
      return runPlay(ctx, step, file);
    case 'export':
      return runExport(ctx, step, file);
    default:
      commitStep(step, file);
  }
}
