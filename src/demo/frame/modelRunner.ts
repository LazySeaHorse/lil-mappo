import { getAgentMap } from '@/agent/mapRef';
import { useProjectStore } from '@/store/useProjectStore';
import { withoutHistory } from '@/store/history';
import { referencedModelIds } from '@/store/modelAssets';
import type { ModelAsset, ModelItem, Project } from '@/store/types';
import { VEHICLE_SCALE_RANGE } from '@/config/vehicles';
import { MODEL_TERMS } from '@/models/modelTerms';
import { startingModelScale } from '@/models/modelImport';
import { click, find, key, pause, query, type, warn, type DemoContext } from './actions';
import { showEdit, openSection, type EditOutcome } from './edits';
import { currentLocators, type Locators } from './locators';
import { pickOnMap } from './mapPick';
import { showAddBar } from './phone';
import { MODEL_FIELDS, modelEdits } from './modelFields';
import { deepEqual, getPath, isTimingEdit, type DemoStep, type FieldEdit } from './plan';
import { commitStep } from './runners';
import { dragSlider } from './sliderDrag';
import { relinkedModelFile } from './session';

/**
 * The 3D model step on screen: the toolbar's model button, the popup. The
 * model's file is the one the owner relinked in the widget; there is no OS
 * file dialog to drive, so the Upload button is clicked (its dialog blocked)
 * and the held file goes to the same input a picked file would arrive in. A
 * model the project already has is picked from the popup's list. Then the
 * place step (pick the spot on the map, size), Add, and the inspector for the
 * rest. Last, the file's model takes the added one's place.
 */

type ItemStep = Extract<DemoStep, { kind: 'item' }>;

const modelIds = () =>
  new Set(Object.values(useProjectStore.getState().items).filter((i) => i.kind === 'model').map((i) => i.id));

/** The Size slider runs over ln(size), as SliderRow's logarithmic slider does. */
const sizeToSlider = (size: number) => Math.log(Math.max(VEHICLE_SCALE_RANGE.custom.min, size));

/** Whether two sizes are the same to the eye, which the slider's step cannot hit exactly. */
const closeSize = (a: number, b: number) => Math.abs(a / b - 1) < 0.02;

/** Hands a file to a file input the way picking it does: its files, then a change event. */
function handFile(input: HTMLInputElement, file: File): void {
  let set = false;
  if (typeof DataTransfer === 'function') {
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      set = true;
    } catch {
      // Fall through to the property below.
    }
  }
  if (!set) Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Clicks Upload without opening the browser's file dialog (the click on the
 * hidden input is cancelled), then gives the held file to that input.
 */
async function uploadHeldFile(ctx: DemoContext, L: Locators, file: File): Promise<boolean> {
  const blockChooser = (event: Event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'file') event.preventDefault();
  };
  document.addEventListener('click', blockChooser, true);
  let clicked: boolean;
  try {
    clicked = await click(ctx, L.modelUploadButton);
  } finally {
    document.removeEventListener('click', blockChooser, true);
  }
  if (!clicked) return false;
  // The time a person takes in the file dialog.
  await pause(ctx, ctx.timing.betweenSteps * 0.8);
  const input = query(L.modelDialog)?.querySelector<HTMLInputElement>(L.modelFileInputSelector);
  if (!input) {
    warn('3D model: the popup has no file input');
    return false;
  }
  handFile(input, file);
  return true;
}

/**
 * Adds the model through the popup. Returns the new item's id, or null when the
 * model's file is not available (or a control is missing): written directly.
 */
