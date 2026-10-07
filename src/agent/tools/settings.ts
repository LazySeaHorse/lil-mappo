import { z } from 'zod/v4';
import { LABEL_CATEGORIES, MAP_STYLES } from '@/config/mapbox';
import { getExportLimits } from '@/lib/cloudAccess';
import type { AspectRatio, ExportResolution } from '@/types/render';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { commitAiWrite } from '../commit';
import { useAgentStore } from '../store';
import { colorSchema } from './shared';
import { getState } from './shared';

const RESOLUTIONS = ['480p', '720p', '1080p', '1440p', '2160p'] as const satisfies readonly ExportResolution[];
const MAP_STYLE_KEYS = Object.keys(MAP_STYLES) as [string, ...string[]];
const LABEL_IDS = LABEL_CATEGORIES.map((c) => c.id);

const settingsShape = {
  name: z.string().min(1).max(120).describe('Project name.'),
  duration: z.number().min(1).max(3600).describe('Project length in seconds (min 1). Plan limits apply (free plans: 30s). Shortening does not delete items that run past the new end.'),
  fps: z.union([z.literal(30), z.literal(60)]).describe('Export frame rate: 30 or 60 (free plans: 30).'),
  aspectRatio: z.enum(['16:9', '21:9', '4:3', '1:1']).describe('Frame aspect ratio.'),
  exportResolution: z.enum(RESOLUTIONS).describe('Export height preset (free plans: up to 720p). Pixel size derives from this, aspectRatio and isVertical.'),
  isVertical: z.boolean().describe('Portrait orientation (e.g. 9:16 for a 16:9 setting).'),
  projection: z.enum(['globe', 'mercator']).describe('globe = 3D globe when zoomed out; mercator = flat map.'),
  lightPreset: z.enum(['day', 'night', 'dusk', 'dawn']).describe('Lighting for the Standard map style.'),
  starIntensity: z.number().min(0).max(1).describe('Stars visible around the globe, 0-1.'),
  fogColor: colorSchema.nullable().describe('Atmosphere/fog color, or null to use the style default.'),
  terrainExaggeration: z.number().min(1).max(3).describe('Terrain height multiplier 1-3 (needs terrainEnabled).'),
  mapStyle: z.enum(MAP_STYLE_KEYS).describe(`Base map style key: ${MAP_STYLE_KEYS.join(', ')}.`),
  terrainEnabled: z.boolean().describe('3D terrain.'),
  buildingsEnabled: z.boolean().describe('3D buildings (classic styles; Standard always has them).'),
  labelVisibility: z
    .strictObject(Object.fromEntries(LABEL_IDS.map((id) => [id, z.boolean().optional()])))
    .describe(`Show/hide label categories; partial. Keys: ${LABEL_IDS.join(', ')}. Not every style supports every category.`),
  show3dLandmarks: z.boolean().describe('3D landmark models (Standard style).'),
  show3dTrees: z.boolean().describe('3D trees (Standard style).'),
  show3dFacades: z.boolean().describe('Detailed building facades (Standard style).'),
};

