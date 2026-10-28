import { z } from 'zod';
import {
  CUSTOM_STYLE_NAME_MAX,
  HEX_COLOR_PATTERN,
  MAP_COLOR_ROLE_IDS,
  STANDARD_THEMES,
  type CustomMapStyle,
  type MapColorRole,
} from './model';

const hexColorSchema = z.string().regex(HEX_COLOR_PATTERN);

/** Unknown roles are dropped, so a document from a newer build still loads. */
const colorsSchema = z.object(
  Object.fromEntries(MAP_COLOR_ROLE_IDS.map((role) => [role, hexColorSchema.optional()])) as Record<MapColorRole, z.ZodOptional<z.ZodString>>,
);

/** A custom map style as saved in a project or the saved-styles list. */
export const customMapStyleSchema = z.object({
  name: z.string().trim().min(1).max(CUSTOM_STYLE_NAME_MAX),
  colors: colorsSchema.transform((colors) => Object.fromEntries(
    Object.entries(colors).filter(([, color]) => color !== undefined),
  ) as CustomMapStyle['colors']),
  theme: z.enum(STANDARD_THEMES).catch('default').default('default'),
});
