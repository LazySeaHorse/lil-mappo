import { z } from 'zod/v4';
import { MAP_STYLES, isStandardBasemap } from '@/config/mapbox';
import {
  CUSTOM_STYLE_NAME_MAX,
  HEX_COLOR_PATTERN,
  MAP_COLOR_ROLES,
  MAP_COLOR_ROLE_IDS,
  STANDARD_THEMES,
  type CustomMapStyle,
  type MapColorRole,
} from '@/customMapStyles/model';
import { useSavedMapStyles, type SavedMapStyle } from '@/customMapStyles/savedStyles';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { commitAiWrite } from '../commit';
import { useAgentStore } from '../store';
import { getState } from './shared';

const MAP_STYLE_KEYS = Object.keys(MAP_STYLES) as [string, ...string[]];
const DEFAULT_STYLE_NAME = 'Custom style';

const hexSchema = z.string().regex(HEX_COLOR_PATTERN, 'Use #rrggbb.');

const colorsSchema = z.strictObject(Object.fromEntries(MAP_COLOR_ROLE_IDS.map((role) => [
  role,
  hexSchema.nullable().optional().describe(`${MAP_COLOR_ROLES[role]} null removes the colour.`),
])) as Record<MapColorRole, z.ZodOptional<z.ZodNullable<z.ZodString>>>);

function requirePaidPlan(): void {
  if (!useAgentStore.getState().paidPlan) {
    throw new ToolError('plan_limit', 'Custom map styles need a paid plan (Wanderer or a Pro pass).');
  }
}

/** The colour roles the current style can show, or null while it loads. */
export function currentColorRoles(): readonly MapColorRole[] | null {
  const s = getState();
  if (isStandardBasemap(s.mapStyle)) return MAP_COLOR_ROLE_IDS;
  return s.detectedCapabilities?.colorRoles ?? null;
}

function mapStyleView() {
  const s = getState();
  return { mapStyle: s.mapStyle, customStyle: s.customStyle, colorRoles: currentColorRoles() };
}

function savedView(saved: SavedMapStyle) {
  return { id: saved.id, name: saved.style.name, baseStyle: saved.mapStyle, colors: saved.style.colors, theme: saved.style.theme, savedAt: saved.savedAt };
}

export const setCustomMapStyle = defineTool({
  name: 'set_custom_map_style',
  title: 'Set custom map style',
  description:
    'Makes the map a custom style: a built-in style (baseStyle) with your colours for some of its parts (paid plans). ' +
    'Colours are #rrggbb per role; a role you never set keeps the built-in colour. Calls add to the current custom style (same base): pass only what changes, null removes a colour, reset starts again from the plain base (keeping the name). ' +
    'theme (default | faded | monochrome) is Mapbox Standard\'s grade over the whole map, your colours included (monochrome is grey); keep default for exact colours. Standard follows every role, other styles only the ones they draw. ' +
    'Returns the custom style and colorRoles, the roles this base style can show (null while it loads; get_project has it then). Look at the result with render_frames. One undo step. update_project_settings mapStyle goes back to a plain built-in style.',
  input: z.strictObject({
    name: z.string().trim().min(1).max(CUSTOM_STYLE_NAME_MAX).optional().describe('Name shown in the style picker. Default: the current custom style\'s name, or "Custom style".'),
    baseStyle: z.enum(MAP_STYLE_KEYS).optional().describe(`Built-in style to draw over: ${MAP_STYLE_KEYS.join(', ')}. Default: the current one. Changing it starts a new custom style.`),
    colors: colorsSchema.optional().describe('Colours by role, #rrggbb.'),
    theme: z.enum(STANDARD_THEMES).optional().describe('Standard style only.'),
    reset: z.boolean().optional().describe('Drop the current custom colours and theme first (the name stays), so only this call\'s apply.'),
  }),
  readOnly: false,
  handler: (input) => {
    requirePaidPlan();
    if (!Object.values(input).some((value) => value !== undefined)) {
      throw new ToolError('empty_patch', 'Nothing to change; pass colors, theme, name, baseStyle or reset.');
    }
    const s = getState();
    const base = input.baseStyle ?? s.mapStyle;
    const current = base === s.mapStyle ? s.customStyle : null;
    const previous = input.reset ? null : current;
    const colors: CustomMapStyle['colors'] = { ...previous?.colors };
    for (const role of MAP_COLOR_ROLE_IDS) {
      const color = input.colors?.[role];
      if (color === null) delete colors[role];
      else if (color !== undefined) colors[role] = color.toLowerCase();
    }
    const style: CustomMapStyle = {
      name: input.name ?? current?.name ?? DEFAULT_STYLE_NAME,
      colors,
      theme: input.theme ?? previous?.theme ?? 'default',
    };
    commitAiWrite(`AI: set custom map style (${style.name})`, () => s.setMapStyle(base, style));

    const view = mapStyleView();
    const warnings: string[] = [];
    if (input.theme && !isStandardBasemap(base)) warnings.push(`theme only changes the Standard style; ${base} ignores it.`);
    if (view.colorRoles) {
      const unseen = Object.keys(colors).filter((role) => !view.colorRoles!.includes(role as MapColorRole));
      if (unseen.length) warnings.push(`${base} has nothing to paint for: ${unseen.join(', ')}.`);
    }
    return { data: { ...view, ...(warnings.length ? { warnings } : {}) }, summary: `Set custom map style "${style.name}"` };
  },
});

