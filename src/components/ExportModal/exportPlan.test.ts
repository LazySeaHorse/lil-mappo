import type { ExportLimits } from '@/lib/cloudAccess';
import type { RenderConfig } from '@/types/render';
import { createEndpointRouteItem, createModelItem, createWalkRouteItem } from '@/store/itemFactories';
import type { RouteItem, RouteVehicleConfig, TimelineItem } from '@/store/types';
import { proContentNeeds, resolveExportPlan, wandererNeeds } from './exportPlan';

const requestedConfig: RenderConfig = {
  resolution: [3840, 2160],
  fps: 60,
  aspectRatio: '16:9',
  exportResolution: '2160p',
  isVertical: false,
};

describe('resolveExportPlan', () => {
  it('clamps all settings to the active tier in one snapshot', () => {
    const limits: ExportLimits = {
      maxDuration: 30,
      maxResolution: '720p',
      maxFps: 30,
      limited: true,
    };

    const plan = resolveExportPlan(
      requestedConfig,
      { startTime: 4, endTime: 90 },
      limits,
    );

    expect(plan).toMatchObject({
      startTime: 4,
      endTime: 30,
      renderConfig: {
        exportResolution: '720p',
        fps: 30,
        resolution: [1280, 720],
      },
    });
  });

  it('preserves settings that are within the active tier', () => {
    const limits: ExportLimits = {
      maxDuration: Infinity,
      maxResolution: '2160p',
      maxFps: 60,
      limited: false,
    };

    const plan = resolveExportPlan(
      requestedConfig,
      { startTime: 2, endTime: 45 },
      limits,
    );

    expect(plan.renderConfig.exportResolution).toBe('2160p');
    expect(plan.renderConfig.fps).toBe(60);
    expect(plan.renderConfig.resolution).toEqual([3840, 2160]);
    expect(plan.endTime).toBe(45);
  });
});

describe('wandererNeeds', () => {
  const free: ExportLimits = { maxDuration: 30, maxResolution: '720p', maxFps: 30, limited: true };
  const paid: ExportLimits = { maxDuration: 300, maxResolution: '2160p', maxFps: 60, limited: false };
  const at = (exportResolution: RenderConfig['exportResolution'], fps: 30 | 60): RenderConfig => ({ ...requestedConfig, exportResolution, fps });

  it('lists each picked setting that is past the free plan', () => {
    expect(wandererNeeds(at('1080p', 30), { startTime: 0, endTime: 12 }, free)).toEqual(['resolution']);
    expect(wandererNeeds(at('720p', 60), { startTime: 0, endTime: 12 }, free)).toEqual(['fps']);
    expect(wandererNeeds(at('720p', 30), { startTime: 0, endTime: 45 }, free)).toEqual(['duration']);
    expect(wandererNeeds(at('2160p', 60), { startTime: 0, endTime: 45 }, free)).toEqual(['resolution', 'fps', 'duration']);
  });

  it('needs nothing when the picks fit the plan', () => {
    expect(wandererNeeds(at('720p', 30), { startTime: 0, endTime: 30 }, free)).toEqual([]);
    expect(wandererNeeds(at('2160p', 60), { startTime: 0, endTime: 200 }, paid)).toEqual([]);
  });
});

const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const route = (vehicle: Partial<RouteVehicleConfig> | null, mode: 'car' | 'flight' = 'car'): RouteItem => {
  const item = createEndpointRouteItem({ mode, start: [0, 0], end: [1, 1], name: 'Route', startTime: 0, geojson });
  if (item.calculation && vehicle) item.calculation.vehicle = { enabled: true, type: 'dot', modelId: '', scale: 1, ...vehicle };
  if (item.calculation && !vehicle) delete item.calculation.vehicle;
  return item;
};

describe('proContentNeeds', () => {
  it('needs nothing for a project of free content', () => {
    const walk = createWalkRouteItem({ points: [[0, 0], [1, 1]], startTime: 0 });
    expect(proContentNeeds([])).toEqual([]);
    expect(proContentNeeds([walk, route({ type: 'dot' }), route(null)])).toEqual([]);
  });

  it('asks for Wanderer for a placed model', () => {
    const model = createModelItem({ assetId: 'a', name: 'Tower', position: [0, 0], startTime: 0 });
    expect(proContentNeeds([model])).toEqual(['models']);
  });

  it('asks for Wanderer for car and plane markers, but only while they are switched on', () => {
    expect(proContentNeeds([route({ type: 'car' })])).toEqual(['vehicles']);
    expect(proContentNeeds([route({ type: 'plane' }, 'flight')])).toEqual(['vehicles']);
    expect(proContentNeeds([route({ type: 'plane', enabled: false }, 'flight')])).toEqual([]);
  });

  it('asks for Wanderer for a route that rides an imported model', () => {
    expect(proContentNeeds([route({ type: 'custom', modelId: 'a' })])).toEqual(['modelMarkers']);
  });

  it('lists each kind once, whatever the number of items', () => {
    const items: TimelineItem[] = [
      route({ type: 'plane' }, 'flight'),
      route({ type: 'car' }),
      route({ type: 'custom', modelId: 'a' }),
      createModelItem({ assetId: 'a', name: 'A', position: [0, 0], startTime: 0 }),
      createModelItem({ assetId: 'a', name: 'B', position: [1, 1], startTime: 1 }),
    ];
    expect(proContentNeeds(items)).toEqual(['models', 'modelMarkers', 'vehicles']);
  });
});

describe('wandererNeeds with project content', () => {
  const free: ExportLimits = { maxDuration: 30, maxResolution: '720p', maxFps: 30, limited: true };
  const paid: ExportLimits = { maxDuration: 300, maxResolution: '2160p', maxFps: 60, limited: false };
  const settings: RenderConfig = { ...requestedConfig, exportResolution: '720p', fps: 30 };

  it('adds the Pro content to the settings that are past the plan', () => {
    expect(wandererNeeds(settings, { startTime: 0, endTime: 12 }, free, ['models'])).toEqual(['models']);
    expect(wandererNeeds({ ...settings, fps: 60 }, { startTime: 0, endTime: 12 }, free, ['vehicles', 'models'])).toEqual([
      'fps',
      'vehicles',
      'models',
    ]);
  });

  it('is unchanged when the project has no Pro content', () => {
    expect(wandererNeeds(settings, { startTime: 0, endTime: 12 }, free, [])).toEqual([]);
    expect(wandererNeeds(settings, { startTime: 0, endTime: 12 }, paid)).toEqual([]);
  });
});