export const updateProjectSettings = defineTool({
  name: 'update_project_settings',
  title: 'Update project settings',
  description:
    'Changes project-wide settings; only the fields you pass change. Project: name, duration (seconds), fps, aspectRatio, exportResolution, isVertical. ' +
    'Map look: mapStyle, projection, lightPreset, starIntensity, fogColor, terrainEnabled, terrainExaggeration, buildingsEnabled, labelVisibility (partial category map), show3dLandmarks/show3dTrees/show3dFacades. ' +
    'Valid keys and enums are listed by get_guide. Values beyond the user\'s plan limits (duration, fps, resolution) are rejected with plan_limit. Exact pixel size is derived automatically. One undo step. Returns each changed field as {from, to}.',
  input: z.strictObject(settingsShape).partial(),
  readOnly: false,
  handler: (patch) => {
    const fields = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
    if (!fields.length) throw new ToolError('empty_patch', 'No settings provided; pass at least one field.');

    const limits = useAgentStore.getState().exportLimits ?? getExportLimits(null);
    if (patch.duration !== undefined && patch.duration > limits.maxDuration) {
      throw new ToolError('plan_limit', `duration ${patch.duration}s exceeds the maximum for this plan (${limits.maxDuration}s).`, { maxDuration: limits.maxDuration });
    }
    if (patch.fps !== undefined && patch.fps > limits.maxFps) {
      throw new ToolError('plan_limit', `fps ${patch.fps} exceeds the maximum for this plan (${limits.maxFps}).`, { maxFps: limits.maxFps });
    }
    if (patch.exportResolution !== undefined && RESOLUTIONS.indexOf(patch.exportResolution) > RESOLUTIONS.indexOf(limits.maxResolution)) {
      throw new ToolError('plan_limit', `exportResolution ${patch.exportResolution} exceeds the maximum for this plan (${limits.maxResolution}).`, { maxResolution: limits.maxResolution });
    }

    const before = getState();
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    const track = (key: string, from: unknown, to: unknown) => {
      if (JSON.stringify(from) !== JSON.stringify(to)) changed[key] = { from, to };
    };
    const warnings: string[] = [];

    commitAiWrite(`AI: update project settings (${fields.join(', ')})`, () => {
      const s = getState();
      const start = { ...s };
      if (patch.name !== undefined) s.setProjectName(patch.name);
      if (patch.duration !== undefined) s.setDuration(patch.duration);
      if (patch.fps !== undefined) s.setFps(patch.fps);
      if (patch.aspectRatio !== undefined) s.setAspectRatio(patch.aspectRatio as AspectRatio);
      if (patch.exportResolution !== undefined) s.setExportResolution(patch.exportResolution);
      if (patch.isVertical !== undefined) s.setIsVertical(patch.isVertical);
      if (patch.projection !== undefined) s.setProjection(patch.projection);
      if (patch.lightPreset !== undefined) s.setLightPreset(patch.lightPreset);
      if (patch.starIntensity !== undefined) s.setAtmosphere({ starIntensity: patch.starIntensity });
      if (patch.fogColor !== undefined) s.setAtmosphere({ fogColor: patch.fogColor });
      if (patch.terrainExaggeration !== undefined) s.setTerrainExaggeration(patch.terrainExaggeration);
      if (patch.mapStyle !== undefined && patch.mapStyle !== start.mapStyle) s.setMapStyle(patch.mapStyle);
      if (patch.terrainEnabled !== undefined) s.setTerrainEnabled(patch.terrainEnabled);
      if (patch.buildingsEnabled !== undefined) s.setBuildingsEnabled(patch.buildingsEnabled);
      for (const [id, visible] of Object.entries(patch.labelVisibility ?? {})) {
        if (visible !== undefined) s.setLabelGroupVisibility(id, visible);
      }
      if (patch.show3dLandmarks !== undefined) s.set3dDetails('landmarks', patch.show3dLandmarks);
      if (patch.show3dTrees !== undefined) s.set3dDetails('trees', patch.show3dTrees);
      if (patch.show3dFacades !== undefined) s.set3dDetails('facades', patch.show3dFacades);
    });

    const after = getState();
    for (const key of fields) {
      if (key === 'labelVisibility') track(key, before.labelVisibility, after.labelVisibility);
      else track(key, (before as unknown as Record<string, unknown>)[key], (after as unknown as Record<string, unknown>)[key]);
    }
    if (changed.aspectRatio || changed.exportResolution || changed.isVertical) {
      track('resolution', before.resolution, after.resolution);
    }
    if (patch.duration !== undefined && patch.duration < before.duration) {
      const late = Object.values(after.items)
        .filter((i) => i.kind !== 'camera' && i.endTime > after.duration)
        .map((i) => i.id);
      if (late.length) warnings.push(`Items end after the new duration and will be cut off: ${late.join(', ')}. Use update_item to retime them.`);
    }

    return {
      data: { changed, ...(warnings.length ? { warnings } : {}) },
      summary: Object.keys(changed).length ? `Updated settings: ${Object.keys(changed).join(', ')}` : 'Settings already had those values',
    };
  },
});