export const saveMapStyle = defineTool({
  name: 'save_map_style',
  title: 'Save map style',
  description:
    'Saves the project\'s custom map style under its name, so the user can pick it in the style picker for any project (paid plans). Saving under a name already saved replaces that saved style. ' +
    'Rename first with set_custom_map_style { name }. Saved styles live in this browser. Not part of undo.',
  input: z.strictObject({}),
  readOnly: false,
  handler: () => {
    requirePaidPlan();
    const { mapStyle, customStyle } = getState();
    if (!customStyle) {
      throw new ToolError('no_custom_style', 'The project has no custom map style to save. Make one with set_custom_map_style first.');
    }
    const saved = useSavedMapStyles.getState();
    const replaced = saved.styles.some((s) => s.style.name.trim().toLowerCase() === customStyle.name.trim().toLowerCase());
    const entry = saved.save(mapStyle, customStyle);
    return { data: { saved: savedView(entry), replaced }, summary: `Saved map style "${customStyle.name}"` };
  },
});

export const listSavedMapStyles = defineTool({
  name: 'list_saved_map_styles',
  title: 'List saved map styles',
  description: 'Lists the map styles the user saved (paid plans), newest first: id, name, baseStyle, colors, theme, savedAt. Apply one with apply_saved_map_style.',
  input: z.strictObject({}),
  readOnly: true,
  handler: () => {
    requirePaidPlan();
    const styles = useSavedMapStyles.getState().styles.map(savedView);
    return { data: { styles }, summary: `Listed saved map styles (${styles.length})` };
  },
});

export const applySavedMapStyle = defineTool({
  name: 'apply_saved_map_style',
  title: 'Apply saved map style',
  description: 'Makes a saved map style (id from list_saved_map_styles) the project\'s map style, base style included (paid plans). One undo step.',
  input: z.strictObject({ id: z.string().min(1).describe('Saved style id.') }),
  readOnly: false,
  handler: ({ id }) => {
    requirePaidPlan();
    const { styles } = useSavedMapStyles.getState();
    const saved = styles.find((s) => s.id === id);
    if (!saved) {
      throw new ToolError('saved_style_not_found', `No saved map style with id "${id}". Call list_saved_map_styles.`, { knownIds: styles.map((s) => s.id) });
    }
    commitAiWrite(`AI: apply map style (${saved.style.name})`, () => getState().setMapStyle(saved.mapStyle, saved.style));
    return { data: mapStyleView(), summary: `Applied map style "${saved.style.name}"` };
  },
});
