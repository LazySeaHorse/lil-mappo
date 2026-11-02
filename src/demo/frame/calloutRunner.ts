import { getAgentMap } from '@/agent/mapRef';
import { getStyle } from '@/annotations/registry';
import { scaleToSlider } from '@/annotations/inspector/sizeSlider';
import { useProjectStore } from '@/store/useProjectStore';
import { withoutHistory } from '@/store/history';
import type { CalloutItem, Project } from '@/store/types';
import { ACCENT_TERMS } from '@/lib/terms';
import { click, key, query, setSlider, type, warn, pause, type DemoContext } from './actions';
import { calloutEdits, calloutFields, CALLOUT_TEXT_FIELDS } from './calloutFields';
import { openSection, showEdit, type EditOutcome } from './edits';
import { currentLocators, type Locators } from './locators';
import { pickOnMap } from './mapPick';
import { mockPlaceSearch } from './mocks';
import { showAddBar } from './phone';
import { deepEqual, getPath, isTimingEdit, type DemoStep, type FieldEdit } from './plan';
import { commitStep } from './runners';

/**
 * The callout step on screen: the Add Callout panel (search the place, or pick
 * it on the map), Add, then the inspector: the style card, the text and each
 * field that differs from what Add made. Then the file's callout takes its
 * place, so the result is exactly the file's.
 */

type ItemStep = Extract<DemoStep, { kind: 'item' }>;

const calloutIds = () =>
  new Set(Object.values(useProjectStore.getState().items).filter((i) => i.kind === 'callout').map((i) => i.id));

/**
 * Adds the callout through the Add Callout panel. A callout the file named a
 * place for is searched (the search answers with the file's point); one with no
 * place name is picked on the map, as a user would to name no place. Returns
 * the new item's id.
 */
async function addCalloutOnScreen(ctx: DemoContext, item: CalloutItem): Promise<string | null> {
  const L = currentLocators();
  if (item.binding.kind !== 'geographic') {
    warn(`callout ${item.content.title} is not on the map: written directly`);
    return null;
  }
  const lngLat = item.binding.lngLat;
  const before = calloutIds();

  if (!query(L.calloutSearchInput)) {
    await showAddBar(ctx, L);
    if (!(await click(ctx, L.addCalloutButton))) return null;
  }
  // Without a live map there is nothing to click, so the title stands in as the place searched.
  const name = item.locationName || (getAgentMap() ? '' : item.content.title);
  if (name) {
    mockPlaceSearch(name, [{ name, coordinates: lngLat }]);
    if (!(await type(ctx, L.calloutSearchInput, name, { enter: true }))) return null;
    if (!(await click(ctx, L.placeResult(name)))) return null;
  } else if (!(await pickOnMap(ctx, L.pickOnMapButton(L.addCalloutPanel), lngLat))) {
    return null;
  }
  if (!(await click(ctx, L.addCalloutConfirm))) return null;

  const added = [...calloutIds()].find((id) => !before.has(id)) ?? null;
  if (!added) warn(`callout ${item.content.title}: the Add panel did not add it`);
  return added;
}

/** Closes the Add Callout panel if a flow left it open (Escape, as a user would). */
function closeAddPanel(L: Locators): void {
  const panel = query(L.addCalloutPanel);
  if (panel) key(panel, 'Escape');
}

/** Opens the style grid in the Style section and picks the style's card. */
async function changeStyle(ctx: DemoContext, styleId: string): Promise<void> {
  const style = getStyle(styleId);
  if (!style) return;
  const L = currentLocators();
  if (!(await openSection(ctx, 'callout', 'style'))) return;
  if (!(await click(ctx, L.styleChangeButton)) || !(await click(ctx, L.styleCard(style.name)))) {
    warn(`callout style ${style.name}: written directly`);
  }
}

/** Opens the "Customize colors" group of the Appearance section when it is closed. */
async function openCustomColors(ctx: DemoContext, section: Element): Promise<void> {
  const toggle = query(currentLocators().disclosureToggle(ACCENT_TERMS.customize, section));
  if (toggle?.getAttribute('data-state') === 'closed') await click(ctx, toggle);
}

/**
 * Shows one callout edit with the control that makes it. The rows that are not
 * a plain labelled control (the title, the text fields typed by name, the
 * log-scaled Size slider, the folded colors) are worked here; the rest by the
 * field table. 'written' means the step's final write sets it.
 */
async function showCalloutEdit(
  ctx: DemoContext,
  edit: FieldEdit,
  read: () => CalloutItem | null,
  target: CalloutItem,
): Promise<EditOutcome> {
  const live = read();
  if (!live) return 'written';
  if (deepEqual(getPath(live, edit.path), edit.value)) return 'already';
  const L = currentLocators();
  const style = getStyle(live.styleId);

  if (edit.path === 'content.title') {
    return (await type(ctx, L.inspectorTitleField('Callout title'), String(edit.value))) ? 'shown' : 'written';
  }

  const text = CALLOUT_TEXT_FIELDS[edit.path];
  if (text) {
    const metricPart = edit.path.startsWith('content.metric.') && edit.path !== 'content.metric.value';
    const usable = style?.contentSlots.includes(text.slot) && (typeof edit.value === 'string' || typeof edit.value === 'number');
    // A unit and a label belong to a number: they have a field only once the number is set.
    if (!usable || (metricPart && !live.content.metric)) return 'written';
    const section = await openSection(ctx, 'callout', 'content');
    if (!section) return 'written';
    const typed = await type(ctx, { role: 'textbox', name: text.name, within: section }, String(edit.value));
    return typed ? 'shown' : 'written';
  }

  if (edit.path === 'scale') {
    const section = await openSection(ctx, 'callout', 'size');
    if (!section) return 'written';
    return (await setSlider(ctx, { label: 'Size', role: 'slider', within: section }, Number(edit.value), { toSlider: scaleToSlider }))
      ? 'shown'
      : 'written';
  }

  const { table, folded } = calloutFields(live.styleId);
  if (folded.has(edit.path)) {
    const section = await openSection(ctx, 'callout', 'appearance');
    if (section) await openCustomColors(ctx, section);
  }
  return showEdit(ctx, table, edit, read, target);
}

export async function runCallout(ctx: DemoContext, step: ItemStep, file: Project): Promise<void> {
  const target = file.items[step.itemId];
  if (target?.kind !== 'callout') {
    commitStep(step, file);
    return;
  }
  const created = await addCalloutOnScreen(ctx, target);
  if (!created) closeAddPanel(currentLocators());
  if (created) {
    await pause(ctx, ctx.timing.betweenSteps * 0.4);
    const live = () => {
      const item = useProjectStore.getState().items[created];
      return item?.kind === 'callout' ? item : null;
    };
    // The style first: it resets the style's settings, which the rest then differ in.
    if (live() && live()!.styleId !== target.styleId) await changeStyle(ctx, target.styleId);
    // What Add made, against the file: the edits left to show in the inspector.
    for (const edit of calloutEdits(live() ?? target, target)) {
      ctx.clock.check();
      if (step.timing && isTimingEdit(edit)) continue;
      await showCalloutEdit(ctx, edit, live, target);
    }
  }
  commitStep(step, file, { replace: created ?? undefined });
  if (created) withoutHistory(() => useProjectStore.getState().selectItem(step.itemId));
}
