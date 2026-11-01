import { DEFAULT_COLOR_PRESETS, normalizeHex } from '@/components/ui/color-picker';
import { formatTimelineTime } from '@/components/Timeline/timelineTime';
import { flagName } from '@/components/MapViewport/runtime/flagImages';
import { click, find, key, pause, selectOption, setSlider, type, type DemoContext, type Locator } from './actions';
import type { FieldControl, FieldTable } from './fields';
import { currentLocators } from './locators';
import { deepEqual, getPath, type FieldEdit } from './plan';

/**
 * Shows one field edit on screen with the control that makes it: opens the
 * inspector section, finds the row by its label and works the control. The
 * store write is the control's own (the app's handlers), so it lands in undo
 * history like a user's edit.
 */

/** Opens a collapsed inspector section; resolves to the section, or null when it is not on screen. */
export async function openSection(ctx: DemoContext, kind: string, id: string): Promise<Element | null> {
  // Some sections show only for some styles (3D features, labels): not there means not shown.
  const section = await find(ctx, currentLocators().inspectorSection(kind as never, id), { timeout: 600, quiet: true });
  if (!section) return null;
  if (section.getAttribute('data-state') === 'closed') {
    const header = section.querySelector('h3 button[aria-expanded]');
    if (header) await click(ctx, header);
  }
  return section;
}

const isPresetColor = (value: string) => DEFAULT_COLOR_PRESETS.some((p) => normalizeHex(p) === normalizeHex(value));

async function editColor(ctx: DemoContext, row: Locator, value: unknown): Promise<boolean> {
  if (value === null) {
    // A colour that follows the map style (the fog's): its Reset button.
    return click(ctx, { ...row, role: 'button', name: 'Reset' });
  }
  const hex = normalizeHex(String(value));
  if (isPresetColor(hex)) return click(ctx, { ...row, role: 'button', name: `Select color ${hex}` });
  if (!(await click(ctx, { ...row, role: 'button', name: 'More colors' }))) return false;
  const typed = await type(ctx, { role: 'textbox', name: 'Hex color value' }, hex, { enter: true });
  // Escape closes the colour popover; Radix listens on the document.
  key(document.body, 'Escape');
  await pause(ctx, ctx.timing.afterClick * 0.5);
  return typed;
}

async function editFlag(ctx: DemoContext, scope: Element, code: unknown): Promise<boolean> {
  const name = flagName(typeof code === 'string' ? code : null);
  if (!name) return false;
  if (!(await click(ctx, { role: 'combobox', name: 'Country flag', within: scope }))) return false;
  if (!(await type(ctx, { selector: 'input[placeholder="Search countries"]' }, name))) return false;
  return click(ctx, { role: 'option', name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
}

/** Works one control; false when it could not be found or used. */
async function operate<T>(ctx: DemoContext, spec: FieldControl<T>, scope: Element, value: unknown, target: T): Promise<boolean> {
  const row: Locator = { label: spec.label, within: scope, description: `the ${spec.label} row` };
  switch (spec.control) {
    case 'color':
      return editColor(ctx, row, value);
    case 'slider':
      return setSlider(ctx, { ...row, role: 'slider' }, Number(value));
    case 'switch':
      return click(ctx, { ...row, role: 'switch' });
    case 'segmented':
      return click(ctx, { ...row, role: 'radio', name: spec.option!(value, target) });
    case 'cards':
      return click(ctx, { role: 'button', name: spec.option!(value, target), within: scope });
    case 'select':
      return selectOption(ctx, { ...row, role: 'combobox' }, spec.option!(value, target));
    case 'time':
      return type(ctx, { role: 'textbox', name: spec.label, within: scope }, formatTimelineTime(Number(value)), { enter: true });
    case 'text':
      return type(ctx, { ...row, role: 'textbox' }, String(value), { enter: true });
    case 'flag':
      return editFlag(ctx, scope, value);
  }
}

export type EditOutcome = 'shown' | 'already' | 'written';

/**
 * Shows `edit` on screen when its control is mapped and on screen. `read` gives
 * the live object (item or project) the paths point into, `target` the file's.
 * 'written' means it was not shown: the step's final write sets it.
 */
export async function showEdit<T>(
  ctx: DemoContext,
  table: FieldTable<T>,
  edit: FieldEdit,
  read: () => T | null,
  target: T,
): Promise<EditOutcome> {
  const spec = table.fields[edit.path];
  const live = read();
  if (!live) return 'written';
  const current = getPath(live, edit.path);
  if (deepEqual(current, edit.value) || spec?.same?.(current, edit.value)) return 'already';
  if (!spec || (spec.shown && !spec.shown(live, target))) return 'written';
  const section = await openSection(ctx, table.kind, spec.section);
  if (!section) return 'written';
  const ok = await operate(ctx, spec, section, edit.value, target);
  if (ok) await pause(ctx, ctx.timing.inspectorEdit * 0.3);
  return ok ? 'shown' : 'written';
}