async function addModelOnScreen(ctx: DemoContext, target: ModelItem, asset: ModelAsset | undefined): Promise<string | null> {
  const L = currentLocators();
  const inProject = useProjectStore.getState().models[target.assetId];
  const held = relinkedModelFile(target.assetId);
  if (!inProject && !held) {
    warn(`3D model ${target.name}: its file was not relinked, written directly`);
    return null;
  }
  const before = modelIds();

  if (!query(L.modelDialog)) {
    await showAddBar(ctx, L);
    if (!(await click(ctx, L.modelButton))) return null;
  }
  if (!(await find(ctx, L.modelDialog))) return null;
  if (inProject) {
    if (!(await click(ctx, L.modelListRow(inProject.fileName)))) return null;
  } else if (!(await uploadHeldFile(ctx, L, held!))) {
    return null;
  }

  // The place step: its Add button shows once the file has been read.
  if (!(await find(ctx, L.modelAddButton, { timeout: 10_000 }))) return null;
  await pause(ctx, ctx.timing.betweenSteps * 0.4);
  if (getAgentMap() && !(await pickOnMap(ctx, L.pickOnMapButton(L.modelDialog), target.position))) {
    warn(`3D model ${target.name}: could not pick its place on the map`);
  }
  const startScale = startingModelScale((inProject ?? asset)?.bounds ?? { min: [0, 0, 0], max: [1, 1, 1] });
  if (!closeSize(startScale, target.scale)) {
    const slider = { label: MODEL_TERMS.size, role: 'slider', within: L.modelDialog } as const;
    await dragSlider(ctx, slider, target.scale, { toSlider: sizeToSlider });
  }
  if (!(await click(ctx, L.modelAddButton))) return null;

  const added = [...modelIds()].find((id) => !before.has(id)) ?? null;
  if (!added) warn(`3D model ${target.name}: the popup did not add it`);
  return added;
}

/** Closes the popup if a flow left it open (Escape, as a user would). */
function closeModelDialog(L: Locators): void {
  const dialog = query(L.modelDialog);
  if (dialog) key(dialog, 'Escape');
}

/** Shows one model edit with the control that makes it; 'written' means the final write sets it. */
async function showModelEdit(
  ctx: DemoContext,
  edit: FieldEdit,
  read: () => ModelItem | null,
  target: ModelItem,
): Promise<EditOutcome> {
  const live = read();
  if (!live) return 'written';
  if (deepEqual(getPath(live, edit.path), edit.value)) return 'already';
  // The place step set the size to within a slider step.
  if (edit.path === 'scale' && closeSize(live.scale, target.scale)) return 'already';
  const L = currentLocators();

  if (edit.path === 'name') {
    return (await type(ctx, L.inspectorTitleField('Model name'), String(edit.value))) ? 'shown' : 'written';
  }
  if (edit.path === 'scale') {
    const section = await openSection(ctx, 'model', 'size');
    if (!section) return 'written';
    const slider = { label: MODEL_TERMS.size, role: 'slider', within: section } as const;
    return (await dragSlider(ctx, slider, Number(edit.value), { toSlider: sizeToSlider })) ? 'shown' : 'written';
  }
  return showEdit(ctx, MODEL_FIELDS, edit, read, target);
}

/** Drops the asset the app's import made, which nothing uses once the file's item (and asset) took over. */
function dropStrayAssets(file: Project): void {
  const { items, models } = useProjectStore.getState();
  const used = referencedModelIds(items);
  const stray = Object.keys(models).filter((id) => !used.has(id) && !file.models[id]);
  if (!stray.length) return;
  withoutHistory(() => useProjectStore.setState({ models: Object.fromEntries(Object.entries(models).filter(([id]) => !stray.includes(id))) }));
}

export async function runModel(ctx: DemoContext, step: ItemStep, file: Project): Promise<void> {
  const target = file.items[step.itemId];
  if (target?.kind !== 'model') {
    commitStep(step, file);
    return;
  }
  const created = await addModelOnScreen(ctx, target, file.models[target.assetId]);
  if (!created) closeModelDialog(currentLocators());
  if (created) {
    await pause(ctx, ctx.timing.betweenSteps * 0.4);
    const live = () => {
      const item = useProjectStore.getState().items[created];
      return item?.kind === 'model' ? item : null;
    };
    // What the popup made, against the file: the edits left to show in the inspector.
    for (const edit of modelEdits(live() ?? target, target)) {
      ctx.clock.check();
      if (step.timing && isTimingEdit(edit)) continue;
      await showModelEdit(ctx, edit, live, target);
    }
  }
  commitStep(step, file, { replace: created ?? undefined });
  if (created) {
    dropStrayAssets(file);
    withoutHistory(() => useProjectStore.getState().selectItem(step.itemId));
  }
}
